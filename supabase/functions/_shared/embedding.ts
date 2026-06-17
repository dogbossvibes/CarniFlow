// Geteilte Embedding-Logik für die Edge Functions (Deno).
// Provider-Abstraktion: Default = Supabase Edge "gte-small" (384 Dim, kein API-Key).
// Alternative = OpenAI text-embedding-3-small (1536 Dim) via OPENAI_API_KEY +
// EMBEDDING_PROVIDER=openai. WICHTIG: Die DB-Vektordimension (AI_EMBEDDINGS_SETUP.sql)
// muss zum gewählten Provider passen (384 bzw. 1536).

export const MIN_CONTENT_LENGTH = 10;
const MAX_CONTENT_LENGTH = 8000;   // sehr lange Texte kürzen (einfaches Truncation-Chunking)

// deno-lint-ignore no-explicit-any
declare const Supabase: any;

export interface EmbeddingProvider {
  readonly dimensions: number;
  generateEmbedding(input: string): Promise<number[]>;
}

// Whitespace normalisieren + auf sinnvolle Länge kürzen.
export function normalizeText(input: string): string {
  return (input ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTENT_LENGTH);
}

// ── Supabase gte-small (Standard, läuft in der Edge-Runtime) ──
class SupabaseAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384;
  // deno-lint-ignore no-explicit-any
  private session: any;
  constructor() { this.session = new Supabase.ai.Session('gte-small'); }
  async generateEmbedding(input: string): Promise<number[]> {
    const out = await this.session.run(input, { mean_pool: true, normalize: true });
    return out as number[];
  }
}

// ── OpenAI text-embedding-3-small (optional) ──
class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  constructor(private apiKey: string, private model = 'text-embedding-3-small') {}
  async generateEmbedding(input: string): Promise<number[]> {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, input }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI ${res.status}`);
    return data.data[0].embedding as number[];
  }
}

// Provider anhand der Env wählen.
export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = (Deno.env.get('EMBEDDING_PROVIDER') ?? 'supabase').toLowerCase();
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (provider === 'openai' && openaiKey) return new OpenAIEmbeddingProvider(openaiKey);
  return new SupabaseAIEmbeddingProvider();
}
