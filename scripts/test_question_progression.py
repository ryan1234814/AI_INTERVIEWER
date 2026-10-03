"""End-to-end check for the "asks the same question over and over" regression.

Drives a real interview over the WebSocket exactly like the browser does and
asserts that:
  1. every question asked is distinct (no repeats at all)
  2. the interview advances to completion within the expected number of turns
  3. a reconnect resumes where the candidate left off instead of restarting
     at question 1

Usage: python scripts/test_question_progression.py
"""

import asyncio
import json
import os
import traceback

import httpx
import websockets

BASE = os.environ.get("BASE_URL", "http://localhost:8000")
WS = BASE.replace("http://", "ws://") + "/ws/interview/{iid}"
RESUME = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "backend", "uploads", "3feve_Ryan_George_Resume_Updated-2.pdf",
)
NUM_QUESTIONS = 4

ANSWERS = [
    "I have built several FastAPI services with automated pytest coverage.",
    "The hardest part was a race condition; I isolated it with structured logging.",
    "We measured success by p99 latency dropping from 800ms to 120ms.",
    "I would add contract tests earlier, since integration drift cost us a release.",
    "Let me give another concrete example of the load testing harness I wrote.",
    "I led the migration and paired with two juniors on the rollout plan.",
    "Honestly I would introduce feature flags to decouple deploy from release.",
    "That approach failed once; I reverted and shipped a smaller increment.",
]


def norm(t: str) -> str:
    return "".join(ch for ch in (t or "").lower() if ch.isalnum() or ch == " ").strip()


async def open_interview() -> int:
    with open(RESUME, "rb") as f:
        files = {"resume": ("resume.pdf", f.read(), "application/pdf")}
        data = {
            "job_title": "Senior Backend Engineer",
            "job_description": "Design and operate high throughput Python services.",
            "role": "Backend",
            "experience_level": "senior",
            "candidate_name": "Progression Tester",
            "candidate_email": "progression_tester@example.com",
            "num_questions": str(NUM_QUESTIONS),
            "goal": "Standard Technical Interview",
        }
        r = await httpx.AsyncClient(timeout=120).post(
            f"{BASE}/api/v1/interviews/setup", files=files, data=data
        )
    r.raise_for_status()
    body = r.json()
    print(f"  setup -> interview {body['interview_id']}, {len(body['questions'])} planned questions")
    return body["interview_id"]


async def recv_question(ws, timeout=90):
    """Read until a message carrying next_question / status arrives."""
    deadline = asyncio.get_event_loop().time() + timeout
    while True:
        remaining = deadline - asyncio.get_event_loop().time()
        if remaining <= 0:
            raise asyncio.TimeoutError("no question arrived in time")
        msg = json.loads(await asyncio.wait_for(ws.recv(), remaining))
        if msg.get("status") == "completed":
            return msg.get("next_question", ""), msg
        if msg.get("next_question"):
            return msg["next_question"], msg
        # otherwise ignore acks/heartbeats and keep reading


async def run_full_interview():
    print("\n=== Test 1: full interview must never repeat a question ===")
    iid = await open_interview()
    asked = []
    turn = 0

    async with websockets.connect(WS.format(iid=iid), max_size=None) as ws:
        question, _ = await recv_question(ws)
        while True:
            asked.append(question)
            print(f"  Q{len(asked)}: {question[:88]}")
            if turn >= len(ANSWERS) * 2:
                raise AssertionError("interview did not terminate — possible infinite loop")
            await ws.send(json.dumps({
                "type": "text", "content": ANSWERS[turn % len(ANSWERS)]
            }))
            turn += 1
            question, last = await recv_question(ws)
            if last.get("status") == "completed":
                print(f"  interview completed after {turn} answers")
                break

    repeats = [q for i, q in enumerate(asked) if norm(q) in [norm(p) for p in asked[:i]]]
    assert not repeats, f"REPEATED QUESTIONS detected: {repeats}"
    assert len(asked) >= NUM_QUESTIONS, f"only {len(asked)} questions asked, expected >= {NUM_QUESTIONS}"
    print(f"  PASS: {len(asked)} distinct questions, zero repeats")
    return iid


async def run_resume_test():
    print("\n=== Test 2: reconnect must resume, not restart at question 1 ===")
    iid = await open_interview()

    async with websockets.connect(WS.format(iid=iid), max_size=None) as ws:
        first, _ = await recv_question(ws)
        print(f"  first connect : {first[:70]}")
        await ws.send(json.dumps({"type": "text", "content": ANSWERS[0]}))
        second, _ = await recv_question(ws)
        print(f"  after answer 1: {second[:70]}")

    # Reconnect mid-interview — previously this replayed the introduction.
    async with websockets.connect(WS.format(iid=iid), max_size=None) as ws:
        resumed, _ = await recv_question(ws)
        print(f"  on reconnect  : {resumed[:70]}")

    detail = (await httpx.AsyncClient(timeout=60).get(
        f"{BASE}/api/v1/interviews/{iid}")).json()
    print(f"  stored index  : {detail['current_question_index']} / {detail['total_questions']}")
    assert norm(resumed) != norm(first), (
        f"reconnect restarted at question 1: {resumed!r}"
    )
    assert detail["current_question_index"] >= 1, "progress was not persisted"
    print("  PASS: reconnect resumed forward")


async def main():
    if not os.path.exists(RESUME):
        print(f"SKIP: fixture resume not found at {RESUME}")
        return 0
    try:
        await run_full_interview()
        await run_resume_test()
    except (httpx.HTTPError,) as e:
        print(f"ERROR reaching backend at {BASE}: {e!r}")
        return 1
    except BaseException:
        # Surface the real failure (connection drops, assertion, agent error)
        # instead of reporting an empty message.
        traceback.print_exc()
        return 1
    print("\nALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
