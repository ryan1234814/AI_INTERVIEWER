from sqlalchemy.orm import Session
from app.database import models

def get_job_description(db: Session, job_id: int):
    return db.query(models.JobDescription).filter(models.JobDescription.id == job_id).first()

def get_candidate(db: Session, candidate_id: int):
    return db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()

def get_interview(db: Session, interview_id: int):
    return db.query(models.Interview).filter(models.Interview.id == interview_id).first()

def create_job_description(db: Session, title: str, description: str, requirements: list):
    db_job = models.JobDescription(title=title, description=description, requirements=requirements)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def create_candidate(db: Session, name: str, email: str, resume_path: str, extracted_skills: list, experience_summary: str):
    # Normalize email
    email = email.lower().strip()
    
    # Check if candidate exists (case-insensitive search)
    db_candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
    
    if db_candidate:
        # Update existing candidate
        db_candidate.name = name
        db_candidate.resume_path = resume_path
        db_candidate.extracted_skills = extracted_skills
        db_candidate.experience_summary = experience_summary
    else:
        # Create new candidate
        db_candidate = models.Candidate(
            name=name, 
            email=email, 
            resume_path=resume_path, 
            extracted_skills=extracted_skills, 
            experience_summary=experience_summary
        )
        db.add(db_candidate)
        
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        # Try to fetch again in case of race condition
        db_candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
        if not db_candidate:
            raise e
            
    db.refresh(db_candidate)
    return db_candidate

def create_interview(db: Session, job_id: int, candidate_id: int, total_questions: int = 5, goal: str = "Standard Technical Interview"):
    db_interview = models.Interview(job_id=job_id, candidate_id=candidate_id, total_questions=total_questions, goal=goal)
    db.add(db_interview)
    db.commit()
    db.refresh(db_interview)
    return db_interview
