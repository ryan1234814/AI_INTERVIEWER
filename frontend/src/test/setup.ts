import '@testing-library/jest-dom';

// Mock SpeechRecognition API
class MockSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = '';
  onresult: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onend: (() => void) | null = null;
  onstart: (() => void) | null = null;
  private _isRunning = false;

  start() {
    if (this._isRunning) {
      throw new DOMException('Already started', 'InvalidStateError');
    }
    this._isRunning = true;
    if (this.onstart) this.onstart();
  }

  stop() {
    this._isRunning = false;
    // Simulate async onend callback
    setTimeout(() => {
      if (this.onend) this.onend();
    }, 10);
  }

  abort() {
    this._isRunning = false;
    if (this.onend) this.onend();
  }

  get isRunning() {
    return this._isRunning;
  }

  // Test helper to simulate a result event
  simulateResult(transcript: string, isFinal: boolean = true) {
    if (this.onresult) {
      this.onresult({
        resultIndex: 0,
        results: [
          {
            isFinal,
            0: { transcript, confidence: 0.95 },
            length: 1,
          },
        ],
      });
    }
  }

  // Test helper to simulate an error
  simulateError(errorType: string) {
    if (this.onerror) {
      this.onerror({ error: errorType });
    }
  }
}

// Mock SpeechSynthesis API
class MockSpeechSynthesisUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: any = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: any) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

const mockSpeechSynthesis = {
  _utterances: [] as MockSpeechSynthesisUtterance[],
  _speaking: false,

  speak(utterance: MockSpeechSynthesisUtterance) {
    this._utterances.push(utterance);
    this._speaking = true;
    if (utterance.onstart) utterance.onstart();
    // Auto-end after a short delay (simulate speaking)
    setTimeout(() => {
      this._speaking = false;
      if (utterance.onend) utterance.onend();
    }, 50);
  },

  cancel() {
    this._speaking = false;
    this._utterances = [];
  },

  getVoices() {
    return [
      { lang: 'en-US', name: 'Google US English', localService: true } as SpeechSynthesisVoice,
    ];
  },

  get speaking() {
    return this._speaking;
  },
};

// Install mocks on window
Object.defineProperty(window, 'SpeechRecognition', {
  writable: true,
  value: MockSpeechRecognition,
});

Object.defineProperty(window, 'webkitSpeechRecognition', {
  writable: true,
  value: MockSpeechRecognition,
});

Object.defineProperty(window, 'SpeechSynthesisUtterance', {
  writable: true,
  value: MockSpeechSynthesisUtterance,
});

Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: mockSpeechSynthesis,
});

// Export for direct use in tests
export { MockSpeechRecognition, MockSpeechSynthesisUtterance, mockSpeechSynthesis };
