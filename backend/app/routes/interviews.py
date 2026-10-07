import os
import logging
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database import models, crud
from app.config import settings
from app.utils.pdf_generator import generate_interview_pdf
from app.utils.deps import assert_owner, get_current_user, resolve_principal
from app.services import question_flow
from typing import Optional
import json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/{interview_id}/report")
async def get_interview_report(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    """
    Download the interview performance report as a PDF.
    """
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    assert_owner(interview.user_id, current_user)
    
    if interview.status != "completed":
        raise HTTPException(status_code=400, detail="Interview is not completed yet")
    
    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()
    evaluation = db.query(models.Evaluation).filter(models.Evaluation.interview_id == interview_id).first()
    responses = db.query(models.InterviewResponse).filter(models.InterviewResponse.interview_id == interview_id).all()
    
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found for this interview")

    proctor_summary = None
    try:
        from app.services import proctoring as proctor_svc
        proctor_events = db.query(models.ProctorEvent).filter(
            models.ProctorEvent.interview_id == interview_id
        ).all()
        proctor_summary = proctor_svc.summarize_events(proctor_events)
    except Exception as e:
        logger.warning(f"Proctor summary (report) failed: {e}")

    pdf_buffer = generate_interview_pdf(
        candidate.name,
        job.title,
        evaluation,
        responses,
        proctor_summary=proctor_summary,
    )
    
    filename = f"Interview_Report_{candidate.name.replace(' ', '_')}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# Defaults to backend/uploads (unchanged); overridable via UPLOAD_DIR env
# so Render can point it at a persistent Disk mount.
UPLOAD_DIR = os.getenv("UPLOAD_DIR") or os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/")
async def list_interviews(
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    query = db.query(models.Interview)
    principal = resolve_principal(current_user)
    if principal is not None:
        # Per-user dashboard: only interviews this account created. Rows predating
        # authentication (user_id IS NULL) match no account and stay private.
        query = query.filter(models.Interview.user_id == principal.id)
    interviews = query.order_by(models.Interview.started_at.desc()).all()
    results = []
    for interview in interviews:
        job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
        candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()
        results.append({
            "id": interview.id,
            "status": interview.status,
            "total_questions": interview.total_questions,
            "current_question_index": interview.current_question_index,
            "started_at": str(interview.started_at) if interview.started_at else None,
            "job_title": job.title if job else "Unknown",
            "candidate_name": candidate.name if candidate else "Unknown",
        })
    return {"interviews": results}


@router.get("/{interview_id}")
async def get_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    assert_owner(interview.user_id, current_user)

    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()

    responses = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id
    ).all()
    evaluation = db.query(models.Evaluation).filter(models.Evaluation.interview_id == interview_id).first()

    # Webcam proctoring summary (focus % + warnings) — empty when unused
    proctor_summary = None
    try:
        from app.services import proctoring as proctor_svc
        proctor_events = db.query(models.ProctorEvent).filter(
            models.ProctorEvent.interview_id == interview_id
        ).all()
        proctor_summary = proctor_svc.summarize_events(proctor_events)
    except Exception as e:
        logger.warning(f"Proctor summary failed: {e}")

    return {
        "id": interview.id,
        "status": interview.status,
        "total_questions": interview.total_questions,
        "current_question_index": interview.current_question_index,
        "planned_questions": question_flow.parse_planned(interview.planned_questions),
        "job": {
            "id": job.id,
            "title": job.title,
            "description": job.description,
            "requirements": job.requirements,
        } if job else None,
        "candidate": {
            "id": candidate.id,
            "name": candidate.name,
            "email": candidate.email,
            "extracted_skills": candidate.extracted_skills,
            "experience_summary": candidate.experience_summary,
        } if candidate else None,
        "responses": [
            {
                "id": r.id,
                "question_text": r.question_text,
                "candidate_response": r.candidate_response,
                "evaluation_score": r.evaluation_score,
                "feedback": r.feedback,
                "behavioral_analysis": r.behavioral_analysis,
                "filler_count": r.filler_count,
                "filler_rate": r.filler_rate,
                "wpm": r.wpm,
                "sentiment_label": r.sentiment_label,
                "clarity_score": r.clarity_score,
                "confidence_score": r.confidence_score,
            }
            for r in responses
        ],
        "evaluation": {
            "overall_score": evaluation.overall_score,
            "technical_score": evaluation.technical_score,
            "communication_score": evaluation.communication_score,
            "relevance_score": evaluation.relevance_score,
            "strengths": evaluation.strengths,
            "weaknesses": evaluation.weaknesses,
            "summary": evaluation.summary,
            "behavioral_summary": evaluation.behavioral_summary,
            "avg_filler_rate": evaluation.avg_filler_rate,
            "avg_wpm": evaluation.avg_wpm,
            "avg_clarity": evaluation.avg_clarity,
            "avg_confidence": evaluation.avg_confidence,
            "avg_star": evaluation.avg_star,
        } if evaluation else None,
        "proctor_summary": proctor_summary,
    }


def _as_float(value) -> Optional[float]:
    try:
        return round(float(value), 2) if value is not None else None
    except (TypeError, ValueError):
        return None


@router.get("/{interview_id}/analytics")
async def get_interview_analytics(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    """Time-series data for per-session progress charts.

    Only real answers are plotted: placeholder rows (empty candidate_response,
    created when a question is first asked) are skipped, and unanswered
    questions simply leave gaps in the series instead of being padded with
    invented zeros.
    """
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    assert_owner(interview.user_id, current_user)

    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()

    responses = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id,
        models.InterviewResponse.candidate_response != "",
        models.InterviewResponse.candidate_response.isnot(None),
    ).order_by(models.InterviewResponse.id.asc()).all()

    per_question = []
    for n, r in enumerate(responses, start=1):
        ba = r.behavioral_analysis
        if isinstance(ba, str):
            try:
                ba = json.loads(ba)
            except (json.JSONDecodeError, TypeError):
                ba = None
        ba = ba if isinstance(ba, dict) else {}
        per_question.append({
            "n": n,
            "question": (r.question_text or "")[:90],
            "score": _as_float(r.evaluation_score),
            "clarity": _as_float(r.clarity_score if r.clarity_score is not None else ba.get("clarity")),
            "confidence": _as_float(r.confidence_score if r.confidence_score is not None else ba.get("confidence")),
            "star": _as_float(ba.get("star_structure")),
            "sentiment_label": r.sentiment_label,
            "wpm": _as_float(r.wpm),
            "filler_rate": _as_float(r.filler_rate),
        })

    evaluation = db.query(models.Evaluation).filter(
        models.Evaluation.interview_id == interview_id
    ).first()

    # Compact proctoring timeline (bounded so long heartbeat streams stay light).
    proctor = {"timeline": [], "summary": None}
    try:
        from app.services import proctoring as proctor_svc
        events = db.query(models.ProctorEvent).filter(
            models.ProctorEvent.interview_id == interview_id
        ).order_by(models.ProctorEvent.id.asc()).all()
        proctor["summary"] = proctor_svc.summarize_events(events)
        # Heartbeats are periodic noise; keep every signal event and thin
        # heartbeats so the bounded timeline still shows real incidents.
        signals = [e for e in events if e.event_type != "heartbeat"]
        heartbeats = [e for e in events if e.event_type == "heartbeat"][::10]
        timeline_events = sorted(signals + heartbeats, key=lambda e: e.id)[-200:]
        proctor["timeline"] = [
            {
                "t": e.created_at.isoformat() if e.created_at else None,
                "event_type": e.event_type,
                "focus_score": _as_float(e.focus_score),
            }
            for e in timeline_events
        ]
    except Exception as e:
        logger.warning(f"Proctor timeline for analytics failed: {e}")

    # Same candidate's previously scored sessions (this owner only — matches the
    # data-isolation rules used by the list/detail endpoints) for the trend chart.
    candidate_history = []
    if interview.candidate_id:
        prior = (
            db.query(models.Interview, models.Evaluation)
            .join(models.Evaluation, models.Evaluation.interview_id == models.Interview.id)
            .filter(
                models.Interview.candidate_id == interview.candidate_id,
                models.Interview.status == "completed",
            )
            .order_by(models.Interview.started_at.asc())
            .all()
        )
        if current_user is not None:
            prior = [row for row in prior if row[0].user_id == interview.user_id]
        candidate_history = [
            {
                "interview_id": iv.id,
                "date": iv.completed_at.isoformat() if iv.completed_at else (iv.started_at.isoformat() if iv.started_at else None),
                "overall_score": _as_float(ev.overall_score),
                "is_current": iv.id == interview_id,
            }
            for iv, ev in prior
        ]

    return {
        "interview": {
            "id": interview.id,
            "status": interview.status,
            "total_questions": interview.total_questions,
            "current_question_index": interview.current_question_index,
            "started_at": interview.started_at.isoformat() if interview.started_at else None,
            "completed_at": interview.completed_at.isoformat() if interview.completed_at else None,
            "job_title": job.title if job else "Unknown",
            "candidate_name": candidate.name if candidate else "Unknown",
        },
        "per_question": per_question,
        "evaluation": {
            "overall_score": _as_float(evaluation.overall_score),
            "technical_score": _as_float(evaluation.technical_score),
            "communication_score": _as_float(evaluation.communication_score),
            "relevance_score": _as_float(evaluation.relevance_score),
            "avg_clarity": _as_float(evaluation.avg_clarity),
            "avg_confidence": _as_float(evaluation.avg_confidence),
            "avg_star": _as_float(evaluation.avg_star),
            "avg_filler_rate": _as_float(evaluation.avg_filler_rate),
            "avg_wpm": _as_float(evaluation.avg_wpm),
            "behavioral_summary": evaluation.behavioral_summary,
        } if evaluation else None,
        "proctor": proctor,
        "candidate_history": candidate_history,
    }


@router.post("/setup")
async def setup_interview(
    resume: UploadFile = File(...),
    job_title: str = Form(...),
    job_description: str = Form(...),
    role: str = Form(""),
    experience_level: str = Form("mid"),
    candidate_name: str = Form("Candidate"),
    candidate_email: str = Form("candidate@example.com"),
    num_questions: int = Form(5),
    goal: str = Form("Standard Technical Interview"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Full interview setup endpoint:
    1. Receives resume PDF + job details
    2. Saves resume, extracts text
    3. Analyzes resume with AI (or fallback)
    4. Creates job, candidate, and interview records
    5. Generates initial interview questions
    """
    try:
        # Save the uploaded resume
        resume_filename = f"{candidate_name.replace(' ', '_')}_{resume.filename}"
        resume_path = os.path.join(UPLOAD_DIR, resume_filename)
        with open(resume_path, "wb") as f:
            content = await resume.read()
            f.write(content)

        # Extract text from resume
        resume_text = ""
        extracted_skills = []
        experience_summary = ""

        try:
            import pdfplumber
            with pdfplumber.open(resume_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        resume_text += page_text + "\n"
        except Exception as e:
            logger.warning(f"PDF extraction failed: {e}")
            resume_text = "Resume uploaded but text extraction failed."

        # Try to analyze resume with AI
        try:
            from app.agents.resume_analyzer import ResumeAnalyzerAgent
            analyzer = ResumeAnalyzerAgent(settings.GROQ_API_KEY)
            analysis = analyzer.analyze_resume(resume_path)
            extracted_skills = analysis.get("skills", [])
            experience_summary = analysis.get("summary", "")
            if analysis.get("name") and analysis["name"] != "Unknown":
                candidate_name = analysis["name"]
        except Exception as e:
            logger.warning(f"AI resume analysis failed (using fallback): {e}")
            # Fallback: extract skills from text with simple keyword matching
            common_skills = [
                "python", "javascript", "java", "react", "node.js", "sql", "aws",
                "docker", "kubernetes", "git", "html", "css", "typescript",
                "machine learning", "deep learning", "pytorch", "tensorflow",
                "fastapi", "django", "flask", "mongodb", "postgresql",
                "c++", "c#", "go", "rust", "swift", "kotlin", "ruby",
                "devops", "ci/cd", "agile", "scrum", "linux",
            ]
            text_lower = resume_text.lower()
            extracted_skills = [s for s in common_skills if s in text_lower]
            if not extracted_skills:
                extracted_skills = ["general programming"]
            experience_summary = f"Candidate applying for {job_title} role at {experience_level} level."

        # Build full job description with role and experience level context
        full_description = f"Role: {role}\nExperience Level: {experience_level}\n\n{job_description}"
        requirements = [r.strip() for r in job_description.split(".") if len(r.strip()) > 10]

        # Create DB records — all owned by the signed-in user.
        db_job = crud.create_job_description(db, title=job_title, description=full_description, requirements=requirements, user_id=current_user.id)
        db_candidate = crud.create_candidate(
            db,
            name=candidate_name,
            email=candidate_email,
            resume_path=resume_path,
            extracted_skills=extracted_skills,
            experience_summary=experience_summary,
            user_id=current_user.id,
        )

        # Generate the question bank BEFORE creating the interview so it can be
        # persisted: the flow needs a stored list of distinct questions to advance
        # through (and to resume from after a reconnect).
        try:
            from app.agents.question_generator import QuestionGeneratorAgent
            generator = QuestionGeneratorAgent(settings.GROQ_API_KEY)
            questions = generator.generate_questions(full_description, extracted_skills, count=num_questions)
        except Exception as e:
            logger.warning(f"AI question generation failed (using fallback): {e}")
            questions = []

        questions = [q.strip() for q in questions if q and q.strip()][:num_questions]
        # Top the bank up to the requested length so every turn has somewhere to go.
        if len(questions) < num_questions:
            filler = _generate_fallback_questions(job_title, extracted_skills, experience_level, num_questions * 2)
            for fq in filler:
                if len(questions) >= num_questions:
                    break
                if not any(question_flow.is_repeat(fq, existing) for existing in questions):
                    questions.append(fq)
        if not questions:
            raise HTTPException(status_code=500, detail="Unable to generate interview questions")

        db_interview = crud.create_interview(
            db,
            job_id=db_job.id,
            candidate_id=db_candidate.id,
            total_questions=len(questions),
            goal=goal,
            planned_questions=questions,
            user_id=current_user.id,
        )

        # Store the first question as an InterviewResponse placeholder
        if questions:
            first_q = models.InterviewResponse(
                interview_id=db_interview.id,
                question_text=questions[0],
                candidate_response="",
            )
            db.add(first_q)
            db.commit()

        return {
            "interview_id": db_interview.id,
            "job_id": db_job.id,
            "candidate_id": db_candidate.id,
            "candidate_name": candidate_name,
            "extracted_skills": extracted_skills,
            "experience_summary": experience_summary,
            "questions": questions,
            "status": "ready",
        }

    except Exception as e:
        logger.error(f"Interview setup error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{interview_id}/respond")
async def submit_response(
    interview_id: int,
    question_text: str = Form(...),
    candidate_response: str = Form(...),
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    """
    Submit a text-based response for the current question.
    Returns evaluation + next question.
    """
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    assert_owner(interview.user_id, current_user)

    if interview.status == "terminated":
        raise HTTPException(
            status_code=410,
            detail="Interview was terminated automatically after repeated proctoring warnings.",
        )

    # Repeat request (text mode): echo the same question, no scoring, no progress.
    if question_flow.is_repeat_request(candidate_response):
        logger.info(f"Repeat request on interview {interview_id} — echoing question")
        return {
            "response_id": 0,
            "evaluation": {"feedback": "Question repeated on request (not scored).", "is_repeat": True},
            "behavioral": None,
            "next_question": question_text,
            "is_repeat": True,
            "current_index": interview.current_question_index,
            "total_questions": interview.total_questions,
            "status": interview.status,
        }

    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()

    # Read the history BEFORE building the new response row: SQLAlchemy autoflush
    # would otherwise include the row being inserted and make every question look
    # like it had already been probed.
    prior_question_texts = [
        r.question_text
        for r in db.query(models.InterviewResponse).filter(
            models.InterviewResponse.interview_id == interview_id,
            models.InterviewResponse.candidate_response != "",
        ).all()
    ]

    # Behavioral analysis for text-mode responses
    behavioral = None
    try:
        from app.services.behavioral_analysis import analyze_response
        behavioral = analyze_response(question_text, candidate_response, job.description if job else "")
    except Exception as e:
        logger.warning(f"Behavioral analysis (text mode) failed: {e}")

    sm = (behavioral or {}).get("speech_metrics", {})
    response_record = models.InterviewResponse(
        interview_id=interview_id,
        question_text=question_text,
        candidate_response=candidate_response,
        behavioral_analysis=behavioral,
        filler_count=sm.get("filler_count"),
        filler_rate=sm.get("filler_rate"),
        wpm=sm.get("wpm"),
        sentiment_label=(behavioral or {}).get("sentiment_heuristic", {}).get("label"),
        clarity_score=(behavioral or {}).get("clarity"),
        confidence_score=(behavioral or {}).get("confidence"),
    )
    db.add(response_record)

    # Evaluate the response
    evaluation = {"score": 0, "feedback": ""}
    try:
        from app.agents.voice_interviewer import VoiceInterviewerAgent
        agent = VoiceInterviewerAgent(settings.GROQ_API_KEY)
        eval_result = agent.evaluate_response(
            question_text,
            candidate_response,
            {"description": job.description if job else "", "requirements": job.requirements if job else []}
        )
        evaluation = eval_result
        response_record.feedback = json.dumps(eval_result)
        response_record.evaluation_score = float(
            eval_result.get("technical_accuracy", 7.0) or 7.0
        )
    except Exception as e:
        logger.warning(f"AI evaluation failed: {e}")
        evaluation = {
            "evaluation": f"Response recorded for: {question_text[:50]}..."
        }
        response_record.feedback = "Evaluation pending"

    # Update interview progress
    planned = question_flow.parse_planned(interview.planned_questions)
    answered_index = interview.current_question_index
    next_index = answered_index + 1

    completeness = 10
    if isinstance(evaluation, dict):
        try:
            completeness = float(evaluation.get("completeness", 10))
        except (TypeError, ValueError):
            completeness = 10

    # Insert at most ONE probing follow-up per planned question. Bounded this way,
    # a thin answer (or a validator running on its offline fallback) can never
    # re-ask the same question turn after turn.
    asked_planned = question_flow.planned_question(planned, answered_index)
    answered_base_question = bool(asked_planned) and question_flow.is_repeat(
        question_text, asked_planned
    )
    already_probed = any(
        question_flow.is_repeat(asked, question_text) for asked in prior_question_texts
    )
    wants_follow_up = (
        answered_base_question
        and not already_probed
        and completeness < 7
        and next_index < interview.total_questions
    )

    if wants_follow_up:
        interview.status = "ongoing"  # index holds until the probe is answered
    else:
        interview.current_question_index = next_index
        interview.status = (
            "completed" if next_index >= interview.total_questions else "ongoing"
        )

    db.commit()
    db.refresh(response_record)

    # Generate next question if not done
    next_question = ""
    if interview.status != "completed":
        if wants_follow_up:
            try:
                from app.agents.question_generator import QuestionGeneratorAgent
                generator = QuestionGeneratorAgent(settings.GROQ_API_KEY)
                next_question = generator.generate_followup(candidate_response, question_text)
            except Exception as e:
                logger.warning(f"Follow-up generation failed: {e}")
                next_question = question_flow.rotating_probe(answered_index)
        else:
            # Advance to the next planned question; only synthesize one when the
            # bank is exhausted (e.g. interviews created without a stored bank).
            next_question = question_flow.planned_question(planned, next_index)
            if not next_question:
                try:
                    from app.agents.question_generator import QuestionGeneratorAgent
                    generator = QuestionGeneratorAgent(settings.GROQ_API_KEY)
                    next_question = generator.generate_followup(candidate_response, question_text)
                except Exception as e:
                    logger.warning(f"Next question generation failed: {e}")
                    next_question = question_flow.rotating_probe(next_index)

        # Never hand back the question that was just answered.
        if question_flow.is_repeat(next_question, question_text):
            next_question = question_flow.rotating_probe(next_index)

    return {
        "response_id": response_record.id,
        "evaluation": evaluation,
        "behavioral": behavioral,
        "next_question": next_question,
        "is_repeat": False,
        "current_index": interview.current_question_index,
        "total_questions": interview.total_questions,
        "status": interview.status,
    }


@router.post("/{interview_id}/complete")
async def complete_interview(
    interview_id: int,
    db: Session = Depends(get_db),
    current_user: Optional[models.User] = Depends(get_current_user),
):
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    assert_owner(interview.user_id, current_user)

    # Check if already completed with an evaluation
    existing_eval = db.query(models.Evaluation).filter(
        models.Evaluation.interview_id == interview_id
    ).first()
    if existing_eval:
        logger.info(f"Interview {interview_id} already has an evaluation, skipping.")
        return {"status": "completed", "overall_score": existing_eval.overall_score}

    interview.status = "completed"
    from datetime import datetime
    interview.completed_at = datetime.utcnow()

    # Get all responses with actual content (filter out placeholders)
    responses = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id,
        models.InterviewResponse.candidate_response != "",
        models.InterviewResponse.candidate_response.isnot(None)
    ).all()

    # Calculate scores from responses that have evaluation_score
    scored_responses = [r for r in responses if r.evaluation_score and r.evaluation_score > 0]
    avg_score = sum(r.evaluation_score for r in scored_responses) / len(scored_responses) if scored_responses else 5.0

    # Extract strengths and weaknesses from per-question feedback
    strengths = []
    weaknesses = []
    for resp in responses:
        if resp.feedback:
            try:
                data = json.loads(resp.feedback) if isinstance(resp.feedback, str) else resp.feedback
                if isinstance(data, dict):
                    if data.get("strengths"):
                        s = data["strengths"]
                        strengths.extend(s if isinstance(s, list) else [s])
                    if data.get("weaknesses"):
                        w = data["weaknesses"]
                        weaknesses.extend(w if isinstance(w, list) else [w])
                    # Also check for positive/negative feedback text
                    fb = data.get("feedback", "")
                    if fb and len(fb) > 10:
                        if (data.get("technical_accuracy", 0) or 0) >= 7:
                            strengths.append(fb[:100])
                        elif (data.get("technical_accuracy", 0) or 0) <= 4:
                            weaknesses.append(fb[:100])
            except (json.JSONDecodeError, TypeError, ValueError):
                pass

    # Ensure at least one entry in each
    if not strengths:
        if avg_score >= 7:
            strengths = ["Strong technical knowledge demonstrated across questions"]
        elif avg_score >= 5:
            strengths = ["Adequate understanding of core concepts"]
        else:
            strengths = ["Willingness to attempt all questions"]
    if not weaknesses:
        if avg_score >= 8:
            weaknesses = ["Could provide more specific real-world examples"]
        elif avg_score >= 5:
            weaknesses = ["Could elaborate more on technical details"]
        else:
            weaknesses = ["Needs more depth in technical responses"]

    # Deduplicate
    strengths = list(dict.fromkeys(strengths))[:5]
    weaknesses = list(dict.fromkeys(weaknesses))[:5]

    summary = (
        f"Interview completed with {len(responses)} questions answered. "
        f"Average score: {avg_score:.1f}/10. "
        f"{'Strong performance overall.' if avg_score >= 7 else 'Adequate performance with room for improvement.' if avg_score >= 5 else 'Below expectations — further preparation recommended.'}"
    )

    # --- Behavioral aggregate ---
    behavioral_scores = {"clarity": [], "confidence": [], "star_structure": [], "empathy_teamwork": [], "sentiment": []}
    filler_rates = []
    wpms = []
    behavioral_summaries = []
    for resp in responses:
        ba = resp.behavioral_analysis
        if isinstance(ba, str):
            try:
                ba = json.loads(ba)
            except:
                ba = None
        if isinstance(ba, dict):
            for k in behavioral_scores:
                if ba.get(k) is not None:
                    try:
                        behavioral_scores[k].append(float(ba[k]))
                    except:
                        pass
            if ba.get("summary"):
                behavioral_summaries.append(ba["summary"])
            sm = ba.get("speech_metrics", {})
            if sm.get("filler_rate") is not None:
                filler_rates.append(float(sm["filler_rate"]))
            if sm.get("wpm"):
                wpms.append(float(sm["wpm"]))
        # fallback to direct columns
        if resp.filler_rate is not None and resp.filler_rate not in filler_rates:
            filler_rates.append(float(resp.filler_rate))
        if resp.clarity_score is not None and resp.clarity_score not in behavioral_scores["clarity"]:
            pass  # already captured via ba

    # If still empty, run behavioral analysis on-the-fly for responses missing it
    if not any(behavioral_scores.values()) and responses:
        try:
            from app.services.behavioral_analysis import analyze_response
            job_ctx = job.description if job else ""
            for resp in responses:
                if not resp.behavioral_analysis:
                    ba = analyze_response(resp.question_text or "", resp.candidate_response or "", job_ctx)
                    resp.behavioral_analysis = ba
                    resp.filler_rate = ba.get("speech_metrics", {}).get("filler_rate")
                    resp.filler_count = ba.get("speech_metrics", {}).get("filler_count")
                    resp.clarity_score = ba.get("clarity")
                    resp.confidence_score = ba.get("confidence")
                    for k in behavioral_scores:
                        if ba.get(k) is not None:
                            behavioral_scores[k].append(float(ba[k]))
                    filler_rates.append(ba.get("speech_metrics", {}).get("filler_rate", 0))
                    behavioral_summaries.append(ba.get("summary", ""))
            db.commit()
        except Exception as e:
            logger.warning(f"On-the-fly behavioral aggregation failed: {e}")

    def _avg(arr):
        return round(sum(arr)/len(arr), 1) if arr else None

    avg_clarity = _avg(behavioral_scores["clarity"])
    avg_confidence = _avg(behavioral_scores["confidence"])
    avg_star = _avg(behavioral_scores["star_structure"])
    avg_empathy = _avg(behavioral_scores["empathy_teamwork"])
    avg_sentiment = _avg(behavioral_scores["sentiment"])
    avg_filler = round(sum(filler_rates)/len(filler_rates), 1) if filler_rates else None
    avg_wpm_val = round(sum(wpms)/len(wpms), 1) if wpms else None

    # refine communication score using behavioral clarity/confidence if available
    if avg_clarity is not None and avg_confidence is not None:
        comm_score = round((avg_clarity + avg_confidence + min(avg_score + 0.5, 10)) / 3, 1)
    else:
        comm_score = round(min(avg_score + 0.5, 10), 1)

    behavioral_summary = {
        "avg_clarity": avg_clarity,
        "avg_confidence": avg_confidence,
        "avg_star": avg_star,
        "avg_empathy": avg_empathy,
        "avg_sentiment": avg_sentiment,
        "avg_filler_rate": avg_filler,
        "avg_wpm": avg_wpm_val,
        "highlights": behavioral_summaries[:3],
    }

    evaluation = models.Evaluation(
        interview_id=interview_id,
        overall_score=round(avg_score, 1),
        technical_score=round(avg_score, 1),
        communication_score=comm_score,
        relevance_score=round(max(avg_score - 0.3, 0), 1),
        strengths=strengths,
        weaknesses=weaknesses,
        summary=summary,
        behavioral_summary=behavioral_summary,
        avg_filler_rate=avg_filler,
        avg_wpm=avg_wpm_val,
        avg_clarity=avg_clarity,
        avg_confidence=avg_confidence,
        avg_star=avg_star,
    )
    db.add(evaluation)
    db.commit()

    # Webcam proctoring aggregate for the final report
    proctor_summary = None
    try:
        from app.services import proctoring as proctor_svc
        proctor_events = db.query(models.ProctorEvent).filter(
            models.ProctorEvent.interview_id == interview_id
        ).all()
        proctor_summary = proctor_svc.summarize_events(proctor_events)
    except Exception as e:
        logger.warning(f"Proctor aggregation on complete failed: {e}")

    return {"status": "completed", "overall_score": avg_score, "behavioral_summary": behavioral_summary, "proctor_summary": proctor_summary}


def _generate_fallback_questions(job_title, skills, experience_level, count):
    """Generate reasonable fallback questions when AI is unavailable."""
    base_questions = [
        f"Can you walk me through your experience relevant to the {job_title} role?",
        f"Tell me about a challenging project where you used {skills[0] if skills else 'your core skills'}.",
        "Describe a situation where you had to solve a complex technical problem under a tight deadline.",
        "How do you approach learning new technologies or frameworks?",
        "Tell me about a time you had to collaborate with a team to deliver a project.",
        "What interests you about this particular role and company?",
        "How do you prioritize tasks when working on multiple projects?",
        f"As a {experience_level}-level professional, what do you consider your biggest technical strength?",
    ]
    return base_questions[:count]


def _get_fallback_followup(index):
    """Rotating probe used when no LLM is available.

    Delegates to the shared question bank so voice and text paths stay in step.
    """
    return question_flow.rotating_probe(index)
