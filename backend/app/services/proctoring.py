"""Webcam proctoring service — pure, dependency-free logic.

The heavy computer-vision work (face/object detection) runs in the browser
(frontend hook `useProctoring`). The backend only validates, normalises and
aggregates the events the client reports, so this module has zero third-party
CV dependencies and cannot break the server install.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Event types accepted from the client.
ALLOWED_EVENT_TYPES = frozenset({
    "focused",
    "distracted",
    "no_face",
    "multi_face",
    "phone_detected",
    "device_detected",
    "tab_hidden",
    "tab_visible",
    "warning",
    "heartbeat",
})

# Event types that count as a distraction for focus-% purposes.
DISTRACTED_TYPES = frozenset({
    "distracted",
    "no_face",
    "multi_face",
    "phone_detected",
    "device_detected",
    "tab_hidden",
})

# Event types that raise an integrity warning for the candidate/recruiter.
WARNING_TYPES = frozenset({
    "distracted",
    "no_face",
    "multi_face",
    "phone_detected",
    "device_detected",
    "tab_hidden",
    "warning",
})

# Device labels (COCO-SSD vocabulary) that trigger a device warning.
DEVICE_LABELS = frozenset({
    "cell phone",
    "laptop",
    "tablet",
    "computer",
    "tv",
    "book",
})

FOCUS_MIN = 0.0
FOCUS_MAX = 100.0


def clamp_focus(value: Any) -> Optional[float]:
    """Clamp a focus score to [0, 100]; return None when not a number."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v:  # NaN guard
        return None
    return max(FOCUS_MIN, min(FOCUS_MAX, v))


def normalize_event(event_type: str, detail: Any = None,
                    focus_score: Any = None) -> Dict[str, Any]:
    """Validate + normalise a client-reported proctor event.

    Raises ValueError for unknown event types so the API/WS layer can
    return a clean 400 / error frame instead of persisting garbage.
    """
    if not isinstance(event_type, str):
        raise ValueError("event_type must be a string")
    et = event_type.strip().lower()
    if et not in ALLOWED_EVENT_TYPES:
        raise ValueError(f"Unknown proctor event_type: {event_type!r}")
    return {
        "event_type": et,
        "detail": str(detail)[:1000] if detail is not None else None,
        "focus_score": clamp_focus(focus_score),
    }


def is_distracted(event_type: str) -> bool:
    return event_type in DISTRACTED_TYPES


def is_warning(event_type: str) -> bool:
    return event_type in WARNING_TYPES


def is_prohibited_device(label: str) -> bool:
    """True when a detected object label is a flaggable device."""
    if not isinstance(label, str):
        return False
    return label.strip().lower() in DEVICE_LABELS


# Policy: after this many integrity warnings the interview is auto-closed.
MAX_WARNINGS = 6

TERMINATION_REASON = (
    "Interview terminated automatically: 6 proctoring warnings received "
    "(unauthorised devices, multiple faces, or leaving the interview tab). "
    "Please contact your recruiter to reschedule."
)


def count_warnings(events: List[Any]) -> int:
    """Number of warning-type events in a list of rows/dicts."""
    total = 0
    for ev in events:
        if isinstance(ev, dict):
            et = str(ev.get("event_type") or "").lower()
        else:
            et = str(getattr(ev, "event_type", "") or "").lower()
        if et in WARNING_TYPES:
            total += 1
    return total


def should_terminate(warning_count: int, limit: int = MAX_WARNINGS) -> bool:
    """True when warnings exceed the auto-close threshold (> limit)."""
    try:
        return int(warning_count) > int(limit)
    except (TypeError, ValueError):
        return False


def termination_reason(warning_count: int, limit: int = MAX_WARNINGS) -> str:
    return (
        f"Interview terminated automatically: {warning_count} proctoring warnings "
        f"received (limit is {limit} without termination; closed on warning "
        f"{limit + 1}). Unauthorised devices, multiple faces, or leaving the "
        f"interview tab trigger warnings. Please contact your recruiter to reschedule."
    )


def compute_focus_pct(focused_frames: int, total_frames: int) -> float:
    """Focus % = focused frames / total frames * 100 (0 when no frames)."""
    try:
        total = int(total_frames)
        focused = int(focused_frames)
    except (TypeError, ValueError):
        return 0.0
    if total <= 0:
        return 0.0
    focused = max(0, min(focused, total))
    return round(focused / total * 100.0, 1)


def summarize_events(events: List[Any]) -> Dict[str, Any]:
    """Aggregate ProctorEvent rows (or dicts) into a dashboard summary.

    Accepts SQLAlchemy objects or plain dicts with keys
    ``event_type`` / ``focus_score`` so it is trivially unit-testable.
    """
    def _get(ev: Any, key: str) -> Any:
        if isinstance(ev, dict):
            return ev.get(key)
        return getattr(ev, key, None)

    total = len(events)
    counts: Dict[str, int] = {}
    focus_vals: List[float] = []
    warnings = 0
    device_hits = 0
    distracted_hits = 0

    for ev in events:
        et = str(_get(ev, "event_type") or "").lower()
        counts[et] = counts.get(et, 0) + 1
        fs = clamp_focus(_get(ev, "focus_score"))
        if fs is not None:
            focus_vals.append(fs)
        if et in WARNING_TYPES:
            warnings += 1
        if et in ("phone_detected", "device_detected"):
            device_hits += 1
        if et in DISTRACTED_TYPES:
            distracted_hits += 1

    avg_focus = round(sum(focus_vals) / len(focus_vals), 1) if focus_vals else None
    # Frame-based focus % treats warning-free events as focused.
    focus_pct = (
        round((total - distracted_hits) / total * 100.0, 1) if total else 100.0
    )

    if focus_pct >= 85 and warnings == 0:
        integrity = "excellent"
    elif focus_pct >= 70 and device_hits == 0:
        integrity = "good"
    elif focus_pct >= 50:
        integrity = "needs_review"
    else:
        integrity = "flagged"

    return {
        "total_events": total,
        "counts": counts,
        "warnings": warnings,
        "device_detections": device_hits,
        "distracted_events": distracted_hits,
        "avg_focus": avg_focus,
        "focus_pct": focus_pct,
        "integrity": integrity,
    }
