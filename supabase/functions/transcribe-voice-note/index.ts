import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let voiceNoteId: string | undefined
  // Client mit User-JWT → RLS sorgt dafür, dass nur eigene voice_notes ladbar sind.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
  )

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    voiceNoteId = (await req.json())?.voiceNoteId
    if (!voiceNoteId) return new Response(JSON.stringify({ error: 'voiceNoteId fehlt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // RLS: nur eigene (oder via can_view freigegebene) Notiz ist sichtbar.
    const { data: note, error: loadErr } = await supabase.from('voice_notes').select('id, audio_url, user_id').eq('id', voiceNoteId).single()
    if (loadErr || !note) throw new Error('Sprachmemo nicht gefunden')
    // Nur die eigene Notiz transkribieren (keine fremden Audios).
    if (note.user_id !== user.id) return new Response(JSON.stringify({ error: 'Keine Berechtigung' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) {
      await supabase.from('voice_notes').update({ transcript_status: 'disabled' }).eq('id', voiceNoteId)
      return new Response(JSON.stringify({ status: 'disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    await supabase.from('voice_notes').update({ transcript_status: 'processing' }).eq('id', voiceNoteId)

    const audio = await fetch(note.audio_url).then(r => r.blob())
    const form = new FormData()
    form.append('file', audio, 'audio.m4a')
    form.append('model', 'whisper-1')
    form.append('language', 'de')
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error?.message ?? `OpenAI ${res.status}`)

    const transcript = (data.text ?? '').trim()
    await supabase.from('voice_notes').update({ transcript, transcript_status: 'completed' }).eq('id', voiceNoteId)
    return new Response(JSON.stringify({ status: 'completed', transcript }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (error: any) {
    console.error('[transcribe-voice-note]', error?.message ?? error)
    if (voiceNoteId) { try { await supabase.from('voice_notes').update({ transcript_status: 'failed' }).eq('id', voiceNoteId) } catch { /* egal */ } }
    return new Response(JSON.stringify({ status: 'failed', error: 'Transkription fehlgeschlagen' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
