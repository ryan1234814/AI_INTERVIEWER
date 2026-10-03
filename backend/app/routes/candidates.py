from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import models
from app.database.session import get_db
from app.utils.deps import get_current_user

router = APIRouter()


@router.get("/")
async def list_candidates(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Candidates belonging to the signed-in user only.

    The stored `resume_path` is intentionally not returned: it is a server-side
    filesystem path and the interview detail endpoints already expose the
    candidate's parsed profile.
    """
    candidates = (
        db.query(models.Candidate)
        .filter(models.Candidate.user_id == current_user.id)
        .order_by(models.Candidate.created_at.desc())
        .all()
    )
    return {
        "candidates": [
            {
                "id": c.id,
                "name": c.name,
                "email": c.email,
                "extracted_skills": c.extracted_skills or [],
                "experience_summary": c.experience_summary,
                "created_at": str(c.created_at) if c.created_at else None,
            }
            for c in candidates
        ]
    }
