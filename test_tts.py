#!/usr/bin/env python3
"""Test TTS functionality"""
import asyncio
import sys
sys.path.insert(0, '/Users/ryangeorge/ai_interviewer/backend')

from app.voice.gtts_tts import GTTSEngine

async def test_tts():
    print("Testing Google TTS...")
    tts = GTTSEngine(lang='en', slow=False)
    
    test_text = "Hello! Please introduce yourself and tell me about your background."
    print(f"Generating audio for: '{test_text}'")
    
    audio_data = await tts.get_audio_stream(test_text)
    
    if audio_data and len(audio_data) > 0:
        print(f"✅ SUCCESS! Generated {len(audio_data)} bytes of audio")
        # Save to file for manual testing
        with open('/Users/ryangeorge/ai_interviewer/test_output.mp3', 'wb') as f:
            f.write(audio_data)
        print(f"✅ Saved to test_output.mp3 - you can play this to verify")
        return True
    else:
        print("❌ FAILED! No audio generated")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_tts())
    sys.exit(0 if result else 1)
