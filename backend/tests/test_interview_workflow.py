import json
import sys
import types

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import crud, models
from app.database.base import Base
from app.routes import interviews


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


def create_interview(db, total_questions=2):
    job = crud.create_job_description(
        db, "Backend Engineer", "Build reliable FastAPI services.", ["Python"]
    )
    candidate = crud.create_candidate(
        db,
        "Ada Lovelace",
        "ada@example.com",
        "/tmp/ada.pdf",
        ["Python"],
        "Engineer",
    )
    return crud.create_interview(
        db, job.id, candidate.id, total_questions=total_questions
    )


def test_create_candidate_normalizes_email_and_updates_existing_record(db):
    candidate = crud.create_candidate(
        db,
        "Ada",
        " ADA@Example.COM ",
        "/tmp/first.pdf",
        ["Python"],
        "First summary",
    )
    updated = crud.create_candidate(
        db,
        "Ada Lovelace",
        "ada@example.com",
        "/tmp/latest.pdf",
        ["Python", "SQL"],
        "Updated summary",
    )

    assert updated.id == candidate.id
    assert db.query(models.Candidate).count() == 1
    assert updated.email == "ada@example.com"
    assert updated.name == "Ada Lovelace"
    assert updated.extracted_skills == ["Python", "SQL"]


@pytest.mark.asyncio
async def test_submit_response_evaluates_and_generates_followup(
    db, monkeypatch
):
    interview = create_interview(db)

    class FakeInterviewer:
        def __init__(self, api_key):
            self.api_key = api_key

        def evaluate_response(self, question, response, job):
            return {
                "score": 9,
                "feedback": "Clear explanation",
                "strengths": ["Python"],
            }

    class FakeQuestionGenerator:
        def __init__(self, api_key):
            self.api_key = api_key

        def generate_followup(self, response, question):
            return "How did you measure the result?"

    monkeypatch.setitem(
        sys.modules,
        "app.agents.voice_interviewer",
        types.SimpleNamespace(VoiceInterviewerAgent=FakeInterviewer),
    )
    monkeypatch.setitem(
        sys.modules,
        "app.agents.question_generator",
        types.SimpleNamespace(QuestionGeneratorAgent=FakeQuestionGenerator),
    )

    result = await interviews.submit_response(
        interview.id,
        "How do you test APIs?",
        "I use pytest and integration tests.",
        db,
    )

    saved = db.get(models.InterviewResponse, result["response_id"])
    db.refresh(interview)
    # Core contract (extra additive keys like "behavioral" are allowed)
    assert result["response_id"] == saved.id
    assert result["evaluation"] == {
        "score": 9,
        "feedback": "Clear explanation",
        "strengths": ["Python"],
    }
    assert result["next_question"] == "How did you measure the result?"
    assert result["current_index"] == 1
    assert result["total_questions"] == 2
    assert result["status"] == "ongoing"
    assert saved.evaluation_score == 7.0
    assert json.loads(saved.feedback)["score"] == 9
    assert interview.status == "ongoing"


@pytest.mark.asyncio
async def test_complete_interview_creates_evaluation_and_is_idempotent(db):
    interview = create_interview(db)
    db.add_all(
        [
            models.InterviewResponse(
                interview_id=interview.id,
                question_text="Question one",
                candidate_response="Detailed answer",
                evaluation_score=8,
                feedback=json.dumps(
                    {
                        "strengths": ["Python", "Python"],
                        "weaknesses": ["Conciseness"],
                    }
                ),
            ),
            models.InterviewResponse(
                interview_id=interview.id,
                question_text="Question two",
                candidate_response="Another answer",
                evaluation_score=6,
                feedback="not json",
            ),
            models.InterviewResponse(
                interview_id=interview.id,
                question_text="Placeholder",
                candidate_response="",
                evaluation_score=10,
            ),
        ]
    )
    db.commit()

    result = await interviews.complete_interview(interview.id, db)
    evaluation = (
        db.query(models.Evaluation).filter_by(interview_id=interview.id).one()
    )
    repeat_result = await interviews.complete_interview(interview.id, db)

    assert result["status"] == "completed"
    assert result["overall_score"] == 7.0
    # No proctor events logged -> perfect focus summary
    assert result["proctor_summary"]["focus_pct"] == 100.0
    assert result["proctor_summary"]["warnings"] == 0
    assert evaluation.overall_score == 7.0
    assert evaluation.strengths == ["Python"]
    assert evaluation.weaknesses == ["Conciseness"]
    assert "2 questions answered" in evaluation.summary
    assert repeat_result["status"] == "completed"
    assert repeat_result["overall_score"] == 7.0
    assert db.query(models.Evaluation).count() == 1


@pytest.mark.asyncio
async def test_missing_interview_returns_not_found(db):
    with pytest.raises(HTTPException, match="Interview not found") as error:
        await interviews.get_interview(999, db)

    assert error.value.status_code == 404


def test_fallback_question_helpers_respect_requested_count_and_cycle():
    questions = interviews._generate_fallback_questions(
        "Backend Engineer", [], "senior", 3
    )

    assert len(questions) == 3
    assert "Backend Engineer" in questions[0]
    assert interviews._get_fallback_followup(
        5
    ) == interviews._get_fallback_followup(0)
