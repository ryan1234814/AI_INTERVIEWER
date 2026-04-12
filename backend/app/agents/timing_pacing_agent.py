import time
import logging

logger = logging.getLogger(__name__)

class TimingPacingAgent:
    """
    Agent that monitors the candidate’s response time and the overall duration of the interview.
    """
    def __init__(self, time_limit_per_question: int = 120):
        self.start_times = {}
        self.time_limit = time_limit_per_question

    def record_start(self, question_id: str):
        self.start_times[question_id] = time.time()

    def record_end(self, question_id: str) -> dict:
        if question_id not in self.start_times:
            return {"duration": 0, "status": "unknown"}
            
        duration = time.time() - self.start_times[question_id]
        status = "on_time"
        if duration > self.time_limit:
            status = "overtime"
        elif duration < 10:
            status = "too_short"
            
        return {
            "duration": round(duration, 2),
            "status": status,
            "limit": self.time_limit
        }
