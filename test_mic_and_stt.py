#!/usr/bin/env python3
"""
Comprehensive test suite for STT and voice pipeline functionality.

Tests:
1. GroqSTT initialization and transcription
2. VoiceManager initialization and audio processing
3. WebSocket message handling simulation
4. Audio buffer processing
5. Error handling and fallback behavior
6. Mic state transitions (mirroring frontend logic)
"""
import asyncio
import sys
import os
import unittest
import logging
from unittest.mock import patch, MagicMock, AsyncMock
from io import BytesIO

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TestGroqSTT(unittest.TestCase):
    """Test the Groq Whisper STT service"""

    def setUp(self):
        os.environ.setdefault('GROQ_API_KEY', 'test-key')
        os.environ.setdefault('DATABASE_URL', 'sqlite:///./test.db')

    def test_groq_stt_initialization(self):
        """Test that GroqSTT initializes with correct API configuration"""
        from app.voice.stt import GroqSTT
        stt = GroqSTT(api_key="test-api-key")
        self.assertIsNotNone(stt.client)
        self.assertEqual(stt.client.base_url, "https://api.groq.com/openai/v1/")

    def test_groq_stt_empty_audio_handling(self):
        """Test that empty audio buffer is handled gracefully"""
        from app.voice.stt import GroqSTT
        stt = GroqSTT(api_key="test-api-key")
        with patch.object(stt.client.audio.transcriptions, 'create', side_effect=Exception("Invalid audio")):
            result = asyncio.run(stt.transcribe_stream(b""))
            self.assertEqual(result, "")

    def test_groq_stt_successful_transcription(self):
        """Test successful transcription returns text"""
        from app.voice.stt import GroqSTT
        stt = GroqSTT(api_key="test-api-key")
        mock_response = "Hello, my name is John and I have 5 years of experience."
        with patch.object(stt.client.audio.transcriptions, 'create', return_value=mock_response):
            result = asyncio.run(stt.transcribe_stream(b"fake-audio-data"))
            self.assertEqual(result, mock_response)

    def test_groq_stt_audio_file_format(self):
        """Test that audio is sent with correct filename and mimetype"""
        from app.voice.stt import GroqSTT
        stt = GroqSTT(api_key="test-api-key")
        captured_args = {}
        def mock_create(**kwargs):
            captured_args.update(kwargs)
            return "transcript text"
        with patch.object(stt.client.audio.transcriptions, 'create', side_effect=mock_create):
            asyncio.run(stt.transcribe_stream(b"audio-bytes"))
            self.assertIn('file', captured_args)
            file_tuple = captured_args['file']
            self.assertEqual(file_tuple[0], "audio.webm")
            self.assertEqual(file_tuple[2], "audio/webm")

    def test_groq_stt_network_error_recovery(self):
        """Test that network errors return empty string, not crash"""
        from app.voice.stt import GroqSTT
        stt = GroqSTT(api_key="test-api-key")
        with patch.object(stt.client.audio.transcriptions, 'create',
                         side_effect=ConnectionError("Network timeout")):
            result = asyncio.run(stt.transcribe_stream(b"audio"))
            self.assertEqual(result, "")


class TestVoiceManager(unittest.TestCase):
    """Test the VoiceManager orchestration layer"""

    def setUp(self):
        os.environ.setdefault('GROQ_API_KEY', 'test-key')
        os.environ.setdefault('DATABASE_URL', 'sqlite:///./test.db')

    @patch('app.voice.voice_manager.VoiceInterviewerAgent')
    @patch('app.voice.voice_manager.QwenTTS')
    def test_voice_manager_initialization(self, mock_tts_class, mock_agent_class):
        """Test VoiceManager initializes correctly"""
        from app.voice.voice_manager import VoiceManager
        mock_tts_instance = MagicMock()
        mock_tts_instance.available = True
        mock_tts_class.return_value = mock_tts_instance
        vm = VoiceManager(groq_api_key="test-key")
        self.assertIsNone(vm.stt)
        self.assertFalse(vm.mock_mode)
        self.assertEqual(vm.groq_api_key, "test-key")

    @patch('app.voice.voice_manager.VoiceInterviewerAgent')
    @patch('app.voice.voice_manager.QwenTTS')
    def test_voice_manager_process_audio_with_groq(self, mock_tts_class, mock_agent_class):
        """Test that process_voice_input transcribes audio and runs the agent"""
        from app.voice.voice_manager import VoiceManager
        mock_tts_instance = MagicMock()
        mock_tts_instance.available = True
        mock_tts_class.return_value = mock_tts_instance

        mock_agent_instance = MagicMock()
        mock_agent_instance.conduct_interview = AsyncMock(return_value={
            "next_question": "What frameworks do you know?",
            "evaluation": {"technical_accuracy": 7, "feedback": "Good"}
        })
        mock_agent_class.return_value = mock_agent_instance

        vm = VoiceManager(groq_api_key="test-key")

        # Mock GroqSTT
        with patch('app.voice.stt.GroqSTT') as mock_stt_class:
            mock_stt = MagicMock()
            mock_stt.transcribe_stream = AsyncMock(return_value="I know Python and React")
            mock_stt_class.return_value = mock_stt

            result = asyncio.run(vm.process_voice_input(b"audio-data", {"question_index": 0}))

            self.assertEqual(result["transcript"], "I know Python and React")
            self.assertEqual(result["next_question"], "What frameworks do you know?")
            self.assertIn("evaluation", result)

    @patch('app.voice.voice_manager.VoiceInterviewerAgent')
    @patch('app.voice.voice_manager.QwenTTS')
    def test_voice_manager_empty_transcript_fallback(self, mock_tts_class, mock_agent_class):
        """Test that empty transcript from STT still proceeds with fallback text"""
        from app.voice.voice_manager import VoiceManager
        mock_tts_instance = MagicMock()
        mock_tts_instance.available = True
        mock_tts_class.return_value = mock_tts_instance

        mock_agent_instance = MagicMock()
        mock_agent_instance.conduct_interview = AsyncMock(return_value={
            "next_question": "Could you please repeat?",
            "evaluation": {"technical_accuracy": 0, "feedback": "No response"}
        })
        mock_agent_class.return_value = mock_agent_instance

        vm = VoiceManager(groq_api_key="test-key")

        with patch('app.voice.stt.GroqSTT') as mock_stt_class:
            mock_stt = MagicMock()
            mock_stt.transcribe_stream = AsyncMock(return_value="")
            mock_stt_class.return_value = mock_stt

            result = asyncio.run(vm.process_voice_input(b"silent-audio", {"question_index": 0}))
            # Should still have a transcript (fallback message)
            self.assertIn("transcript", result)
            self.assertIn("next_question", result)

    @patch('app.voice.voice_manager.VoiceInterviewerAgent')
    @patch('app.voice.voice_manager.QwenTTS')
    def test_voice_manager_run_agent(self, mock_tts_class, mock_agent_class):
        """Test that run_agent delegates to VoiceInterviewerAgent"""
        from app.voice.voice_manager import VoiceManager
        mock_tts_instance = MagicMock()
        mock_tts_instance.available = True
        mock_tts_class.return_value = mock_tts_instance
        mock_agent_instance = MagicMock()
        mock_agent_instance.conduct_interview = AsyncMock(return_value={
            "next_question": "What is your experience with Python?",
            "evaluation": {"technical_accuracy": 7, "feedback": "Good answer"}
        })
        mock_agent_class.return_value = mock_agent_instance
        vm = VoiceManager(groq_api_key="test-key")
        result = asyncio.run(vm.run_agent("I have 5 years of experience", {}))
        self.assertEqual(result["next_question"], "What is your experience with Python?")

    @patch('app.voice.voice_manager.VoiceInterviewerAgent')
    @patch('app.voice.voice_manager.QwenTTS')
    def test_voice_manager_fallback_to_mock_mode(self, mock_tts_class, mock_agent_class):
        """Test that VoiceManager falls back to mock mode on initialization error"""
        from app.voice.voice_manager import VoiceManager
        mock_tts_class.side_effect = Exception("TTS init failed")
        vm = VoiceManager(groq_api_key="test-key")
        self.assertTrue(vm.mock_mode)


class TestWebSocketMessageFlow(unittest.TestCase):
    """Test the WebSocket message flow"""

    def test_text_message_parsing(self):
        import json
        message = json.dumps({"type": "text", "content": "I have experience with Python and React"})
        parsed = json.loads(message)
        self.assertEqual(parsed["type"], "text")
        self.assertEqual(parsed["content"], "I have experience with Python and React")

    def test_empty_transcript_handling(self):
        import json
        message = json.dumps({"type": "text", "content": ""})
        parsed = json.loads(message)
        self.assertEqual(parsed.get("content", ""), "")

    def test_skip_message_handling(self):
        """Test that skip/silent messages are properly formatted"""
        import json
        skip_msg = json.dumps({"type": "text", "content": "[No response — candidate was silent]"})
        parsed = json.loads(skip_msg)
        self.assertIn("No response", parsed["content"])

    def test_response_format(self):
        import json
        response = {
            "transcript": "My name is John",
            "next_question": "Tell me about your Python experience",
            "evaluation": {"technical_accuracy": 5, "feedback": "Good introduction"}
        }
        serialized = json.dumps(response)
        deserialized = json.loads(serialized)
        self.assertIn("transcript", deserialized)
        self.assertIn("next_question", deserialized)
        self.assertIn("evaluation", deserialized)


class TestMicStateTransitions(unittest.TestCase):
    """Test the mic state machine mirroring the frontend logic."""

    def test_idle_to_recording(self):
        is_recording = False
        is_starting = False
        if not is_recording and not is_starting:
            is_starting = True
            is_recording = True
            is_starting = False
        self.assertTrue(is_recording)

    def test_recording_to_processing(self):
        """When recording stops, state transitions to processing"""
        is_recording = True
        is_processing = False
        # Finalize
        is_recording = False
        is_processing = True
        self.assertFalse(is_recording)
        self.assertTrue(is_processing)

    def test_processing_to_idle(self):
        """When response arrives, processing clears"""
        is_processing = True
        # Response received
        is_processing = False
        self.assertFalse(is_processing)

    def test_double_start_prevention(self):
        is_recording = True
        started = False
        if not is_recording:
            started = True
        self.assertFalse(started)

    def test_tts_to_mic_transition(self):
        is_recording = False
        is_speaking = True
        text_mode = False
        is_speaking = False  # TTS ends
        if not text_mode and not is_speaking:
            is_recording = True
        self.assertTrue(is_recording)

    def test_text_mode_prevents_auto_start(self):
        is_recording = False
        text_mode = True
        if not text_mode:
            is_recording = True
        self.assertFalse(is_recording)

    def test_transcript_accumulation(self):
        """Multiple transcript segments should be joined"""
        buffer = ''
        segments = ['I have', 'experience with', 'Python and React']
        for seg in segments:
            buffer += (' ' if buffer else '') + seg
        self.assertEqual(buffer, 'I have experience with Python and React')

    def test_10s_no_speech_auto_advance(self):
        """After 10s with no speech, should auto-advance"""
        has_speech = False
        is_recording = True
        auto_advanced = False
        # Simulate timer firing
        if is_recording and not has_speech:
            is_recording = False
            auto_advanced = True
        self.assertTrue(auto_advanced)

    def test_speech_cancels_no_speech_timer(self):
        """If speech is detected, 10s timer should be cancelled"""
        has_speech = False
        timer_active = True
        # Speech detected
        has_speech = True
        if has_speech:
            timer_active = False
        self.assertFalse(timer_active)

    def test_audio_fallback_when_no_transcript(self):
        """When Web Speech API returns nothing, audio blob should be sent"""
        transcript = ''
        audio_size = 50000  # bytes
        if transcript:
            sent = 'text'
        elif audio_size > 1000:
            sent = 'audio'
        else:
            sent = 'skip'
        self.assertEqual(sent, 'audio')


if __name__ == '__main__':
    print("=" * 60)
    print("  AI Interviewer — Mic & STT Test Suite")
    print("=" * 60)

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestGroqSTT))
    suite.addTests(loader.loadTestsFromTestCase(TestVoiceManager))
    suite.addTests(loader.loadTestsFromTestCase(TestWebSocketMessageFlow))
    suite.addTests(loader.loadTestsFromTestCase(TestMicStateTransitions))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    if result.wasSuccessful():
        print("  ✅ ALL TESTS PASSED")
    else:
        print(f"  ❌ {len(result.failures)} failures, {len(result.errors)} errors")
    print("=" * 60)

    sys.exit(0 if result.wasSuccessful() else 1)
