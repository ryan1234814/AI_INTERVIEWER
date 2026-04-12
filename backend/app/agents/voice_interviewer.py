import logging
from typing import Dict, Any, List
from langchain_core.prompts import PromptTemplate
from langchain_groq import ChatGroq

from app.agents.answer_validator import AnswerValidationAgent
from app.agents.follow_up_agent import FollowUpQuestionAgent
from app.agents.consistency_agent import ConsistencyCheckingAgent
from app.agents.goal_alignment_agent import GoalAlignmentAgent
from app.agents.difficulty_agent import DifficultyCalibrationAgent
from app.agents.timing_pacing_agent import TimingPacingAgent
from app.agents.knowledge_retrieval_agent import KnowledgeRetrievalAgent
from app.agents.question_generator import QuestionGeneratorAgent

logger = logging.getLogger(__name__)

class VoiceInterviewerAgent:
    def __init__(self, groq_api_key: str):
        self.groq_api_key = groq_api_key
        self.validator = AnswerValidationAgent(groq_api_key)
        self.follow_up_agent = FollowUpQuestionAgent(groq_api_key)
        self.consistency_agent = ConsistencyCheckingAgent(groq_api_key)
        self.goal_agent = GoalAlignmentAgent(groq_api_key)
        self.difficulty_agent = DifficultyCalibrationAgent()
        self.timer = TimingPacingAgent()
        self.knowledge_agent = KnowledgeRetrievalAgent(groq_api_key)
        self.question_generator = QuestionGeneratorAgent(groq_api_key)
        
        # Base LLM for general fallback
        self.llm = ChatGroq(api_key=groq_api_key, model="llama-3.3-70b-versatile", temperature=0.7)

    async def conduct_interview(self, transcribed_response: str, interview_context: Dict) -> Dict:
        """
        Orchestrates multiple agents to validate, analyze, and generate the next interview step.
        """
        try:
            # 1. Timing Analysis (Assume simple duration for now as STT is browser side)
            # In a real streaming setup, we'd record start/end more precisely
            duration_stats = {"status": "on_time"} 

            # 2. Answer Validation (Technical/Factual)
            job_context = f"{interview_context['job_description']}"
            validation_result = self.validator.validate_answer(
                interview_context["current_question"],
                transcribed_response,
                job_context
            )
            
            # 3. Consistency Check (Compare with history)
            # We'd need to fetch history from the DB in a real scenario
            history = interview_context.get("history", [])
            consistency_report = self.consistency_agent.check_consistency(history, transcribed_response)

            # 4. Difficulty Calibration
            avg_score = (validation_result.get("technical_accuracy", 5) + validation_result.get("relevance_score", 5)) / 2
            current_difficulty = self.difficulty_agent.calibrate(avg_score, 0)
            difficulty_label = self.difficulty_agent.get_difficulty_label()

            # 5. Determine Next Step (Follow-up vs New Question)
            # Decide to probe deeper if completeness is low or topic is interesting
            should_follow_up = validation_result.get("completeness", 10) < 7
            
            if should_follow_up:
                next_raw_question = self.follow_up_agent.generate_follow_up(
                    interview_context["current_question"],
                    transcribed_response,
                    job_context
                )
            else:
                # Retrieve context for new topic
                skills = interview_context.get("candidate_skills", ["General Programming"])
                # Extract skill related to the job if possible, or pick one
                target_skill = skills[0] if skills else "General Software Engineering" 
                
                # Use specialized QuestionGeneratorAgent for new topics
                questions = self.question_generator.generate_questions(
                    job_description=job_context,
                    candidate_skills=[target_skill],
                    count=1
                )
                next_raw_question = questions[0] if questions else "Can you tell me about your experience with " + target_skill + "?"

            # 6. Goal Alignment
            goal = interview_context.get("goal", "standard technical interview")
            final_question = self.goal_agent.align_question(goal, next_raw_question, job_context)

            return {
                "evaluation": validation_result,
                "next_question": final_question,
                "consistency": consistency_report,
                "difficulty_level": difficulty_label,
                "pacing": duration_stats
            }
        except Exception as e:
            logger.error(f"Error in conduct_interview orchestration: {e}", exc_info=True)
            return {"error": str(e)}

    def evaluate_response(self, question: str, response: str, job_requirements: Dict) -> Dict:
        # Legacy support for websocket.py or other direct calls
        return self.validator.validate_answer(question, response, str(job_requirements))