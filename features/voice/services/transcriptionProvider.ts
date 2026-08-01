// Transkriptions-Provider-Abstraktion. Die eigentliche Transkription läuft
// serverseitig in der Edge Function (transcribe-voice-note) — hier die Typen +
// vorbereitete Implementierungen (für Tests/zukünftigen Wechsel).

export interface TranscriptionResult { transcript: string; confidence?: number }

export interface TranscriptionProvider {
  readonly id: string;
  transcribeAudio(params: { audioUrl: string; language?: string }): Promise<TranscriptionResult>;
}

// OpenAI Whisper / gpt-4o-transcribe (serverseitig, OPENAI_API_KEY nötig).
export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly id = 'openai';
  constructor(private apiKey: string, private model = 'whisper-1') {}
  // KI-ENTFERNUNG: deaktiviert — keine externe Transkription mehr (kein Runtime-Pfad).
  async transcribeAudio(_params: { audioUrl: string; language?: string }): Promise<TranscriptionResult> {
    throw new Error('Externe Transkription ist deaktiviert (KI entfernt).');
  }
}

// Fallback ohne API-Key — liefert leeres Transkript, kein Crash.
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'mock';
  async transcribeAudio(): Promise<TranscriptionResult> {
    return { transcript: '' };
  }
}
