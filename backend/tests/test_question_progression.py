"""Regression tests for the "asks the same question over and over" bug.

Every case here is LLM-free: the original failure only appeared when the model
calls were erroring, so the guarantees must hold on the fallback paths too.
"""

import sys
import types

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import crud, models
from app.database.base import Base
from app.routes import interviews
from app.services import question_flow
from app.voice.voice_manager import VoiceManager


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


def make_interview(db, questions, total=None):
    job = crud.create_job_description(db, "Backend Engineer", "Build services.", ["Python"])
    candidate = crud.create_candidate(
        db, "Ada", "ada@example.com", "/tmp/ada.pdf", ["Python"], "Engineer"
    )
    return crud.create_interview(
        db,
        job.id,
        candidate.id,
        total_questions=total or len(questions),
        planned_questions=questions,
    )


# ─── question_flow helpers ───────────────────────────────────────────────────

def test_is_repeat_detects_verbatim_and_rephrased_reasks():
    q = "How would you design a high throughput service in Python?"
    assert question_flow.is_repeat(q, q)
    assert question_flow.is_repeat(
        f"Let me rephrase that — {q}", q
    ), "a wrapped re-ask is still the same question to the candidate"
    assert not question_flow.is_repeat(q, "Tell me about your testing strategy.")


def test_repeating_probe_rotates_instead_of_repeating():
    picks = [question_flow.rotating_probe(i) for i in range(1, 6)]
    assert all(a != b for a, b in zip(picks, picks[1:])), "probes must not repeat back to back"


def test_resume_index_skips_answered_questions():
    planned = ["Q1 text?", "Q2 text?", "Q3 text?"]
    # Follow-ups leave the stored counter on the current question, so the resume
    # point has to be derived from what was actually answered.
    assert question_flow.resume_index(planned, 0, ["Q1 text?"]) == 1
    assert question_flow.resume_index(planned, 0, []) == 0
    assert question_flow.resume_index(planned, 1, ["Q1 text?", "Q2 text?"]) == 2


def test_opening_question_never_replays_question_one():
    planned = ["First question?", "Second question?"]
    assert question_flow.opening_question(planned, 0, has_answers=False) == "First question?"
    resumed = question_flow.opening_question(planned, 1, has_answers=True)
    assert resumed == "Second question?"
    assert resumed != planned[0]


def test_clip_keeps_prompts_inside_the_token_budget():
    text = "alpha beta gamma " * 200
    clipped = question_flow.clip(text, 100)
    assert len(clipped) <= 100
    assert text.startswith(clipped)
    # Cut lands on a word boundary, never mid-word.
    assert text[len(clipped)] == " "
    # Short text is passed through untouched.
    assert question_flow.clip("  hello  ", 100) == "hello"
    assert question_flow.clip("", 100) == ""


def test_trim_history_caps_both_turn_count_and_answer_length():
    history = [
        {"question": f"Q{i}?", "answer": "word " * 500}
        for i in range(10)
    ]
    trimmed = question_flow.trim_history(history, max_turns=4, answer_limit=300)
    assert [h["question"] for h in trimmed] == ["Q6?", "Q7?", "Q8?", "Q9?"]
    assert all(len(h["answer"]) <= 300 for h in trimmed)
    assert question_flow.trim_history([], max_turns=4) == []


# ─── offline / degraded paths ────────────────────────────────────────────────

def test_offline_step_advances_through_planned_questions():
    """With no agent available the interview still walks forward, never loops."""
    planned = ["Q1?", "Q2?", "Q3?"]
    context = {"question_index": 0, "planned_questions": planned, "current_question": "Q1?"}

    asked = []
    for _ in range(4):
        step = VoiceManager._offline_step(context)
        next_q = step["next_question"]
        assert next_q not in asked, f"offline path repeated {next_q!r}"
        assert not step["is_follow_up"]
        asked.append(next_q)
        context["question_index"] += 1
        context["current_question"] = next_q

    # Planned bank is exhausted after Q3; the rotating probe keeps it moving.
    assert asked[0] == "Q2?" and asked[1] == "Q3?"
    assert len(asked) == 4


# ─── text-mode routing ───────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_text_mode_advances_to_next_planned_question(db, monkeypatch):
    planned = [
        "How do you test APIs?",
        "Describe a hard production bug you fixed.",
        "How do you approach system design tradeoffs?",
    ]
    interview = make_interview(db, planned)

    class FakeInterviewer:
        def __init__(self, api_key):
            pass

        def evaluate_response(self, question, response, job):
            # Low completeness — historically this forced a re-ask of the same Q.
            return {"score": 4, "completeness": 3, "feedback": "Thin answer"}

    class ExplodingGenerator:
        """Any LLM-dependent path must not be required to make progress."""

        def __init__(self, api_key):
            pass

        def generate_followup(self, response, question):
            return f"Let me rephrase that — {question}"

    monkeypatch.setitem(
        sys.modules, "app.agents.voice_interviewer",
        types.SimpleNamespace(VoiceInterviewerAgent=FakeInterviewer),
    )
    monkeypatch.setitem(
        sys.modules, "app.agents.question_generator",
        types.SimpleNamespace(QuestionGeneratorAgent=ExplodingGenerator),
    )

    asked = [planned[0]]
    current = planned[0]
    # Follow-ups do not advance the planned index, so allow more turns than
    # questions — the run must still terminate without ever repeating a question.
    for _ in range(8):
        # current_user=None exercises the internal (no HTTP principal) path; the
        # owned-by-a-user path is covered in tests/test_auth.py.
        result = await interviews.submit_response(
            interview.id, current, "A short answer.", db, None
        )
        next_q = result["next_question"]
        if result["status"] == "completed":
            break
        assert next_q, "no next question returned while the interview was still open"
        assert not question_flow.is_repeat(next_q, current), f"re-asked {current!r}"
        asked.append(next_q)
        current = next_q
    else:
        pytest.fail("text-mode interview never completed")

    db.refresh(interview)
    assert interview.status == "completed"
    assert len(set(asked)) == len(asked), f"questions repeated: {asked}"
    assert interview.current_question_index >= interview.total_questions
