import { readFileSync } from 'fs';
import { generateAIAnalysis, type AiSessionInput } from '@/services/aiAnalysis';
import { createEmbeddingForTrainingSession } from '@/features/ai/services/trainingEmbeddingService';

const src = (p: string) => readFileSync(p, 'utf8');

const CLIENT_AI_FILES = [
  'services/aiAnalysis.ts',
  'components/calendar/TrainingRecommendationCard.tsx',
  'features/ai/services/insightService.ts',
  'features/ai/services/semanticSearchService.ts',
  'features/ai/services/trainingEmbeddingService.ts',
  'features/ai/services/embeddingProvider.ts',
  'features/voice/services/voiceUploadService.ts',
  'features/voice/services/transcriptionProvider.ts',
];

describe('KI-Entfernung — keine externen Laufzeitpfade', () => {
  it('kein api.openai.com / api.anthropic.com im Client-Code', () => {
    for (const f of CLIENT_AI_FILES) {
      expect(src(f)).not.toMatch(/api\.openai\.com/);
      expect(src(f)).not.toMatch(/api\.anthropic\.com/);
    }
  });
  it('keine KI-Edge-Function-Aufrufe mehr im Client', () => {
    const bad = /functions\.invoke\(\s*'(ai-analysis|analyze-training|recommend|generate-coach-summary|search-training-memory|generate-training-embedding|transcribe-voice-note)'/;
    for (const f of CLIENT_AI_FILES) expect(src(f)).not.toMatch(bad);
  });
});

const sess = (over: Partial<AiSessionInput> = {}): AiSessionInput => ({
  session_date: '2026-01-01', category: 'Unterordnung', title: null, duration_minutes: 30,
  rating: 4, notes: null, motivation: 5, konzentration: 4, praezision: 3, ausdauer: 4,
  trieblage: 3, impulskontrolle: 2, belastung: null, ...over,
});

describe('generateAIAnalysis — regelbasiert, deterministisch', () => {
  it('leere Liste → Fehler', async () => {
    await expect(generateAIAnalysis([], 'Rex')).rejects.toThrow();
  });
  it('liefert Score 0..100 + Auswertungstexte ohne externen Aufruf', async () => {
    const r = await generateAIAnalysis([sess(), sess({ rating: 5 })], 'Rex');
    expect(r.gesamtscore).toBeGreaterThan(0);
    expect(r.gesamtscore).toBeLessThanOrEqual(100);
    expect(Array.isArray(r.positives)).toBe(true);
    expect(Array.isArray(r.schwaechen)).toBe(true);
    expect(r.empfehlungen.length).toBeGreaterThan(0);
    expect(r.zusammenfassung).toContain('Rex');
    expect(r.coach_message).toMatch(/regelbasiert/i);
  });
  it('robust bei fehlenden Werten — keine NaN/Infinity', async () => {
    const r = await generateAIAnalysis([sess({
      rating: null, motivation: null, konzentration: null, praezision: null,
      ausdauer: null, trieblage: null, impulskontrolle: null,
    })], 'Bella');
    expect(Number.isFinite(r.gesamtscore)).toBe(true);
    expect(r.gesamtscore).toBe(0);
  });
});

describe('Embeddings deaktiviert (No-op)', () => {
  it('createEmbeddingForTrainingSession erzeugt nichts (kein API-Aufruf)', async () => {
    const r = await createEmbeddingForTrainingSession({ content: 'ein etwas laengerer Notiztext' });
    expect(r).toEqual({ ok: false, skipped: true });
  });
});
