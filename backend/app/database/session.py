from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from typing import Any, Dict
from app.config import settings

# make_url parses the dialect properly; a substring test on the whole URL was
# wrong, because a Postgres DSN with "sqlite" anywhere in it (service username,
# database name) took the SQLite branch and passed check_same_thread to psycopg2,
# which rejects unknown connect_args with a TypeError.
IS_SQLITE = make_url(settings.DATABASE_URL).get_backend_name() == "sqlite"

# SQLite (local dev) needs a thread-sharing escape hatch. Serverless Postgres
# (Neon/Supabase) needs the opposite kind of care: its compute suspends after a
# few idle minutes and the pooler drops long-lived connections, so a checkout can
# hand back a socket the server already closed. pool_pre_ping makes SQLAlchemy
# notice and reconnect transparently instead of failing the request, and
# pool_recycle keeps every connection younger than the pooler's idle timeout.
#
# Scope limit worth knowing: both flags fire only when a connection is checked
# *out*, so they protect the first request after a wake-up. They cannot rescue a
# connection already in use — the WebSocket interview route depends on get_db for
# the whole session, so if Neon suspends mid-interview that socket is severed and
# neither flag helps.
ENGINE_KWARGS: Dict[str, Any] = (
    {"connect_args": {"check_same_thread": False}}
    if IS_SQLITE
    else {"pool_pre_ping": True, "pool_recycle": 1800}
)

engine = create_engine(settings.DATABASE_URL, **ENGINE_KWARGS)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
