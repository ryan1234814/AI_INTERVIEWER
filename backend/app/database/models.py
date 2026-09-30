from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database.base import Base

class JobDescription(Base):
    __tablename__ = "job_descriptions"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    description = Column(Text)
    requirements = Column(JSON)  # List of requirements
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    interviews = relationship("Interview", back_populates="job")

class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    resume_path = Column(String)
    extracted_skills = Column(JSON)
    experience_summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    interviews = relationship("Interview", back_populates="candidate")

class Interview(Base):
    __tablename__ = "interviews"
    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("job_descriptions.id"))
    candidate_id = Column(Integer, ForeignKey("candidates.id"))
    status = Column(String, default="pending")  # pending, ongoing, completed
    goal = Column(String, default="Standard Technical Interview")
    current_question_index = Column(Integer, default=0)
    total_questions = Column(Integer, default=5)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    job = relationship("JobDescription", back_populates="interviews")
    candidate = relationship("Candidate", back_populates="interviews")
    responses = relationship("InterviewResponse", back_populates="interview")
    evaluation = relationship("Evaluation", back_populates="interview", uselist=False)

class InterviewResponse(Base):
    __tablename__ = "interview_responses"
    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"))
    question_text = Column(Text)
    candidate_response = Column(Text)
    audio_path = Column(String, nullable=True)
    evaluation_score = Column(Float, nullable=True)
    feedback = Column(Text, nullable=True)
    # Behavioral & soft-skill fields
    behavioral_analysis = Column(JSON, nullable=True)  # full STAR + soft-skill breakdown
    filler_count = Column(Integer, nullable=True)
    filler_rate = Column(Float, nullable=True)
    wpm = Column(Integer, nullable=True)
    sentiment_label = Column(String, nullable=True)
    clarity_score = Column(Float, nullable=True)
    confidence_score = Column(Float, nullable=True)
    
    interview = relationship("Interview", back_populates="responses")

class ProctorEvent(Base):
    """Webcam proctoring event log — one row per warning / periodic heartbeat.

    New table (auto-created via Base.metadata.create_all), so no migration
    is needed for existing databases.
    """
    __tablename__ = "proctor_events"
    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"), index=True)
    event_type = Column(String, index=True)  # focused | distracted | no_face | multi_face | phone_detected | device_detected | tab_hidden | warning | heartbeat
    detail = Column(Text, nullable=True)
    focus_score = Column(Float, nullable=True)  # 0-100 snapshot at event time
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    interview = relationship("Interview", back_populates="proctor_events")


# Attach reverse relationship to Interview (defined after ProctorEvent so the
# class exists at import time).
Interview.proctor_events = relationship(
    "ProctorEvent", back_populates="interview", cascade="all, delete-orphan"
)


class Evaluation(Base):
    __tablename__ = "evaluations"
    id = Column(Integer, primary_key=True, index=True)
    interview_id = Column(Integer, ForeignKey("interviews.id"))
    overall_score = Column(Float)
    technical_score = Column(Float)
    communication_score = Column(Float)
    relevance_score = Column(Float)
    strengths = Column(JSON)
    weaknesses = Column(JSON)
    summary = Column(Text)
    # Behavioral aggregate fields
    behavioral_summary = Column(JSON, nullable=True)  # aggregated behavioral scores
    avg_filler_rate = Column(Float, nullable=True)
    avg_wpm = Column(Float, nullable=True)
    avg_clarity = Column(Float, nullable=True)
    avg_confidence = Column(Float, nullable=True)
    avg_star = Column(Float, nullable=True)
    
    interview = relationship("Interview", back_populates="evaluation")
