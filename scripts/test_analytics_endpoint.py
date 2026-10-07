"""Smoke test for GET /interviews/{id}/analytics.

Runs against a throwaway sqlite file (DATABASE_URL is set before app import,
and main.py's _ensure_schema() binds to it at import time). Seeds one owner,
one completed interview with per-response behavioral data, proctor events, and
a second prior session for the same candidate to exercise the trend series.
"""
import os
import sys

os.environ["DATABASE_URL"] = "sqlite:///./_test_analytics.db"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-analytics-smoke")

for path in ("./_test_analytics.db",):
    if os.path.exists(path):
        os.remove(path)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.database.session import SessionLocal  # noqa: E402
from app.database import models  # noqa: E402
from app.utils.security import hash_password, create_access_token  # noqa: E402


def seed():
    db = SessionLocal()
    user = models.User(name="Analytics Tester", email="analytics@test.local",
                       hashed_password=hash_password("pw"))
    db.add(user); db.commit(); db.refresh(user)

    job = models.JobDescription(user_id=user.id, title="Backend Engineer",
                                description="FastAPI and SQL", requirements=["python"])
    cand = models.Candidate(user_id=user.id, name="Serial Candidate",
                            email="serial@test.local", extracted_skills=["python"])
    db.add_all([job, cand]); db.commit(); db.refresh(job); db.refresh(cand)

    # Prior completed session for the same candidate (trend series).
    prior = models.Interview(user_id=user.id, job_id=job.id, candidate_id=cand.id,
                             status="completed", total_questions=3, current_question_index=3)
    db.add(prior); db.commit(); db.refresh(prior)
    db.add(models.Evaluation(interview_id=prior.id, overall_score=5.5,
                             technical_score=5.5, communication_score=6.0, relevance_score=5.2,
                             strengths=[], weaknesses=[], summary="earlier"))

    iv = models.Interview(user_id=user.id, job_id=job.id, candidate_id=cand.id,
                          status="completed", total_questions=3, current_question_index=3,
                          planned_questions=["Q1?", "Q2?", "Q3?"])
    db.add(iv); db.commit(); db.refresh(iv)

    rows = [
        models.InterviewResponse(interview_id=iv.id, question_text="Q1?", candidate_response="a1",
                                 evaluation_score=6.0, clarity_score=7.0, confidence_score=6.5,
                                 wpm=130, filler_rate=3.2, sentiment_label="positive",
                                 behavioral_analysis={"star_structure": 6.0, "clarity": 7.0, "confidence": 6.5}),
        # Q2 has no behavioral analysis — charts must show gaps, not zeros.
        models.InterviewResponse(interview_id=iv.id, question_text="Q2?", candidate_response="a2",
                                 evaluation_score=8.0, wpm=145),
        models.InterviewResponse(interview_id=iv.id, question_text="Q3?", candidate_response="a3",
                                 evaluation_score=7.5, clarity_score=8.0,
                                 behavioral_analysis={"star_structure": 7.5}),
    ]
    db.add_all(rows)
    db.add(models.Evaluation(interview_id=iv.id, overall_score=7.2, technical_score=7.2,
                             communication_score=7.8, relevance_score=6.9,
                             strengths=["clear"], weaknesses=["depth"], summary="good",
                             avg_clarity=7.5, avg_confidence=6.5, avg_star=6.8,
                             avg_filler_rate=3.2, avg_wpm=137.5))
    db.add_all([
        models.ProctorEvent(interview_id=iv.id, event_type="focused", focus_score=95),
        models.ProctorEvent(interview_id=iv.id, event_type="phone_detected", focus_score=40),
        models.ProctorEvent(interview_id=iv.id, event_type="heartbeat", focus_score=90),
    ])
    db.commit()
    iv_id = iv.id  # read before the session closes (detached instances can't lazy-load)
    db.close()
    return iv_id


def main():
    iv_id = seed()
    with TestClient(app) as client:
        token = None
        # Log in through the real auth path.
        r = client.post("/api/v1/auth/login", json={"email": "analytics@test.local", "password": "pw"})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        r = client.get(f"/api/v1/interviews/{iv_id}/analytics", headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert len(d["per_question"]) == 3, d["per_question"]
        assert d["per_question"][1]["clarity"] is None  # gap preserved, not zeroed
        assert d["evaluation"]["overall_score"] == 7.2
        types = [e["event_type"] for e in d["proctor"]["timeline"]]
        assert "phone_detected" in types
        scores = [h["overall_score"] for h in d["candidate_history"]]
        assert scores == [5.5, 7.2], scores  # prior session first, current last

        # Foreign interview must not leak (data isolation).
        r2 = client.get(f"/api/v1/interviews/{iv_id}/analytics")
        assert r2.status_code in (401, 403, 404), r2.status_code

    os.remove("./_test_analytics.db")
    print("analytics endpoint OK")


if __name__ == "__main__":
    main()
