import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmbeddingProvider, normalizeText, MIN_CONTENT_LENGTH } from '../_shared/embedding.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const body = await req.json()
    const {
      query, dogId, category,
      matchThreshold = 0.5, matchCount = 10,
      // Coach-Vorbereitung: gezielt in Daten einer verbundenen Kund:in suchen.
      // RLS (can_view) stellt sicher, dass nur Freigegebenes geliefert wird.
      targetUserId,
    } = body ?? {}

    const text = normalizeText(query ?? '')
    if (text.length < MIN_CONTENT_LENGTH) {
      return new Response(JSON.stringify({ results: [], reason: 'Query zu kurz' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const provider = getEmbeddingProvider()
    const queryEmbedding = await provider.generateEmbedding(text)

    const { data, error } = await supabase.rpc('match_training_embeddings', {
      query_embedding: queryEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      filter_user_id: targetUserId ?? user.id,
      filter_dog_id: dogId ?? null,
      filter_category: category ?? null,
    })
    if (error) throw error

    const results = (data ?? []).map((r: any) => ({
      id: r.id,
      trainingSessionId: r.training_session_id,
      sourceType: r.source_type,
      content: r.content,
      summary: r.content_summary,
      similarity: r.similarity,
      metadata: r.metadata,
    }))

    return new Response(JSON.stringify({ results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('[search-training-memory]', error?.message ?? error)
    return new Response(JSON.stringify({ error: error?.message ?? 'Unbekannter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
