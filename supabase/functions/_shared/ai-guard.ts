// Serverseitiger KI-Riegel (Sicherheits-Härtung 2026-11-14).
//
// Produktentscheidung «keine externe KI» (docs/agent/DECISIONS.md): Die App ruft
// keine KI-Edge-Functions mehr auf. Sind die Funktionen noch deployt, dürfen sie
// trotzdem weder Daten an Anthropic/OpenAI senden noch fremde API-Kosten
// verursachen. Deshalb antworten sie standardmässig mit 410 Gone, bevor sie
// Anfragedaten lesen.
//
// Nur eine bewusste Server-Konfiguration ANYVO_SERVER_AI_ENABLED=true (Supabase
// Secret) schaltet sie wieder frei – dann gelten zusätzlich Datenschutzerklärung,
// KI-Kennzeichnung (EU AI Act Art. 50) und Auth-Prüfung der jeweiligen Funktion.

export const SERVER_AI_FLAG = 'ANYVO_SERVER_AI_ENABLED'

export function isServerAiEnabled(flagValue: string | undefined | null): boolean {
  return (flagValue ?? '').trim().toLowerCase() === 'true'
}

export function serverAiDisabledResponse(
  flagValue: string | undefined | null,
  headers: Record<string, string>,
): Response | null {
  if (isServerAiEnabled(flagValue)) return null
  return new Response(JSON.stringify({ error: 'KI-Funktionen sind deaktiviert.', code: 'AI_DISABLED' }), {
    status: 410,
    headers: { ...headers, 'Content-Type': 'application/json' },
  })
}
