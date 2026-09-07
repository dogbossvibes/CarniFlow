// Root-Cause-Untersuchung (echtes iPhone Build 43 — "Suchdistanz bleibt 23s
// bei 0 m, obwohl der GPS-Puck sichtbar wandert"): evaluateSearchFix() hat
// KEINE Alters-/Plausibilisierungsprüfung für den ALLERERSTEN Fix einer neuen
// Absuche-Session — anders als startApproach.ts (isFreshFix/ageMs für die
// Arming-Phase). Der erste Fix wird IMMER bedingungslos akzeptiert und wird
// zum Referenzpunkt (prevFixRef) für das Speed-Gate ALLER folgenden Fixes.
// Liefert CoreLocation (ein bekanntes, dokumentiertes Verhalten direkt nach
// startUpdatingLocation()) zuerst eine kürzlich zwischengespeicherte, aber
// GEOGRAFISCH ENTFERNTE letzte Position, bevor der erste frische GPS-Fix
// eintrifft, wird JEDER nachfolgende reale (nahe) Fix als physikalisch
// unplausibler Sprung verworfen — bis genug Zeit vergangen ist, dass die
// implizite Durchschnittsgeschwindigkeit unter maxSpeedMps fällt. Genau in
// dieser Zeit bleibt distanceM/deviationM eingefroren, obwohl `position`
// (der Puck) unconditional bei JEDEM Fix aktualisiert wird (siehe
// useSearchRecorder.onFix: setPosition(sm) läuft VOR dem recording-Gate).
import { evaluateSearchFix, type SearchFixPrev } from '@/features/tracking/utils/searchFix';

const toRad = (d: number) => (d * Math.PI) / 180;
function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat), la2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
const M_PER_DEG = 111_320;

describe('evaluateSearchFix — kein Staleness-/Plausibilisierungs-Gate für den ersten Fix', () => {
  it('ein geografisch weit entfernter erster Fix (z. B. gecachte letzte Position) wird bedingungslos akzeptiert und blockiert reale Folgefixes minutenlang', () => {
    // Erster Fix: 300 m entfernt vom echten Fährtenansatz (plausibel für eine
    // kürzlich gecachte letzte Position — z. B. Parkplatz/Gebäude in der Nähe).
    const badAnchor = { lat: 300 / M_PER_DEG, lng: 0, t: 1000, accuracy: 8, speed: null };
    const first = evaluateSearchFix(null, badAnchor);
    expect(first.accepted).toBe(true);   // erster Fix: IMMER akzeptiert, keine Prüfung
    let prev: SearchFixPrev = { lat: badAnchor.lat, lng: badAnchor.lng, t: badAnchor.t };

    // Reale Position am echten Ansatz (0,0) — 23 Sekunden lang, 1 Fix/Sekunde.
    const real = { lat: 0, lng: 0 };
    let acceptedCount = 0;
    let lastDecision;
    for (let sec = 1; sec <= 23; sec++) {
      const cur = { lat: real.lat, lng: real.lng, t: 1000 + sec * 1000, accuracy: 5, speed: 0 };
      lastDecision = evaluateSearchFix(prev, cur);
      if (lastDecision.accepted) { acceptedCount++; prev = { lat: cur.lat, lng: cur.lng, t: cur.t }; }
      // WICHTIG: prev bleibt bei Ablehnung UNVERÄNDERT (== der Bug) — das
      // spiegelt exakt useSearchRecorder.onFix: prevFixRef.current wird nur
      // bei decision.accepted aktualisiert.
    }

    // Über die vollen 23 Sekunden: praktisch KEIN einziger realer Fix wird
    // akzeptiert (implizite Geschwindigkeit 300m/23s ≈ 13 m/s liegt noch immer
    // über SEARCH_MAX_SPEED_MPS=12) — exakt das beobachtete Bild: Distanz und
    // Abweichung bleiben eingefroren, während der Puck (setPosition läuft
    // unconditional VOR diesem Gate) sichtbar weiterwandert.
    expect(acceptedCount).toBe(0);
    expect(lastDecision?.reason).toBe('speed');
    expect(distM(prev, real)).toBeCloseTo(300, 0);   // Referenzpunkt für das Gate hat sich nie bewegt
  });

  it('bei einem NAHEN (plausiblen) ersten Fix tritt dasselbe Problem nicht auf — bestätigt: die Distanz des ERSTEN Fixes zum echten Ansatz ist der entscheidende Faktor, nicht Core Motion/Fusion', () => {
    const goodAnchor = { lat: 0, lng: 0, t: 1000, accuracy: 5, speed: null };
    let prev: SearchFixPrev = { lat: goodAnchor.lat, lng: goodAnchor.lng, t: goodAnchor.t };
    let acceptedCount = 0;
    for (let sec = 1; sec <= 5; sec++) {
      const cur = { lat: 0, lng: (sec * 2) / M_PER_DEG, t: 1000 + sec * 1000, accuracy: 5, speed: 1.5 };
      const d = evaluateSearchFix(prev, cur);
      if (d.accepted) { acceptedCount++; prev = { lat: cur.lat, lng: cur.lng, t: cur.t }; }
    }
    expect(acceptedCount).toBe(5);   // normales Gehen ab einem plausiblen ersten Fix: alles akzeptiert
  });

  it('Vergleich: startApproach.ts (Arming-Phase) HAT eine Alters-/Plausibilisierungsprüfung für den ERSTEN Fix — evaluateSearchFix (Absuche) nicht. Architektonische Inkonsistenz, kein Zufall.', () => {
    // Reine Dokumentations-Assertion (siehe startApproach.ts: isFreshFix/isEligible
    // prüfen JEDEN Fix inkl. des ersten gegen ageMs/jumpSpeedMps/Accuracy/Radius —
    // evaluateSearchFix hat für den ersten Fix nur `if (!prev) return accepted:true`,
    // keine einzige Prüfung).
    const veryOldFix = { lat: 0, lng: 300 / M_PER_DEG, t: 1000, accuracy: 5, speed: null };
    // evaluateSearchFix kennt gar kein ageMs-Feld im Cur-Typ — kann eine
    // veraltete Position also strukturell nicht erkennen.
    const result = evaluateSearchFix(null, veryOldFix);
    expect(result.accepted).toBe(true);
    expect('ageMs' in veryOldFix).toBe(false);
  });
});
