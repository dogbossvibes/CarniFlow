import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Löscht das Konto + alle eigenen Daten des EINGELOGGTEN Users (DSGVO / App-Store
// 5.1.1(v)). DB-Daten gehen über `on delete cascade` (auth.users) automatisch mit;
// Storage-Dateien (Pfad-Präfix = User-ID) werden zusätzlich best-effort entfernt.
const USER_BUCKETS = ['training-photos', 'training-videos', 'training-audio', 'dog-avatars', 'dog-documents']

async function purgeFolder(admin: any, bucket: string, prefix: string) {
  const { data } = await admin.storage.from(bucket).list(prefix, { limit: 1000 })
  if (!data?.length) return
  const files: string[] = []
  for (const item of data) {
    const path = `${prefix}/${item.name}`
    if (item.id === null) await purgeFolder(admin, bucket, path)   // Unterordner
    else files.push(path)
  }
  if (files.length) await admin.storage.from(bucket).remove(files)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 1) Aufrufer aus dem JWT bestimmen.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Nicht authentifiziert' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 2) Service-Role für Lösch-Operationen.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // 3) Storage best-effort leeren (eigener User-Ordner je Bucket).
    for (const bucket of USER_BUCKETS) {
      try { await purgeFolder(admin, bucket, user.id) } catch { /* best-effort */ }
    }

    // 4) Eigene DB-Daten best-effort entfernen (falls FKs nicht alle cascaden).
    const del = async (table: string, col: string) => {
      try { await admin.from(table).delete().eq(col, user.id) } catch { /* ignore */ }
    }
    // Hunde + abhängige Daten zuerst (per dog_id), dann die Hunde selbst.
    try {
      const { data: dogs } = await admin.from('dogs').select('id').eq('owner_id', user.id)
      const dogIds = (dogs ?? []).map((d: any) => d.id)
      if (dogIds.length) {
        for (const t of ['training_recommendations', 'training_embeddings', 'ai_insights', 'training_analysis',
                          'shared_trainings', 'calendar_events', 'training_units', 'training_sessions',
                          'dog_goals', 'dog_documents', 'dog_health_entries', 'dog_vet_appointments']) {
          try { await admin.from(t).delete().in('dog_id', dogIds) } catch { /* ignore */ }
        }
        try { await admin.from('dogs').delete().eq('owner_id', user.id) } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
    // Direkt user-/trainer-gebundene Tabellen.
    await del('subscriptions', 'user_id'); await del('user_capabilities', 'user_id')
    await del('founder_slots', 'user_id'); await del('user_entitlements', 'user_id')
    await del('training_plans', 'trainer_id'); await del('trainer_umfragen', 'trainer_id')
    try { await admin.from('connections').delete().or(`owner_user_id.eq.${user.id},connected_user_id.eq.${user.id}`) } catch { /* ignore */ }

    // 5) Auth-User löschen → restliche Daten cascaden über FK auf auth.users(id).
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error

    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (error: any) {
    console.error('[delete-account]', error?.message ?? error)
    return new Response(JSON.stringify({ error: 'Konto konnte nicht gelöscht werden.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
