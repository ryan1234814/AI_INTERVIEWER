from sqlalchemy.orm import Session
from app.database import models
from app.utils.security import hash_password, verify_password


def get_user_by_email(db: Session, email: str):
    return (
        db.query(models.User)
        .filter(models.User.email == (email or "").lower().strip())
        .first()
    )

def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def create_user(db: Session, name: str, email: str, password: str):
    db_user = models.User(
        name=name.strip(),
        email=email.lower().strip(),
        hashed_password=hash_password(password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def authenticate_user(db: Session, email: str, password: str):
    """Return the User when the email/password pair matches, else None."""
    db_user = get_user_by_email(db, email)
    if not db_user:
        return None
    if not verify_password(password, db_user.hashed_password):
        return None
    return db_user

def get_job_description(db: Session, job_id: int):
    return db.query(models.JobDescription).filter(models.JobDescription.id == job_id).first()

def get_candidate(db: Session, candidate_id: int):
    return db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()

def get_interview(db: Session, interview_id: int):
    return db.query(models.Interview).filter(models.Interview.id == interview_id).first()

def create_job_description(db: Session, title: str, description: str, requirements: list, user_id: int = None):
    db_job = models.JobDescription(title=title, description=description, requirements=requirements, user_id=user_id)
    db.add(db_job)
    db.commit()
    db.refresh(db_job)
    return db_job

def create_candidate(db: Session, name: str, email: str, resume_path: str, extracted_skills: list, experience_summary: str, user_id: int = None):
    # Normalize email
    email = email.lower().strip()
    
    # Candidates are scoped per owner. Without a user (legacy/internal callers)
    # the old global email lookup is kept so existing behaviour is unchanged.
    query = db.query(models.Candidate).filter(models.Candidate.email == email)
    if user_id is not None:
        query = query.filter(models.Candidate.user_id == user_id)
    db_candidate = query.first()
    
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
            experience_summary=experience_summary,
            user_id=user_id,
        )
        db.add(db_candidate)
        
    try:
        db.commit()
    except Exception:
        db.rollback()
        # Try to fetch again in case of race condition
        db_candidate = query.first()
        if not db_candidate:
            raise
            
    db.refresh(db_candidate)
    return db_candidate

def create_interview(db: Session, job_id: int, candidate_id: int, total_questions: int = 5, goal: str = "Standard Technical Interview", planned_questions: list = None, user_id: int = None):
    db_interview = models.Interview(
        job_id=job_id,
        candidate_id=candidate_id,
        total_questions=total_questions,
        goal=goal,
        planned_questions=planned_questions or [],
        user_id=user_id,
    )
    db.add(db_interview)
    db.commit()
    db.refresh(db_interview)
    return db_interview
