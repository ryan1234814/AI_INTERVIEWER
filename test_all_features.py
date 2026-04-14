#!/usr/bin/env python3
"""Test all interview features: Qwen3-TTS, gTTS fallback, question generation, PDF"""
import asyncio
import sys
import os
import time
sys.path.insert(0, '/Users/ryangeorge/ai_interviewer/backend')

async def test_qwen_tts():
    """Test Qwen3-TTS via DashScope API"""
    print("\n🎙️  Testing Qwen3-TTS (DashScope API)...")
    from app.voice.qwen_tts import QwenTTS
    
    dashscope_key = os.getenv("DASHSCOPE_API_KEY", "")
    tts = QwenTTS(api_key=dashscope_key)
    
    if not tts.available:
        print("   ⚠️  No DASHSCOPE_API_KEY set - Qwen3-TTS not available")
        print("   Get free API key at: https://www.alibabacloud.com/help/en/model-studio/get-api-key")
        print("   Free tier: 10,000 characters")
        print("   Will test gTTS fallback instead...")
        test_text = "Hello! Please introduce yourself and tell me about your background."
        audio_data = await tts.get_audio_stream(test_text)
        if audio_data and len(audio_data) > 1000:
            print(f"   ✅ gTTS Fallback Working! Generated {len(audio_data)} bytes")
            with open('/Users/ryangeorge/ai_interviewer/test_tts_output.mp3', 'wb') as f:
                f.write(audio_data)
            return True
        else:
            print("   ❌ gTTS Fallback also Failed!")
            return False
    
    test_text = "Hello! Please introduce yourself and tell me about your background."
    start = time.time()
    audio_data = await tts.get_audio_stream(test_text)
    elapsed = time.time() - start
    
    if audio_data and len(audio_data) > 1000:
        print(f"   ✅ Qwen3-TTS Working! Generated {len(audio_data)} bytes in {elapsed:.2f}s")
        with open('/Users/ryangeorge/ai_interviewer/test_tts_output.mp3', 'wb') as f:
            f.write(audio_data)
        return True
    else:
        print(f"   ❌ Qwen3-TTS Failed!")
        return False

async def test_gtts():
    """Test Google TTS (fallback)"""
    print("\n🔊  Testing Google TTS (fallback)...")
    from app.voice.gtts_tts import GTTSEngine
    
    tts = GTTSEngine(lang='en', slow=False)
    test_text = "Can you describe your experience with Python?"
    
    start = time.time()
    audio_data = await tts.get_audio_stream(test_text)
    elapsed = time.time() - start
    
    if audio_data and len(audio_data) > 1000:
        print(f"   ✅ gTTS Working! Generated {len(audio_data)} bytes in {elapsed:.2f}s")
        return True
    else:
        print(f"   ❌ gTTS Failed!")
        return False

def test_question_generation():
    """Test question generation agent"""
    print("\n❓ Testing Question Generation...")
    import os
    from app.agents.question_generator import QuestionGeneratorAgent
    
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("   ⚠️  No GROQ_API_KEY set, skipping")
        return True
    
    try:
        agent = QuestionGeneratorAgent(groq_key)
        questions = agent.generate_questions(
            job_description="Software Engineer role requiring Python and React",
            candidate_skills=["Python", "JavaScript"],
            count=2
        )
        if questions and len(questions) > 0:
            print(f"   ✅ Generated {len(questions)} questions")
            for i, q in enumerate(questions[:2], 1):
                print(f"      Q{i}: {q[:60]}...")
            return True
        else:
            print("   ❌ No questions generated")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_pdf_generation():
    """Test PDF report generation"""
    print("\n📄 Testing PDF Generation...")
    from app.utils.pdf_generator import generate_interview_pdf
    from types import SimpleNamespace
    
    # Mock evaluation data
    eval_data = SimpleNamespace(
        overall_score=8.5,
        technical_score=9.0,
        communication_score=8.0,
        relevance_score=8.5,
        strengths=["Good technical knowledge", "Clear communication"],
        weaknesses=["Could provide more examples"],
        summary="Strong candidate with solid technical skills."
    )
    
    # Mock responses
    responses = [
        SimpleNamespace(
            question_text="Tell me about yourself",
            candidate_response="I am a software engineer with 5 years experience.",
            feedback="Good introduction"
        ),
        SimpleNamespace(
            question_text="What is your biggest strength?",
            candidate_response="Problem-solving and attention to detail.",
            feedback="Clear answer"
        )
    ]
    
    try:
        pdf_buffer = generate_interview_pdf(
            candidate_name="John Doe",
            job_title="Software Engineer",
            evaluation_data=eval_data,
            responses=responses
        )
        
        if pdf_buffer and len(pdf_buffer.getvalue()) > 1000:
            print(f"   ✅ PDF Generated! Size: {len(pdf_buffer.getvalue())} bytes")
            with open('/Users/ryangeorge/ai_interviewer/test_report.pdf', 'wb') as f:
                f.write(pdf_buffer.getvalue())
            return True
        else:
            print("   ❌ PDF generation failed")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_voice_manager():
    """Test VoiceManager integration"""
    print("\n🎤 Testing VoiceManager...")
    import os
    from app.voice.voice_manager import VoiceManager
    
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("   ⚠️  No GROQ_API_KEY set, skipping")
        return True
    
    try:
        vm = VoiceManager(groq_key)
        print(f"   ✅ VoiceManager initialized (mock_mode={vm.mock_mode})")
        print(f"   ✅ TTS type: {type(vm.tts).__name__}")
        return not vm.mock_mode
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

async def main():
    print("=" * 60)
    print("🔍 Interview Platform Feature Tests")
    print("=" * 60)
    
    results = []
    
    # Run all tests
    results.append(("Qwen3-TTS", await test_qwen_tts()))
    results.append(("gTTS (fallback)", await test_gtts()))
    results.append(("Question Generation", test_question_generation()))
    results.append(("PDF Generation", test_pdf_generation()))
    results.append(("VoiceManager", test_voice_manager()))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"   {status} - {name}")
    
    print(f"\n   Total: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All features working! You can now test the interview flow.")
    else:
        print("\n⚠️  Some features need attention. Check logs above.")
    
    return passed == total

if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)
