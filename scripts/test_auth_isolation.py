"""End-to-end check for signup/login + per-user dashboard isolation.

Drives a running backend (default http://localhost:8000) exactly like two
browsers would and asserts that:
  1. signup returns a usable token and never leaks the password hash
  2. /auth/me, the dashboard list and the detail/report endpoints are scoped
  3. one account cannot read, respond to or complete another account's work
  4. two accounts can set up the *same* candidate email without clobbering
  5. rows created before authentication stay invisible to everyone

Usage: python scripts/test_auth_isolation.py
Set BASE_URL to point at a different backend.
"""

import json
import os
import sys
import time

import httpx

BASE = os.environ.get("BASE_URL", "http://localhost:8000")
API = f"{BASE}/api/v1"
RESUME = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backend", "uploads", "3feve_Ryan_George_Resume_Updated-2.pdf",
)
PASSWORD = "password123"

SETUP_FIELDS = {
    "role": "Backend",
    "experience_level": "senior",
    # Deliberately identical for both accounts: per-user candidate uniqueness
    # must keep these two rows apart instead of letting the second setup
    # overwrite the first account's candidate.
    "candidate_name": "Shared Candidate",
    "candidate_email": "shared_candidate@example.com",
    "num_questions": "2",
    "goal": "Standard Technical Interview",
}


def check(label: str, condition: bool, extra: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  {status}: {label}{(' — ' + extra) if extra and not condition else ''}")
    if not condition:
        sys.exit(f"Aborting: {label}")


def signup(client: httpx.Client, name: str, email: str) -> str:
    r = client.post(f"{API}/auth/signup", json={"name": name, "email": email, "password": PASSWORD})
    check(f"signup {email} returns 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
    body = r.json()
    check("signup returns a bearer token", bool(body.get("access_token")) and body.get("token_type") == "bearer")
    check("signup response has no password hash", "hashed_password" not in json.dumps(body))
    return body["access_token"]


def authed(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def setup_interview(client: httpx.Client, token: str, job_title: str) -> dict:
    with open(RESUME, "rb") as f:
        r = client.post(
            f"{API}/interviews/setup",
            headers=authed(token),
            files={"resume": ("resume.pdf", f.read(), "application/pdf")},
            data={
                **SETUP_FIELDS,
                "job_title": job_title,
                "job_description": "Design and operate high throughput Python services.",
            },
        )
    check(f"interview setup succeeds for the owner of {job_title!r}", r.status_code == 200,
          f"{r.status_code} {r.text[:300]}")
    return r.json()


def main() -> None:
    stamp = time.strftime("%H%M%S")
    alice_email = f"alice_{stamp}@isolation.test"
    bob_email = f"bob_{stamp}@isolation.test"

    with httpx.Client(timeout=120) as anon:
        print("\n=== Test 1: anonymous callers are turned away ===")
        check("GET /interviews/ without a token is 401",
              anon.get(f"{API}/interviews/").status_code == 401)
        check("GET /auth/me without a token is 401",
              anon.get(f"{API}/auth/me").status_code == 401)
        check("setup without a token is 401",
              anon.post(f"{API}/interviews/setup", data=SETUP_FIELDS).status_code == 401)
        check("a garbage token is 401 (not 500)",
              anon.get(f"{API}/auth/me", headers=authed("not.a.jwt")).status_code == 401)
        check("wrong password cannot log in",
              anon.post(f"{API}/auth/login",
                        json={"email": alice_email, "password": "wrong12345"}).status_code in (401, 429))

        print("\n=== Test 2: signup, then login over both transports ===")
        alice = signup(anon, "Alice", alice_email)
        bob = signup(anon, "Bob", bob_email)

        dup = anon.post(f"{API}/auth/signup",
                        json={"name": "Alias", "email": alice_email.upper(), "password": PASSWORD})
        check("duplicate email is rejected (case-insensitively)", dup.status_code == 400,
              f"{dup.status_code} {dup.text[:200]}")

        json_login = anon.post(f"{API}/auth/login",
                               json={"email": alice_email, "password": PASSWORD})
        check("login accepts JSON", json_login.status_code == 200, json_login.text[:200])

        form_login = anon.post(f"{API}/auth/login",
                               data={"username": alice_email, "password": PASSWORD})
        check("login accepts an OAuth2 form (Swagger Authorize)", form_login.status_code == 200,
              form_login.text[:200])

        me = anon.get(f"{API}/auth/me", headers=authed(alice))
        check("/auth/me identifies the caller", me.status_code == 200 and me.json()["email"] == alice_email,
              me.text[:200])

    with httpx.Client(timeout=120) as alice_client, httpx.Client(timeout=120) as bob_client:
        alice_h = authed(alice)
        bob_h = authed(bob)

        print("\n=== Test 3: each account sees only its own dashboard ===")
        alice_setup = setup_interview(alice_client, alice, "Alice-only Role")
        bob_setup = setup_interview(bob_client, bob, "Bob-only Role")
        alice_iid, bob_iid = alice_setup["interview_id"], bob_setup["interview_id"]
        check("two accounts produced two distinct interviews", alice_iid != bob_iid,
              f"{alice_iid} == {bob_iid}")
        check("the same candidate email did not collide across accounts",
              alice_setup["candidate_id"] != bob_setup["candidate_id"],
              f"both got candidate {alice_setup['candidate_id']}")

        alice_list = alice_client.get(f"{API}/interviews/", headers=alice_h).json()["interviews"]
        bob_list = bob_client.get(f"{API}/interviews/", headers=bob_h).json()["interviews"]
        alice_ids = {i["id"] for i in alice_list}
        bob_ids = {i["id"] for i in bob_list}
        check("alice's dashboard holds only alice's interview", alice_ids == {alice_iid}, str(alice_ids))
        check("bob's dashboard holds only bob's interview", bob_ids == {bob_iid}, str(bob_ids))

        alice_jobs = alice_client.get(f"{API}/jobs/", headers=alice_h).json()["jobs"]
        bob_jobs = bob_client.get(f"{API}/jobs/", headers=bob_h).json()["jobs"]
        check("job list is scoped to the caller",
              [j["title"] for j in alice_jobs] == ["Alice-only Role"], json.dumps(alice_jobs)[:200])
        check("bob never sees alice's job", all(j["title"] != "Alice-only Role" for j in bob_jobs),
              json.dumps(bob_jobs)[:200])

        alice_candidates = alice_client.get(f"{API}/candidates/", headers=alice_h).json()["candidates"]
        check("candidate list is scoped to the caller",
              [c["email"] for c in alice_candidates] == [SETUP_FIELDS["candidate_email"]],
              json.dumps(alice_candidates)[:200])
        check("candidates never expose resume paths",
              all("resume_path" not in c for c in alice_candidates), json.dumps(alice_candidates)[:200])

        print("\n=== Test 4: cross-account access is refused ===")
        for method, path, client, headers in (
            ("GET", f"{API}/interviews/{bob_iid}", alice_client, alice_h),
            ("POST", f"{API}/interviews/{bob_iid}/complete", alice_client, alice_h),
            ("GET", f"{API}/interviews/{bob_iid}/report", alice_client, alice_h),
        ):
            r = client.request(method, path, headers=headers)
            check(f"alice {method} {path.split('/api/v1')[1]} is 403", r.status_code == 403,
                  f"{r.status_code} {r.text[:200]}")

        respond = alice_client.post(
            f"{API}/interviews/{bob_iid}/respond",
            headers=alice_h,
            data={"question_text": "q", "candidate_response": "stolen"},
        )
        check("alice cannot answer bob's question", respond.status_code == 403,
              f"{respond.status_code} {respond.text[:200]}")

        check("bob still reads his own interview",
              bob_client.get(f"{API}/interviews/{bob_iid}", headers=bob_h).status_code == 200)

        print("\n=== Test 5: pre-auth rows stay private to everyone ===")
        legacy = [row[0] for row in _legacy_interview_ids()]
        if legacy:
            leaked = [
                iid for iid in legacy
                if alice_client.get(f"{API}/interviews/{iid}", headers=alice_h).status_code == 200
            ]
            check("no legacy interview is readable by a new account", not leaked, f"leaked: {leaked[:5]}")
            legacy_list = alice_client.get(f"{API}/interviews/", headers=alice_h).json()["interviews"]
            check("legacy rows never appear in a dashboard",
                  {i["id"] for i in legacy_list} == {alice_iid}, str({i["id"] for i in legacy_list}))
        else:
            print("  SKIP: no pre-auth interviews in this database")

        print("\n=== Test 6: logout is client-side, the token stops working only when dropped ===")
        check("token keeps working until it expires",
              alice_client.get(f"{API}/auth/me", headers=alice_h).status_code == 200)

    print("\nALL CHECKS PASSED")
    print(f"Created two throwaway accounts ({alice_email}, {bob_email}); their rows are isolated.")


def _legacy_interview_ids():
    """IDs of interviews that predate authentication (user_id IS NULL)."""
    import sqlite3

    db = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "backend", "interview_platform.db",
    )
    if not os.path.exists(db):
        return []
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        return con.execute("SELECT id FROM interviews WHERE user_id IS NULL").fetchall()
    except sqlite3.Error:
        return []
    finally:
        con.close()


if __name__ == "__main__":
    try:
        main()
    except httpx.HTTPError as exc:
        sys.exit(f"Backend at {BASE} is not reachable or errored: {exc}")
