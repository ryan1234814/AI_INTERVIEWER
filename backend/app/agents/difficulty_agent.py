import logging

logger = logging.getLogger(__name__)

class DifficultyCalibrationAgent:
    """
    Agent meant to dynamically adjust the difficulty level of interview questions based on candidate performance.
    """
    def __init__(self):
        self.current_level = 5  # Scale 1-10
        self.history = []

    def calibrate(self, last_score: float, response_time: float) -> int:
        """
        Adjusts difficulty based on last score.
        Simple logic:
        - Score > 8: Increase difficulty
        - Score < 4: Decrease difficulty
        - Else: Maintain
        """
        if last_score > 8:
            self.current_level = min(10, self.current_level + 1)
        elif last_score < 4:
            self.current_level = max(1, self.current_level - 1)
        
        logger.info(f"Difficulty Calibrated to Level: {self.current_level}")
        return self.current_level

    def get_difficulty_label(self) -> str:
        if self.current_level <= 3:
            return "Entry"
        elif self.current_level <= 7:
            return "Mid-level"
        else:
            return "Senior/Expert"
