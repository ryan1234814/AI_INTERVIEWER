import asyncio
import logging
from typing import Dict, Any, List
from langchain_core.prompts import PromptTemplate
from langchain_groq import ChatGroq

from app.config import settings
from app.agents.answer_validator import AnswerValidationAgent
from app.agents.follow_up_agent import FollowUpQuestionAgent
from app.agents.consistency_agent import ConsistencyCheckingAgent
from app.agents.goal_alignment_agent import GoalAlignmentAgent
from app.agents.difficulty_agent import DifficultyCalibrationAgent
from app.agents.timing_pacing_agent import TimingPacingAgent
from app.agents.knowledge_retrieval_agent import KnowledgeRetrievalAgent
from app.agents.question_generator import QuestionGeneratorAgent
from app.services import question_flow

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
        self.llm = ChatGroq(api_key=groq_api_key, model=settings.GROQ_MODEL, temperature=0.7)

    async def conduct_interview(self, transcribed_response: str, interview_context: Dict) -> Dict:
        """Run the interview turn off the event loop.

        The agent chain below is built on synchronous LLM calls taking several
        seconds each. Awaiting them directly blocks the WebSocket loop, which
        stalls keepalive pongs and gets the connection dropped (the client then
        reconnects and the interview appears to restart). Running it in a worker
        thread keeps the socket alive.
        """
        return await asyncio.to_thread(self._conduct_interview_sync, transcribed_response, interview_context)

    def _conduct_interview_sync(self, transcribed_response: str, interview_context: Dict) -> Dict:
        """
        Orchestrates multiple agents to validate, analyze, and generate the next interview step.
        """
        try:
            asked_question = interview_context.get("current_question", "")

            # 0. Repeat request: candidate could not hear / wants the same
            # question again. Echo it verbatim without advancing or scoring.
            if question_flow.is_repeat_request(transcribed_response):
                logger.info("[Agent] Repeat request detected — echoing current question")
                repeat_q = (asked_question or "").strip() or question_flow.OPENING_QUESTION
                return {
                    "evaluation": {
                        "technical_accuracy": 0,
                        "relevance_score": 0,
                        "completeness": 10,
                        "feedback": "Question repeated on request (not scored).",
                        "is_repeat": True,
                    },
                    "next_question": repeat_q,
                    "is_follow_up": True,  # stay on the same planned question
                    "is_repeat": True,
                    "consistency": {"inconsistency_detected": False},
                    "difficulty_level": self.difficulty_agent.get_difficulty_label(),
                    "pacing": {"status": "on_time"},
                }

            # 1. Timing Analysis (Assume simple duration for now as STT is browser side)
            # In a real streaming setup, we'd record start/end more precisely
            duration_stats = {"status": "on_time"} 

            # 2. Answer Validation (Technical/Factual)
            # Bound the job context: it is repeated into every agent call in this
            # turn, and blowing Groq's tokens-per-minute budget turns these calls
            # into 429s that force every agent onto its fallback path.
            job_context = question_flow.clip(
                f"{interview_context['job_description']}",
                settings.LLM_JOB_CONTEXT_CHARS,
            )
            validation_result = self.validator.validate_answer(
                interview_context["current_question"],
                transcribed_response,
                job_context
            )
            
            # 3. Consistency Check (Compare with history)
            # Only the recent turns are sent (see trim_history), and the call is
            # skipped entirely until there is a previous answer to compare against.
            history = question_flow.trim_history(
                interview_context.get("history", []),
                max_turns=settings.LLM_HISTORY_TURNS,
            )
            if len(history) > 1:
                consistency_report = self.consistency_agent.check_consistency(history, transcribed_response)
            else:
                consistency_report = {
                    "inconsistency_detected": False,
                    "analysis": "No previous answers to compare against.",
                    "clarification_question": None,
                }

            # 4. Difficulty Calibration
            avg_score = (validation_result.get("technical_accuracy", 5) + validation_result.get("relevance_score", 5)) / 2
            current_difficulty = self.difficulty_agent.calibrate(avg_score, 0)
            difficulty_label = self.difficulty_agent.get_difficulty_label()

            # 5. Determine Next Step (Follow-up vs New Question)
            # Check if user explicitly wants to move on
            transcript_lower = transcribed_response.lower()
            explicit_move_on = any(phrase in transcript_lower for phrase in [
                "move on", "next question", "skip", "skip this", "let's move", 
                "go to next", "proceed to", "move forward", "continue"
            ])
            
            completeness = validation_result.get("completeness", 10)
            # Follow-ups are budgeted per planned question. Without this cap a low
            # completeness score (e.g. from the validator's offline fallback) would
            # make the interviewer re-ask the same question every single turn.
            follow_ups_remaining = int(
                interview_context.get("follow_ups_remaining", settings.MAX_FOLLOW_UPS_PER_QUESTION)
            )
            
            logger.info(
                f"[Agent] completeness={completeness}, explicit_move_on={explicit_move_on}, "
                f"follow_ups_remaining={follow_ups_remaining}, transcript_len={len(transcribed_response)}"
            )
            
            # Probe deeper only when the answer was thin, budget remains, and the
            # candidate did not ask to move on.
            should_follow_up = (
                (completeness < 7) and not explicit_move_on and follow_ups_remaining > 0
            )
            is_follow_up = should_follow_up
            from_planned_bank = False
            
            if should_follow_up:
                logger.info("[Agent] Generating FOLLOW-UP probe")
                next_raw_question = self.follow_up_agent.generate_simplified_reask_and_followup(
                    asked_question,
                    transcribed_response,
                    job_context
                )
            else:
                logger.info("[Agent] Advancing to NEW question")
                next_raw_question, from_planned_bank = self._advance_to_new_question(
                    interview_context, job_context
                )

            # Repeat guard runs on BOTH branches: a "simplified re-ask" often echoes
            # the original question, which is what made the app loop on question 1.
            if question_flow.is_repeat(next_raw_question, asked_question):
                logger.warning("[Agent] Next question repeated the current one; advancing instead")
                next_raw_question, from_planned_bank = self._advance_to_new_question(
                    interview_context, job_context
                )
                is_follow_up = False

            # 6. Goal Alignment
            # Skipped when the question came straight from the planned bank: those
            # were generated for this job description already, so re-writing them
            # costs an LLM call, risks turning them into a repeat, and adds nothing.
            goal = interview_context.get("goal", "standard technical interview")
            if from_planned_bank:
                final_question = next_raw_question
            else:
                final_question = self.goal_agent.align_question(goal, next_raw_question, job_context)

            # Goal alignment must not turn a new question back into a repeat either.
            if question_flow.is_repeat(final_question, asked_question):
                logger.warning("[Agent] Goal-aligned question repeated the current one; using pre-alignment text")
                final_question = next_raw_question

            return {
                "evaluation": validation_result,
                "next_question": final_question,
                "is_follow_up": is_follow_up,
                "is_repeat": False,
                "consistency": consistency_report,
                "difficulty_level": difficulty_label,
                "pacing": duration_stats
            }
        except Exception as e:
            logger.error(f"Error in conduct_interview orchestration: {e}", exc_info=True)
            return {"error": str(e)}

    def _advance_to_new_question(self, interview_context: Dict, job_context: str) -> tuple:
        """Return ``(question, came_from_planned_bank)`` for the next turn.

        Prefers the planned bank produced at setup (distinct, tailored, and always
        finite), and only synthesizes a new question once that bank is exhausted.
        The second value lets the caller skip goal re-alignment for questions that
        were already written against this job description.
        """
        planned = interview_context.get("planned_questions") or []
        next_index = int(interview_context.get("question_index", 0)) + 1

        # 1. Next question from the planned bank guarantees forward progress.
        if 0 <= next_index < len(planned):
            planned_question = (planned[next_index] or "").strip()
            if planned_question:
                logger.info(f"[Agent] Using planned question {next_index}: {planned_question[:60]}...")
                return planned_question, True

        # 2. Bank exhausted — synthesize a fresh question on a new topic.
        skills = interview_context.get("candidate_skills") or ["General Programming"]
        target_skill = skills[next_index % len(skills)] if skills else "General Software Engineering"

        try:
            questions = self.question_generator.generate_questions(
                job_description=job_context,
                candidate_skills=[target_skill],
                count=2
            )
            generated = questions[0] if questions else ""
            # Prefer a generated question that is not the one just asked.
            for q in questions or []:
                if not question_flow.is_repeat(q, interview_context.get("current_question", "")):
                    generated = q
                    break
            if generated:
                logger.info(f"[Agent] Generated new question: {generated[:60]}...")
                return generated, False
        except Exception as qg_error:
            logger.error(f"[Agent] Question generation failed: {qg_error}")

        # Offline safety net: rotate the fallback bank by index so this can never
        # hand back the same question twice in a row.
        offline_bank = QuestionGeneratorAgent._fallback_questions([target_skill], 8)
        return offline_bank[next_index % len(offline_bank)], False

    def evaluate_response(self, question: str, response: str, job_requirements: Dict) -> Dict:
        # Legacy support for websocket.py or other direct calls
        return self.validator.validate_answer(question, response, str(job_requirements))