import os
import logging
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database import models, crud
from app.config import settings
from app.utils.pdf_generator import generate_interview_pdf
from typing import Optional
import json

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/{interview_id}/report")
async def get_interview_report(interview_id: int, db: Session = Depends(get_db)):
    """
    Download the interview performance report as a PDF.
    """
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    if interview.status != "completed":
        raise HTTPException(status_code=400, detail="Interview is not completed yet")
    
    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()
    evaluation = db.query(models.Evaluation).filter(models.Evaluation.interview_id == interview_id).first()
    responses = db.query(models.InterviewResponse).filter(models.InterviewResponse.interview_id == interview_id).all()
    
    if not evaluation:
        raise HTTPException(status_code=404, detail="Evaluation not found for this interview")

    pdf_buffer = generate_interview_pdf(
        candidate.name,
        job.title,
        evaluation,
        responses
    )
    
    filename = f"Interview_Report_{candidate.name.replace(' ', '_')}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/")
async def list_interviews(db: Session = Depends(get_db)):
    interviews = db.query(models.Interview).order_by(models.Interview.started_at.desc()).all()
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
async def get_interview(interview_id: int, db: Session = Depends(get_db)):
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()

    responses = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id
    ).all()

    return {
        "id": interview.id,
        "status": interview.status,
        "total_questions": interview.total_questions,
        "current_question_index": interview.current_question_index,
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
            }
            for r in responses
        ],
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

        # Create DB records
        db_job = crud.create_job_description(db, title=job_title, description=full_description, requirements=requirements)
        db_candidate = crud.create_candidate(
            db,
            name=candidate_name,
            email=candidate_email,
            resume_path=resume_path,
            extracted_skills=extracted_skills,
            experience_summary=experience_summary,
        )
        db_interview = crud.create_interview(db, job_id=db_job.id, candidate_id=db_candidate.id, total_questions=num_questions, goal=goal)

        # Generate initial questions
        questions = []
        try:
            from app.agents.question_generator import QuestionGeneratorAgent
            generator = QuestionGeneratorAgent(settings.GROQ_API_KEY)
            questions = generator.generate_questions(full_description, extracted_skills, count=num_questions)
        except Exception as e:
            logger.warning(f"AI question generation failed (using fallback): {e}")
            questions = _generate_fallback_questions(job_title, extracted_skills, experience_level, num_questions)

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
):
    """
    Submit a text-based response for the current question.
    Returns evaluation + next question.
    """
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    job = db.query(models.JobDescription).filter(models.JobDescription.id == interview.job_id).first()
    candidate = db.query(models.Candidate).filter(models.Candidate.id == interview.candidate_id).first()

    # Save the response
    response_record = models.InterviewResponse(
        interview_id=interview_id,
        question_text=question_text,
        candidate_response=candidate_response,
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
        response_record.evaluation_score = 7.0  # Default if parsing fails
    except Exception as e:
        logger.warning(f"AI evaluation failed: {e}")
        evaluation = {
            "evaluation": f"Response recorded for: {question_text[:50]}..."
        }
        response_record.feedback = "Evaluation pending"

    # Update interview progress
    interview.current_question_index += 1
    if interview.current_question_index >= interview.total_questions:
        interview.status = "completed"
    else:
        interview.status = "ongoing"

    db.commit()
    db.refresh(response_record)

    # Generate next question if not done
    next_question = ""
    if interview.status != "completed":
        try:
            from app.agents.question_generator import QuestionGeneratorAgent
            generator = QuestionGeneratorAgent(settings.GROQ_API_KEY)
            next_question = generator.generate_followup(candidate_response, question_text)
        except Exception as e:
            logger.warning(f"Follow-up generation failed: {e}")
            next_question = _get_fallback_followup(interview.current_question_index)

    return {
        "response_id": response_record.id,
        "evaluation": evaluation,
        "next_question": next_question,
        "current_index": interview.current_question_index,
        "total_questions": interview.total_questions,
        "status": interview.status,
    }


@router.post("/{interview_id}/complete")
async def complete_interview(interview_id: int, db: Session = Depends(get_db)):
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    interview.status = "completed"
    from datetime import datetime
    interview.completed_at = datetime.utcnow()

    # Calculate overall scores from responses
    responses = db.query(models.InterviewResponse).filter(
        models.InterviewResponse.interview_id == interview_id,
        models.InterviewResponse.evaluation_score.isnot(None)
    ).all()

    avg_score = sum(r.evaluation_score for r in responses) / len(responses) if responses else 5.0

    evaluation = models.Evaluation(
        interview_id=interview_id,
        overall_score=avg_score,
        technical_score=avg_score,
        communication_score=avg_score,
        relevance_score=avg_score,
        strengths=["Good responses"],
        weaknesses=["Could elaborate more"],
        summary=f"Interview completed with {len(responses)} responses.",
    )
    db.add(evaluation)
    db.commit()

    return {"status": "completed", "overall_score": avg_score}


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
    followups = [
        "Can you elaborate on the technologies you used in that project?",
        "What was the biggest challenge you faced, and how did you overcome it?",
        "How did you measure the success of that approach?",
        "What would you do differently if you could redo that project?",
        "Tell me about a time when that approach didn't work out as planned.",
    ]
    return followups[index % len(followups)]
