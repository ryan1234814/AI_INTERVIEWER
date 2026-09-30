import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.database import models, crud
from app.services import proctoring as proctor_svc

router = APIRouter()
logger = logging.getLogger(__name__)


class ProctorEventIn(BaseModel):
    event_type: str = Field(..., description="e.g. focused, distracted, phone_detected, ...")
    detail: Optional[str] = None
    focus_score: Optional[float] = None


def _require_interview(db: Session, interview_id: int):
    interview = crud.get_interview(db, interview_id)
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return interview


@router.post("/{interview_id}/proctor-event")
async def report_proctor_event(interview_id: int, payload: ProctorEventIn,
                               db: Session = Depends(get_db)):
    """Persist a single webcam-proctoring event sent by the frontend."""
    _require_interview(db, interview_id)
    try:
        clean = proctor_svc.normalize_event(
            payload.event_type, payload.detail, payload.focus_score
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    ev = models.ProctorEvent(
        interview_id=interview_id,
        event_type=clean["event_type"],
        detail=clean["detail"],
        focus_score=clean["focus_score"],
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {"id": ev.id, "event_type": ev.event_type,
            "is_warning": proctor_svc.is_warning(ev.event_type)}


@router.get("/{interview_id}/proctor-summary")
async def get_proctor_summary(interview_id: int, db: Session = Depends(get_db)):
    """Aggregated focus % / warning counts for dashboards and reports."""
    _require_interview(db, interview_id)
    events = db.query(models.ProctorEvent).filter(
        models.ProctorEvent.interview_id == interview_id
    ).order_by(models.ProctorEvent.id.asc()).all()
    summary = proctor_svc.summarize_events(events)
    summary["interview_id"] = interview_id
    return summary
