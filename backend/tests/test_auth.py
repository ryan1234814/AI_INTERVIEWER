"""Auth + per-user data isolation tests.

These run through the real FastAPI app with `get_db` overridden onto a throwaway
sqlite file, so the HTTP layer (dependencies, status codes, serialization) is
exercised rather than the route functions in isolation.
"""

import json
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database import crud, models
from app.database.base import Base
from app.database.session import get_db
from app.main import app
from app.utils import rate_limit as rate_limit_module
from app.utils.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)

PASSWORD = "password123"


@pytest.fixture
def db_session(tmp_path):
    engine = create_engine(
        f"sqlite:///{tmp_path / 'auth_test.db'}",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)
    session = Session()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


@pytest.fixture
def client(db_session):
    def override_get_db():
        # Yield the same session: TestClient and the test body then share state.
        yield db_session

    original_limit = settings.AUTH_RATE_LIMIT_PER_MINUTE
    settings.AUTH_RATE_LIMIT_PER_MINUTE = 1000
    rate_limit_module.reset()
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.pop(get_db, None)
    settings.AUTH_RATE_LIMIT_PER_MINUTE = original_limit
    rate_limit_module.reset()


def signup(client, email, name="Test User", password=PASSWORD):
    return client.post(
        "/api/v1/auth/signup",
        json={"name": name, "email": email, "password": password},
    )


def auth_header(token):
    return {"Authorization": f"Bearer {token}"}


# ─── password + token primitives ─────────────────────────────────────────────

def test_hash_password_is_salted_and_verifiable():
    hashed = hash_password(PASSWORD)
    assert hashed != PASSWORD
    assert hashed.startswith("$2b$"), "bcrypt hash expected"
    assert hash_password(PASSWORD) != hashed, "salt must vary per hash"
    assert verify_password(PASSWORD, hashed)
    assert not verify_password("wrong-password", hashed)


def test_verify_password_survives_a_malformed_hash():
    assert verify_password("anything", "not-a-bcrypt-hash") is False


def test_access_token_roundtrip_and_tampering():
    token = create_access_token({"sub": "7", "email": "a@b.com"})
    claims = decode_token(token)

    assert claims["sub"] == "7"
    assert claims["email"] == "a@b.com"
    assert claims["exp"] > datetime.now(timezone.utc).timestamp(), "token must carry an expiry"

    assert decode_token("garbage.token.value") is None
    # A token whose signature has been altered must not decode.
    assert decode_token(token[:-2] + "xy") is None


# ─── signup ──────────────────────────────────────────────────────────────────

def test_signup_returns_token_and_user_without_leaking_hash(client):
    response = signup(client, "test@test.com")

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]

    user = body["user"]
    assert user["id"] > 0
    assert user["name"] == "Test User"
    assert user["email"] == "test@test.com"
    assert user["created_at"]
    assert set(user) == {"id", "name", "email", "created_at"}, "no extra fields may leak"
    assert "hashed_password" not in json.dumps(body)


def test_signup_normalizes_email_and_rejects_duplicates(client):
    assert signup(client, "  MixedCase@Example.COM ").status_code == 201

    duplicate = signup(client, "mixedcase@example.com")
    assert duplicate.status_code == 400
    assert "already exists" in duplicate.json()["detail"]


def test_signup_validation(client):
    assert signup(client, "test@test.com", password="short1").status_code == 422
    assert signup(client, "not-an-email", password="password123").status_code == 422
    assert signup(client, "a@b.co", name="   ", password="password123").status_code == 422
    # bcrypt truncates past 72 bytes, so longer passwords are rejected outright.
    assert signup(client, "long@a.co", password="p" * 73).status_code == 422


def test_password_is_never_stored_in_plaintext(client, db_session):
    signup(client, "hashcheck@test.com")
    user = crud.get_user_by_email(db_session, "hashcheck@test.com")
    assert user.hashed_password != PASSWORD
    assert verify_password(PASSWORD, user.hashed_password)


# ─── login ───────────────────────────────────────────────────────────────────

def test_login_accepts_json_and_oauth2_form(client):
    signup(client, "form@test.com")

    json_login = client.post(
        "/api/v1/auth/login",
        json={"email": "form@test.com", "password": PASSWORD},
    )
    assert json_login.status_code == 200, json_login.text
    assert json_login.json()["user"]["email"] == "form@test.com"

    form_login = client.post(
        "/api/v1/auth/login",
        data={"username": "form@test.com", "password": PASSWORD},
    )
    assert form_login.status_code == 200, form_login.text
    assert form_login.json()["access_token"]


def test_login_rejects_wrong_password_and_unknown_email(client):
    signup(client, "known@test.com")

    wrong = client.post(
        "/api/v1/auth/login", json={"email": "known@test.com", "password": "nope12345"}
    )
    assert wrong.status_code == 401

    unknown = client.post(
        "/api/v1/auth/login", json={"email": "ghost@test.com", "password": "nope12345"}
    )
    assert unknown.status_code == 401

    missing = client.post("/api/v1/auth/login", json={"email": "known@test.com"})
    assert missing.status_code == 422


# ─── /me ─────────────────────────────────────────────────────────────────────

def test_me_requires_a_valid_token(client):
    token = signup(client, "me@test.com").json()["access_token"]

    assert client.get("/api/v1/auth/me").status_code == 401

    response = client.get("/api/v1/auth/me", headers=auth_header(token))
    assert response.status_code == 200
    assert response.json() == {
        "id": response.json()["id"],
        "name": "Test User",
        "email": "me@test.com",
        "created_at": response.json()["created_at"],
    }

    assert client.get("/api/v1/auth/me", headers=auth_header("not.a.jwt")).status_code == 401

    # A well-formed token for a user that no longer exists must not authenticate.
    orphan = create_access_token({"sub": "999999"})
    assert client.get("/api/v1/auth/me", headers=auth_header(orphan)).status_code == 401


# ─── per-user data isolation ─────────────────────────────────────────────────

@pytest.fixture
def two_users(client, db_session):
    alice = signup(client, "alice@test.com", name="Alice").json()
    bob = signup(client, "bob@test.com", name="Bob").json()

    job_a = crud.create_job_description(db_session, "A Job", "desc", ["x"], user_id=alice["user"]["id"])
    job_b = crud.create_job_description(db_session, "B Job", "desc", ["y"], user_id=bob["user"]["id"])
    cand_a = crud.create_candidate(db_session, "Alice C", "alice@corp.com", "/tmp/a.pdf", [], "", user_id=alice["user"]["id"])
    cand_b = crud.create_candidate(db_session, "Bob C", "bob@corp.com", "/tmp/b.pdf", [], "", user_id=bob["user"]["id"])

    iv_a = crud.create_interview(db_session, job_a.id, cand_a.id, total_questions=2, planned_questions=["q1", "q2"], user_id=alice["user"]["id"])
    iv_b = crud.create_interview(db_session, job_b.id, cand_b.id, total_questions=2, planned_questions=["q1", "q2"], user_id=bob["user"]["id"])
    # A row that predates authentication.
    legacy_job = crud.create_job_description(db_session, "Legacy Job", "desc", [])
    legacy_cand = crud.create_candidate(db_session, "Legacy", "legacy@corp.com", "/tmp/l.pdf", [], "")
    legacy = crud.create_interview(db_session, legacy_job.id, legacy_cand.id, total_questions=2)
    db_session.commit()
    return {"alice": alice, "bob": bob, "iv_a": iv_a, "iv_b": iv_b, "legacy": legacy}


def test_interview_list_is_scoped_to_the_owner(client, two_users):
    alice_ids = [i["id"] for i in client.get(
        "/api/v1/interviews/", headers=auth_header(two_users["alice"]["access_token"])
    ).json()["interviews"]]
    bob_ids = [i["id"] for i in client.get(
        "/api/v1/interviews/", headers=auth_header(two_users["bob"]["access_token"])
    ).json()["interviews"]]

    assert alice_ids == [two_users["iv_a"].id]
    assert bob_ids == [two_users["iv_b"].id]
    assert set(alice_ids).isdisjoint(bob_ids), "users must not see each other's interviews"


def test_interview_list_requires_authentication(client, two_users):
    assert client.get("/api/v1/interviews/").status_code == 401


def test_fetching_another_users_interview_is_forbidden(client, two_users):
    alice_token = two_users["alice"]["access_token"]

    mine = client.get(f"/api/v1/interviews/{two_users['iv_a'].id}", headers=auth_header(alice_token))
    assert mine.status_code == 200
    assert mine.json()["candidate"]["name"] == "Alice C"

    theirs = client.get(f"/api/v1/interviews/{two_users['iv_b'].id}", headers=auth_header(alice_token))
    assert theirs.status_code == 403

    legacy = client.get(f"/api/v1/interviews/{two_users['legacy'].id}", headers=auth_header(alice_token))
    assert legacy.status_code == 403, "pre-auth rows stay private to every account"


def test_respond_and_complete_check_ownership(client, two_users):
    alice_token = auth_header(two_users["alice"]["access_token"])
    bob_id = two_users["iv_b"].id

    respond = client.post(
        f"/api/v1/interviews/{bob_id}/respond",
        headers=alice_token,
        data={"question_text": "q1", "candidate_response": "stolen"},
    )
    assert respond.status_code == 403

    complete = client.post(f"/api/v1/interviews/{bob_id}/complete", headers=alice_token)
    assert complete.status_code == 403

    report = client.post(f"/api/v1/interviews/{bob_id}/complete", headers=auth_header(
        two_users["bob"]["access_token"]
    ))
    assert report.status_code == 200


def test_jobs_and_candidates_endpoints_are_scoped(client, two_users):
    alice = auth_header(two_users["alice"]["access_token"])

    jobs = client.get("/api/v1/jobs/", headers=alice).json()["jobs"]
    assert [j["title"] for j in jobs] == ["A Job"]

    candidates = client.get("/api/v1/candidates/", headers=alice).json()["candidates"]
    assert [c["email"] for c in candidates] == ["alice@corp.com"]
    assert "resume_path" not in candidates[0]

    assert client.get("/api/v1/jobs/").status_code == 401
    assert client.get("/api/v1/candidates/").status_code == 401


def test_same_candidate_email_can_exist_per_user(client, db_session):
    a = signup(client, "a@test.com").json()["user"]["id"]
    b = signup(client, "b@test.com").json()["user"]["id"]

    first = crud.create_candidate(db_session, "Shared", "shared@corp.com", "/tmp/1.pdf", [], "", user_id=a)
    second = crud.create_candidate(db_session, "Shared", "shared@corp.com", "/tmp/2.pdf", [], "", user_id=b)
    db_session.commit()

    assert first.id != second.id, "candidate rows must not collide across accounts"
    # Within one account the upsert behaviour is preserved.
    again = crud.create_candidate(db_session, "Shared Renamed", "shared@corp.com", "/tmp/3.pdf", [], "", user_id=a)
    assert again.id == first.id
    assert again.name == "Shared Renamed"


# ─── rate limiting ───────────────────────────────────────────────────────────

def test_rate_limit_helper_blocks_after_the_threshold():
    rate_limit_module.reset()
    for _ in range(3):
        rate_limit_module.rate_limit("k", 3)
    with pytest.raises(HTTPException) as error:
        rate_limit_module.rate_limit("k", 3)
    assert error.value.status_code == 429
    rate_limit_module.reset()


def test_signup_is_rate_limited_per_ip(client, db_session):
    settings.AUTH_RATE_LIMIT_PER_MINUTE = 3
    statuses = [signup(client, f"user{i}@test.com").status_code for i in range(3)]
    assert statuses == [201, 201, 201]

    blocked = signup(client, "user99@test.com")
    assert blocked.status_code == 429
    assert "Too many attempts" in blocked.json()["detail"]


def test_failed_logins_are_rate_limited(client):
    settings.AUTH_RATE_LIMIT_PER_MINUTE = 2
    signup(client, "rl@test.com")

    for _ in range(2):
        assert client.post(
            "/api/v1/auth/login", json={"email": "rl@test.com", "password": "wrong123"}
        ).status_code == 401

    assert client.post(
        "/api/v1/auth/login", json={"email": "rl@test.com", "password": "wrong123"}
    ).status_code == 429

    # A correct password is not blocked by the failure budget.
    assert client.post(
        "/api/v1/auth/login", json={"email": "rl@test.com", "password": PASSWORD}
    ).status_code == 200
