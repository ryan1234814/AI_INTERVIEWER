from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import models
from app.database.session import get_db
from app.utils.deps import get_current_user

router = APIRouter()


@router.get("/")
async def list_jobs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Job descriptions belonging to the signed-in user only."""
    jobs = (
        db.query(models.JobDescription)
        .filter(models.JobDescription.user_id == current_user.id)
        .order_by(models.JobDescription.created_at.desc())
        .all()
    )
    return {
        "jobs": [
            {
                "id": job.id,
                "title": job.title,
                "description": job.description,
                "requirements": job.requirements or [],
                "created_at": str(job.created_at) if job.created_at else None,
            }
            for job in jobs
        ]
    }
