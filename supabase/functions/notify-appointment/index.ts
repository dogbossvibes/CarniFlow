// ANYVO — Push-Benachrichtigung bei neuer Termin-Anfrage an die Trainer:in.
//
// Deploy:
//   supabase functions deploy notify-appointment
// (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY sind in Edge Functions automatisch
//  gesetzt. Push-Token liegt in profiles.push_token — wie bei notify-comment.)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const { eventId } = await req.json();
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: ev } = await supabase
      .from('calendar_events')
      .select('id, title, start_at, trainer_id, dog:dogs(name)')
      .eq('id', eventId)
      .single();

    if (!ev?.trainer_id) return json({ ok: false, reason: 'no trainer' }, cors);

    const { data: prof } = await supabase
      .from('profiles').select('push_token').eq('id', ev.trainer_id).single();

    const token = prof?.push_token;
    if (!token) return json({ ok: false, reason: 'no push token' }, cors);

    const d = new Date(ev.start_at);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const dog = ev.dog?.name ? ` · ${ev.dog.name}` : '';

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: token,
        sound: 'default',
        title: 'Neue Termin-Anfrage',
        body: `${ev.title}${dog} · ${d.toLocaleDateString('de-CH')} ${time}`,
        data: { type: 'appointment', eventId: ev.id },
      }),
    });

    return json({ ok: true }, cors);
  } catch (e) {
    return json({ ok: false, error: String(e) }, cors);
  }
});

function json(body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });
}
