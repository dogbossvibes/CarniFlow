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
  async transcribeAudio({ audioUrl, language = 'de' }: { audioUrl: string; language?: string }): Promise<TranscriptionResult> {
    const audio = await fetch(audioUrl).then(r => r.blob());
    const form = new FormData();
    form.append('file', audio, 'audio.m4a');
    form.append('model', this.model);
    form.append('language', language);
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}` }, body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI ${res.status}`);
    return { transcript: data.text ?? '' };
  }
}

// Fallback ohne API-Key — liefert leeres Transkript, kein Crash.
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly id = 'mock';
  async transcribeAudio(): Promise<TranscriptionResult> {
    return { transcript: '' };
  }
}
