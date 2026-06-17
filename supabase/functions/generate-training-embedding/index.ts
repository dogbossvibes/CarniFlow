import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getEmbeddingProvider, normalizeText, MIN_CONTENT_LENGTH } from '../_shared/embedding.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SOURCE_TYPES = [
  'training_notes', 'exercise_notes', 'coach_feedback',
  'voice_transcript', 'media_description', 'track_summary',
]

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
    const { trainingSessionId, sourceType, sourceId, content, contentSummary, metadata } = body ?? {}

    if (!sourceType || !SOURCE_TYPES.includes(sourceType)) {
      return new Response(JSON.stringify({ error: `Ungültiger sourceType: ${sourceType}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const text = normalizeText(content ?? '')
    // Leere/zu kurze Texte nicht einbetten — kein Fehler, nur überspringen.
    if (text.length < MIN_CONTENT_LENGTH) {
      return new Response(JSON.stringify({ skipped: true, reason: 'Text zu kurz' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const provider = getEmbeddingProvider()
    const embedding = await provider.generateEmbedding(text)

    const row = {
      user_id: user.id,
      training_session_id: trainingSessionId ?? null,
      source_type: sourceType,
      source_id: sourceId ?? null,
      content: text,
      content_summary: contentSummary ?? null,
      embedding,
      metadata: metadata ?? {},
    }

    // Re-Embedding derselben Quelle = ersetzen (verhindert Duplikate). Nur möglich,
    // wenn source_id bekannt ist; sonst einfach neu anlegen.
    if (sourceId) {
      await supabase.from('training_embeddings')
        .delete()
        .eq('user_id', user.id).eq('source_type', sourceType).eq('source_id', sourceId)
    }

    const { data, error } = await supabase
      .from('training_embeddings').insert(row).select('id').single()
    if (error) throw error

    return new Response(JSON.stringify({ id: data.id, dimensions: provider.dimensions }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('[generate-training-embedding]', error?.message ?? error)
    return new Response(JSON.stringify({ error: error?.message ?? 'Unbekannter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
