// @ts-nocheck — Deno Edge Function (läuft auf Supabase, nicht im App-Bundle)
// ANYVO — KI-Trainingsempfehlungen (Supabase Edge Function)
//
// Deploy:
//   supabase functions deploy recommend
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// Der Anthropic-Key bleibt SERVERSEITIG (niemals in der App). Die App ruft
// die Funktion via supabase.functions.invoke('recommend') auf; fehlt der Key
// oder die Funktion, nutzt die App ihre regelbasierten Empfehlungen.

const SYSTEM = `Du bist der Trainingscoach der Hundesport-App ANYVO.
Gib auf Basis der Trainings- und Termindaten 1–3 sehr kurze, motivierende
Empfehlungen auf Deutsch (max. ~90 Zeichen je Empfehlung). Antworte AUSSCHLIESSLICH
als JSON-Array von Strings, ohne weiteren Text. Beispiel:
["Du hast seit 6 Tagen keine Fährte trainiert.","Plane dein nächstes Schutzdienst-Training."]`;

Deno.serve(async (req: Request) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ recommendations: [] }, cors);

    const { feedSummary = '', eventSummary = '' } = await req.json().catch(() => ({}));

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: `Trainingsverlauf (Datum:Sparten): ${feedSummary}\nTermine (Start:Typ:Status): ${eventSummary}`,
        }],
      }),
    });

    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '[]';
    let recommendations: string[] = [];
    try { recommendations = JSON.parse(text); } catch { recommendations = []; }
    return json({ recommendations: recommendations.slice(0, 3) }, cors);
  } catch (e) {
    return json({ recommendations: [], error: String(e) }, cors);
  }
});

function json(body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { headers: { ...cors, 'content-type': 'application/json' } });
}
