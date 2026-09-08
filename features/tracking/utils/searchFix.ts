// ──────────────────────────────────────────────────────────────────────────
// Reine Fix-Annahme der Absuche (P1) — bewusst OHNE React/Expo/Native-Imports,
// damit sie isoliert testbar ist. Entscheidet, ob ein GPS-Fix ein gültiger
// Linien-Fix ist, mit denselben Gates wie der Lege-Recorder (useTrackRecorder):
//   • Genauigkeit ≤ maxAccuracyM (Default 45 m, wie MAX_ACCURACY_M beim Legen)
//   • Geschwindigkeit ≤ maxSpeedMps (Default 12 m/s, wie MAX_SPEED_MPS beim Legen),
//     berechnet aus Position/Zeit gegen den letzten AKZEPTIERTEN Fix
//   • KEIN absoluter Jump-Filter (wie beim Legen)
// Fehlende accuracy/speed führen NICHT zur Ablehnung.
// ──────────────────────────────────────────────────────────────────────────

// Defaults gespiegelt aus useTrackRecorder (dort modul-lokal, nicht exportiert;
// der Lege-Recorder wird bewusst nicht verändert).
export const SEARCH_MAX_ACCURACY_M = 45;
export const SEARCH_MAX_SPEED_MPS = 12;

type LL = { latitude: number; longitude: number };

const toRad = (d: number) => (d * Math.PI) / 180;
export function distM(a: LL, b: LL): number {
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const la1 = toRad(a.latitude), la2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type SearchFixReason = 'first' | 'ok' | 'accuracy' | 'speed' | 'anchor_reset';
export interface SearchFixDecision {
  accepted:  boolean;
  reason:    SearchFixReason;
  accuracy:  number | null;
  speed:     number | null;
  jumpM:     number | null;   // Distanz zum letzten akzeptierten Fix (Diagnose)
}
export interface SearchFixPrev { lat: number; lng: number; t: number }
export interface SearchFixCur  { lat: number; lng: number; t: number; accuracy: number | null; speed: number | null }
// Zuletzt wegen 'speed' verworfene Kandidaten (nur Position/Zeit) — dient
// ausschliesslich der Anker-Recovery unten (siehe ANCHOR_RESET_*), KEINE
// zweite Zustandsquelle für die eigentliche Geometrie.
export interface SearchFixRejectedRecord { lat: number; lng: number; t: number }

// Root-Cause-Fix (echtes iPhone, Build 43 — "Suchdistanz bleibt 23s bei 0 m,
// obwohl der GPS-Puck sichtbar wandert"): der ALLERERSTE Fix einer Absuche
// wurde bisher bedingungslos akzeptiert (keine Alters-/Plausibilisierungs-
// prüfung, anders als startApproach.ts/isFreshFix für die Arming-Phase) und
// wurde zum Referenzpunkt für das Speed-Gate ALLER folgenden Fixes. Liefert
// CoreLocation direkt nach dem Start (dokumentiertes, reales Verhalten) zuerst
// eine kürzlich zwischengespeicherte, aber geografisch andere letzte Position,
// wird JEDER echte, nahe Folgefix als unplausibler Sprung verworfen — bis
// genug Zeit vergangen ist, dass die implizite Geschwindigkeit unter
// maxSpeedMps fällt (bei z. B. 300 m Anker-Fehler > 20 Sekunden). In dieser
// Zeit blieb distanceM/deviationM eingefroren (siehe
// staleFirstFixFreeze.test.ts). Fix: werden mehrere aufeinanderfolgende Fixes
// wegen 'speed' verworfen, wird geprüft, ob sie EIN plausibler, in sich
// konsistenter Cluster/Pfad sind — dann ist mit hoher Wahrscheinlichkeit NICHT
// die neue Position falsch, sondern der alte Anker.
//
// Zweite Root-Cause-Ergänzung (Feldtest-Audit, "Puck bewegt sich, Distanz
// bleibt 0 m" bei degradierter Ansatz-Genauigkeit, z. B. ±16 m): die
// ursprüngliche Prüfung verlangte, dass ALLE Punkte (paarweise) innerhalb
// ANCHOR_RESET_MAX_SPREAD_M liegen — das passt für einen STEHENDEN Handler
// nahe einem falschen Anker (Ursprungsfall), aber NICHT für einen GEHENDEN
// Handler, der sich vom falschen Anker konsequent WEGBEWEGT (jeder Folgepunkt
// liegt weiter vom vorigen entfernt als 8 m, obwohl der Pfad selbst absolut
// plausibel ist). Für genau diesen Fall zusätzlich: eine KONSEKUTIVE
// Geschwindigkeits-Plausibilisierung — bilden die Rejects (chronologisch,
// Schritt für Schritt) einen in sich schlüssigen Pfad (jeder Schritt selbst
// ≤ maxSpeedMps), ist das ebenfalls ausreichend Beleg für einen falschen
// Anker, unabhängig von der absoluten Streuung. Beide Kriterien sind additiv
// (ODER) — keins ersetzt das andere, beide decken unterschiedliche reale
// Szenarien ab (stehend vs. gehend).
export const ANCHOR_RESET_MIN_CONSECUTIVE = 3;   // Gesamtzahl konsistenter Fixes (inkl. `cur`), die einen Reset auslösen
export const ANCHOR_RESET_MAX_SPREAD_M    = 8;   // „stehend"-Fall: alle paarweise innerhalb dieses Radius

function clusterIsConsistent(points: readonly { lat: number; lng: number }[], maxSpreadM: number): boolean {
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (distM({ latitude: points[i].lat, longitude: points[i].lng }, { latitude: points[j].lat, longitude: points[j].lng }) > maxSpreadM) return false;
    }
  }
  return true;
}

// „gehend"-Fall: kein absolutes Streuungsmass, sondern INTERNE Schlüssigkeit —
// jeder EINZELNE Schritt zwischen chronologisch aufeinanderfolgenden Punkten
// muss für sich genommen mit maxSpeedMps plausibel sein. Anders als die
// Ablehnung gegen den (mutmasslich falschen) alten Anker verlangt das nicht
// „nah beieinander", sondern nur "ein durchgehend plausibler Pfad".
function trajectoryIsConsistent(
  points: readonly { lat: number; lng: number; t: number }[], maxSpeedMps: number,
): boolean {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return false;
    const step = distM({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });
    if (step / dt > maxSpeedMps) return false;
  }
  return true;
}

export function evaluateSearchFix(
  prev: SearchFixPrev | null,
  cur: SearchFixCur,
  params?: { maxAccuracyM?: number; maxSpeedMps?: number },
  recentRejected?: readonly SearchFixRejectedRecord[],
): SearchFixDecision {
  const maxAccuracyM = params?.maxAccuracyM ?? SEARCH_MAX_ACCURACY_M;
  const maxSpeedMps  = params?.maxSpeedMps ?? SEARCH_MAX_SPEED_MPS;

  // Genauigkeit: nur ablehnen, wenn vorhanden UND zu grob (fehlend = akzeptieren).
  if (cur.accuracy != null && cur.accuracy > maxAccuracyM) {
    return { accepted: false, reason: 'accuracy', accuracy: cur.accuracy, speed: cur.speed, jumpM: null };
  }

  // Erster Fix: kein Sprungvergleich möglich → akzeptieren.
  if (!prev) {
    return { accepted: true, reason: 'first', accuracy: cur.accuracy, speed: cur.speed, jumpM: null };
  }

  // Speed-Gate (aus Position/Zeit, wie Legen): unrealistischer Sprung = Ausreisser.
  const jumpM = distM({ latitude: prev.lat, longitude: prev.lng }, { latitude: cur.lat, longitude: cur.lng });
  const dt = (cur.t - prev.t) / 1000;
  if (dt > 0 && jumpM / dt > maxSpeedMps) {
    const needed = ANCHOR_RESET_MIN_CONSECUTIVE - 1;
    if (recentRejected && recentRejected.length >= needed) {
      const cluster = [...recentRejected.slice(-needed), { lat: cur.lat, lng: cur.lng, t: cur.t }];
      if (clusterIsConsistent(cluster, ANCHOR_RESET_MAX_SPREAD_M) || trajectoryIsConsistent(cluster, maxSpeedMps)) {
        return { accepted: true, reason: 'anchor_reset', accuracy: cur.accuracy, speed: cur.speed, jumpM };
      }
    }
    return { accepted: false, reason: 'speed', accuracy: cur.accuracy, speed: cur.speed, jumpM };
  }
  return { accepted: true, reason: 'ok', accuracy: cur.accuracy, speed: cur.speed, jumpM };
}
