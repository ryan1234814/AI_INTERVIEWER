"""Tests for webcam-proctoring service logic and API routes."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi import HTTPException

from app.database import crud, models
from app.database.base import Base
from app.services import proctoring as svc
from app.routes import proctoring as routes


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)


def make_interview(db):
    job = crud.create_job_description(db, "QA Engineer", "Test things.", ["pytest"])
    cand = crud.create_candidate(db, "Cam Tester", "cam@example.com",
                                 "/tmp/c.pdf", ["pytest"], "Tester")
    return crud.create_interview(db, job.id, cand.id, total_questions=3)


# --- pure logic ---

def test_compute_focus_pct_basic():
    assert svc.compute_focus_pct(8, 10) == 80.0
    assert svc.compute_focus_pct(0, 10) == 0.0
    assert svc.compute_focus_pct(5, 0) == 0.0
    assert svc.compute_focus_pct(12, 10) == 100.0  # clamped
    assert svc.compute_focus_pct("bad", 10) == 0.0


def test_normalize_event_accepts_known_types():
    clean = svc.normalize_event("phone_detected", "saw iphone", 42)
    assert clean == {"event_type": "phone_detected",
                     "detail": "saw iphone", "focus_score": 42.0}


def test_normalize_event_rejects_unknown():
    with pytest.raises(ValueError):
        svc.normalize_event("teleport_detected")


def test_normalize_event_clamps_focus():
    assert svc.normalize_event("focused", focus_score=150)["focus_score"] == 100.0
    assert svc.normalize_event("focused", focus_score="nope")["focus_score"] is None


def test_device_labels():
    assert svc.is_prohibited_device("cell phone")
    assert svc.is_prohibited_device("Laptop")
    assert not svc.is_prohibited_device("person")
    assert not svc.is_prohibited_device("chair")


def test_warning_classification():
    assert svc.is_warning("phone_detected")
    assert svc.is_warning("multi_face")
    assert not svc.is_warning("focused")
    assert not svc.is_warning("heartbeat")


def test_summarize_events_mixed():
    summary = svc.summarize_events([
        {"event_type": "focused", "focus_score": 95},
        {"event_type": "focused", "focus_score": 90},
        {"event_type": "distracted", "focus_score": 50},
        {"event_type": "phone_detected", "focus_score": 30},
    ])
    assert summary["total_events"] == 4
    assert summary["warnings"] == 2
    assert summary["device_detections"] == 1
    assert summary["focus_pct"] == 50.0
    assert summary["avg_focus"] == 66.2
    assert summary["counts"]["focused"] == 2


def test_summarize_events_empty_is_perfect():
    summary = svc.summarize_events([])
    assert summary["focus_pct"] == 100.0
    assert summary["warnings"] == 0
    assert summary["integrity"] == "excellent"


# --- routes ---

@pytest.mark.asyncio
async def test_report_and_summary_roundtrip(db):
    interview = make_interview(db)
    res = await routes.report_proctor_event(
        interview.id,
        routes.ProctorEventIn(event_type="phone_detected",
                              detail="smartphone in frame", focus_score=35),
        db,
    )
    assert res["is_warning"] is True

    await routes.report_proctor_event(
        interview.id,
        routes.ProctorEventIn(event_type="focused", focus_score=95),
        db,
    )
    summary = await routes.get_proctor_summary(interview.id, db)
    assert summary["total_events"] == 2
    assert summary["warnings"] == 1
    assert summary["device_detections"] == 1
    assert summary["focus_pct"] == 50.0


@pytest.mark.asyncio
async def test_report_rejects_unknown_type(db):
    interview = make_interview(db)
    with pytest.raises(HTTPException) as exc:
        await routes.report_proctor_event(
            interview.id, routes.ProctorEventIn(event_type="alien"), db)
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_report_missing_interview_404(db):
    with pytest.raises(HTTPException) as exc:
        await routes.report_proctor_event(
            9999, routes.ProctorEventIn(event_type="focused"), db)
    assert exc.value.status_code == 404
