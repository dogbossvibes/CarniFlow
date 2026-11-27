// @ts-nocheck — Deno Edge Function (läuft auf Supabase, nicht im App-Bundle)
// ANYVO — Fährtenwetter: Proxy zu MET Norway Locationforecast (gratis, auch kommerziell, CC BY 4.0).
//
// Deploy (nur mit Freigabe der Nutzerin):
//   supabase functions deploy track-weather
//
// Warum ein Proxy: MET verlangt einen eindeutigen User-Agent und möchte nicht
// direkt von mobilen Apps abgefragt werden. Der Proxy rundet den Standort auf
// ~1 km, verbirgt die IP der Nutzer:innen vor MET und hält die Antwort je Zelle
// im Speicher, solange MET sie als gültig meldet (Expires). Es wird nichts
// gespeichert oder protokolliert, was eine Person erkennen lässt.
// verify_jwt bleibt an (Standard): nur angemeldete Konten.
import {
  MET_FORECAST_URL, MET_USER_AGENT, cacheSecondsFromExpires, cellKey, mapMetForecast, parseTrackWeatherRequest,
} from '../_shared/met-forecast.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json', ...extra } })

// cellKey → { body (MET-Rohdaten), expiresAt, lastModified }
const cache = new Map<string, { body: unknown; expiresAt: number; lastModified: string | null }>()
const MAX_CELLS = 500

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method' }, 405)

  const input = parseTrackWeatherRequest(await req.json().catch(() => null))
  if (!input) return json({ error: 'input' }, 400)

  const key = cellKey(input.lat, input.lng)
  const now = Date.now()
  let entry = cache.get(key)

  if (!entry || entry.expiresAt <= now) {
    try {
      const headers: Record<string, string> = { 'User-Agent': MET_USER_AGENT, 'Accept-Encoding': 'gzip' }
      if (entry?.lastModified) headers['If-Modified-Since'] = entry.lastModified
      const url = `${MET_FORECAST_URL}?lat=${input.lat.toFixed(2)}&lon=${input.lng.toFixed(2)}`
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) })
      const ttl = cacheSecondsFromExpires(res.headers.get('expires'), now) * 1000
      if (res.status === 304 && entry) {
        entry = { ...entry, expiresAt: now + ttl }
      } else if (res.ok) {
        entry = { body: await res.json(), expiresAt: now + ttl, lastModified: res.headers.get('last-modified') }
      } else if (!entry) {
        return json({ error: 'upstream', status: res.status }, 502)
      }
      if (cache.size >= MAX_CELLS && !cache.has(key)) cache.delete(cache.keys().next().value)
      cache.set(key, entry)
    } catch {
      if (!entry) return json({ error: 'upstream' }, 502)
      // Alter Stand bleibt besser als nichts; die App zeigt das Alter an.
    }
  }

  return json({ lat: input.lat, lng: input.lng, hours: mapMetForecast(entry.body, now), source: 'met.no' }, 200, {
    'Cache-Control': 'private, max-age=900',
  })
})
