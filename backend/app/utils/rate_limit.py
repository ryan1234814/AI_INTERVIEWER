"""Minimal in-process sliding-window rate limiter for the auth endpoints.

Deliberately dependency-free (no Redis) because the app currently runs as a
single Render web service. Counts are per process, so this blunts credential
stuffing rather than eliminating it; a multi-worker deployment should move the
same keys to a shared store.
"""

import logging
import threading
import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_hits: Dict[str, Deque[float]] = defaultdict(deque)


def rate_limit(key: str, limit: int, window_seconds: int = 60) -> None:
    """Raise 429 when `key` has been seen `limit` times inside the window."""
    now = time.monotonic()
    cutoff = now - window_seconds

    with _lock:
        bucket = _hits[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = int(window_seconds - (now - bucket[0])) + 1
            logger.warning("Rate limit hit for %s (%d/%ds)", key, limit, window_seconds)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again shortly.",
                headers={"Retry-After": str(max(retry_after, 1))},
            )
        bucket.append(now)


def reset() -> None:
    """Clear all counters (used by tests)."""
    with _lock:
        _hits.clear()
