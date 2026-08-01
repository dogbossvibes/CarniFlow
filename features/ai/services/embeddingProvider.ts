// Embedding-Provider-Abstraktion (Client-Seite).
//
// WICHTIG: Embeddings werden in PRODUKTION serverseitig in der Edge Function
// erzeugt (supabase/functions/_shared/embedding.ts) — so bleibt ein evtl.
// OpenAI-Key geheim. Dieses Modul definiert das gemeinsame Interface und hält
// austauschbare Implementierungen bereit (z. B. für Tests/Tools). Der App-Flow
// nutzt stattdessen die Edge Functions via semanticSearchService /
// trainingEmbeddingService.

export interface EmbeddingProvider {
  readonly dimensions: number;
  generateEmbedding(input: string): Promise<number[]>;
}

// OpenAI text-embedding-3-small (1536 Dim). Nur dort einsetzen, wo der Key sicher
// liegt (Server/Tooling) — NICHT mit einem im Client gebündelten Key.
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1536;
  constructor(private apiKey: string, private model = 'text-embedding-3-small') {}
  // KI-ENTFERNUNG: deaktiviert — kein externer OpenAI-Aufruf mehr (kein Runtime-Pfad).
  async generateEmbedding(_input: string): Promise<number[]> {
    throw new Error('Embeddings sind deaktiviert (KI entfernt).');
  }
}

// Supabase Edge "gte-small" (384 Dim) — Standard. Die Ausführung passiert in der
// Edge-Runtime; im Client steht hier kein direkter Zugriff, daher delegiert dieser
// Provider bewusst nicht und dient als dokumentierter Platzhalter/Default-Marker.
export class SupabaseAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 384;
  async generateEmbedding(_input: string): Promise<number[]> {
    throw new Error(
      'SupabaseAIEmbeddingProvider läuft nur in der Edge Function. ' +
      'Im App-Flow trainingEmbeddingService/semanticSearchService nutzen.',
    );
  }
}

// Aktiver Default der App (Dimension muss zur DB-Spalte passen, siehe AI_EMBEDDINGS_SETUP.sql).
export const ACTIVE_EMBEDDING_DIM = 384;
