import {
  DEFAULT_SEARCH_START_CONFIG, INITIAL_SEARCH_START,
  evaluateStartCandidate, isPlausibleStartFix, stepSearchStart, firstLegHeadingDeg,
  searchStartStatusText, type SearchStartAcqState, type SearchStartFixInput,
  type SearchStartMotionInput,
} from '@/features/tracking/engine/searchStartAcquisition';
import { estimateDogProgressM, type LL } from '@/features/tracking/utils/searchGeometry';

const cfg = DEFAULT_SEARCH_START_CONFIG;

// Reine, lokale Meter-Projektion (Äquator, cos(0)=1) — dieselbe Annahme wie
// projectForward's mPerLat/mPerLng — damit Testkoordinaten direkt in Metern
// gedacht werden können, ohne eine zweite Geo-Bibliothek im Test zu brauchen.
const M_PER_DEG = 111320;
function toLL(xEastM: number, yNorthM: number): LL {
  return { latitude: yNorthM / M_PER_DEG, longitude: xEastM / M_PER_DEG };
}
// Reale gelegte Fährten haben Punkte ca. alle 1.5-2 m (MIN_SEGMENT in
// useSearchRecorder) — NICHT einen Punkt nur an jeder Ecke. Ein einzelnes
// 30-m-Segment würde projectForward's Fenstercheck (Segment gültig, wenn sein
// GESAMTER Bogenlängenbereich das Fenster überlappt) irreführend grosszügig
// machen. Testfährten werden daher auf ~2 m dicht interpoliert — realistische
// Trackauflösung, wie vom Auftrag gefordert ("bestehende Trackauflösung ...
// prüfen").
function buildTrack(waypointsM: [number, number][]): { points: LL[]; cum: number[] } {
  const dense: [number, number][] = [waypointsM[0]];
  for (let i = 1; i < waypointsM.length; i++) {
    const [x0, y0] = waypointsM[i - 1], [x1, y1] = waypointsM[i];
    const segLen = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.round(segLen / 2));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      dense.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  const points = dense.map(([x, y]) => toLL(x, y));
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const [x0, y0] = dense[i - 1], [x1, y1] = dense[i];
    cum.push(cum[i - 1] + Math.hypot(x1 - x0, y1 - y0));
  }
  return { points, cum };
}

// Feldtest-Nachbau (06.09.2026): Startbein 30 m Richtung Norden, kurzer
// Verbinder, dann ein SPÄTERER Schenkel, der parallel zurückläuft — nur
// `sepM` Meter neben dem Start, aber weit jenseits des Startfensters (arc 35-65).
function nearbyLaterLegTrack(sepM: number) {
  return buildTrack([[0, 0], [0, 30], [sepM, 30], [sepM, 0]]);
}

function feedFixes(
  n: number, positions: LL[], accuracy: number, track: { points: LL[]; cum: number[] }, firstLeg: number | null,
): SearchStartAcqState {
  let st = INITIAL_SEARCH_START;
  for (let i = 0; i < n; i++) {
    const p = positions[Math.min(i, positions.length - 1)];
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const sample: SearchStartFixInput = { position: p, accuracy, headingDeg: null };
    st = stepSearchStart(st, evalu, sample, firstLeg, cfg);
  }
  return st;
}

describe('searchStartAcquisition — Konstanten', () => {
  it('konservative Standardwerte', () => {
    expect(cfg.startWindowM).toBe(12);
    expect(cfg.requiredFixes).toBe(3);
    expect(cfg.maxAccuracyM).toBe(25);
  });
});

describe('searchStartAcquisition — evaluateStartCandidate (Punkt 1C/3)', () => {
  it('sucht NUR innerhalb [0, startWindowM] — ein späterer, geometrisch näherer Schenkel wird nie Kandidat', () => {
    const track = nearbyLaterLegTrack(2);   // Testfall A: 2 m Trennung
    // Handler steht praktisch AUF dem späteren Schenkel (x=2, y=15) — die volle
    // Polyline-Suche würde hier fast 0 m Abweichung finden (arc ≈ 30+5+15=50).
    const p = toLL(2, 15);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    // Kandidat bleibt im Startfenster [0,12] → Abweichung ist die Distanz zum
    // START-Schenkel (x=0), NICHT die ~0 m Distanz zum späteren Schenkel.
    expect(evalu.candidateAtM).not.toBeNull();
    // Deutlich vor dem späteren Schenkel (arc ≈ 35-65) — die Projektion bleibt
    // auf dem Start-Schenkel, nicht auf irgendeinem geometrisch näheren Punkt.
    expect(evalu.candidateAtM!).toBeLessThan(20);
    expect(evalu.candidateDevM!).toBeGreaterThan(1.5);   // ~2 m zum Start-Schenkel, nicht ~0 m
    // Diagnose-Ambiguity: ausserhalb des Fensters liegt ein fast ebenso naher
    // Abschnitt (der spätere Schenkel) — das wird geloggt, ändert aber nichts
    // an candidateAtM/candidateDevM.
    expect(evalu.ambiguityM).not.toBeNull();
    expect(evalu.ambiguityM!).toBeGreaterThan(1);
  });

  it('grosse Abweichung, wenn die Position weit von JEDEM Punkt im Startfenster entfernt ist', () => {
    const track = nearbyLaterLegTrack(5);
    const farAway = toLL(5, 100);   // weit jenseits des gesamten Tracks
    const evalu = evaluateStartCandidate(farAway, track.points, track.cum, cfg);
    expect(evalu.candidateDevM).not.toBeNull();
    expect(evalu.candidateDevM!).toBeGreaterThan(cfg.maxAccuracyM);   // faktisch unerreichbar plausibel
  });
});

describe('searchStartAcquisition — Testfälle enge Tracks (Punkt 12)', () => {
  it('A) 2 m Trennung → echter Start wird gelockt, nie der spätere Schenkel', () => {
    const track = nearbyLaterLegTrack(2);
    const positions = [toLL(1.5, 0.5), toLL(0.8, 0.3), toLL(0.3, 0.1)];
    const st = feedFixes(3, positions, 4, track, null);
    expect(st.state).toBe('START_LOCKED');
    expect(st.lockedAtM!).toBeLessThan(cfg.startWindowM);
  });

  it('B) 5 m Trennung → Start korrekt (realistische Feld-Accuracy)', () => {
    const track = nearbyLaterLegTrack(5);
    const positions = [toLL(3, 1), toLL(1.5, 0.5), toLL(0.5, 0.2)];
    const st = feedFixes(3, positions, 6, track, null);   // accuracy 6 m → Allowance 6 m
    expect(st.state).toBe('START_LOCKED');
    expect(st.lockedAtM!).toBeLessThan(cfg.startWindowM);
  });

  it('C) 10 m Trennung → Start korrekt (gröberes GPS, weiterhin nur der echte Start als Kandidat)', () => {
    const track = nearbyLaterLegTrack(10);
    const positions = [toLL(6, 1), toLL(2, 0.5), toLL(0.5, 0.2)];
    const st = feedFixes(3, positions, 10, track, null);   // accuracy 10 m → Allowance 10 m
    expect(st.state).toBe('START_LOCKED');
    expect(st.lockedAtM!).toBeLessThan(cfg.startWindowM);
  });

  it('D) später Track kreuzt den Startbereich (schliesst am Startpunkt) → Start bleibt Start', () => {
    // Schleife, die exakt wieder bei (0,0) endet — dieselbe Koordinate taucht
    // am ENDE der Fährte (hohe Bogenlänge) nochmal auf.
    const track = buildTrack([[0, 0], [0, 30], [10, 30], [10, -10], [0, -10], [0, 0]]);
    const positions = [toLL(0.3, 0.2), toLL(0.1, 0.1), toLL(0, 0)];
    const st = feedFixes(3, positions, 4, track, null);
    expect(st.state).toBe('START_LOCKED');
    // Muss die FRÜHE Bogenlänge sein (≈0), nicht die späte (Perimeter ≈ 30+10+40+10+10=100).
    expect(st.lockedAtM!).toBeLessThan(cfg.startWindowM);
  });

  it('E) später Schenkel ist geometrisch näher als der Startanker → vor Lock trotzdem kein Sprung darauf', () => {
    const track = nearbyLaterLegTrack(8);
    // Handler steht praktisch AUF dem späteren Schenkel (0.1 m entfernt),
    // aber ~8 m vom echten Start entfernt.
    const p = toLL(8, 15);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    // Kandidat bleibt im Startfenster → Abweichung ~8 m zum Start-Schenkel.
    expect(evalu.candidateDevM!).toBeGreaterThan(6);
    const sample: SearchStartFixInput = { position: p, accuracy: 3, headingDeg: null };
    // Bei guter Accuracy (3 m) ist eine 8-m-Abweichung NICHT plausibel → kein Lock.
    expect(isPlausibleStartFix(evalu, sample, null, cfg)).toBe(false);
    const st = stepSearchStart(INITIAL_SEARCH_START, evalu, sample, null, cfg);
    expect(st.state).not.toBe('START_LOCKED');
  });
});

describe('searchStartAcquisition — Hundeabstand-Trennung (Punkt 4/13)', () => {
  it('lockedAtM kommt NIE aus dem Hundabstand — der Hundabstand ist hier nicht Teil der Bewertung', () => {
    // Die Acquisition selbst kennt handlerDistanceM gar nicht (siehe useSearchRecorder:
    // der Hundabstand wird erst NACH START_LOCKED auf den Fortschritt addiert).
    const track = nearbyLaterLegTrack(5);
    const positions = [toLL(3, 1), toLL(1, 0.3), toLL(0.2, 0.1)];
    const st = feedFixes(3, positions, 5, track, null);
    expect(st.state).toBe('START_LOCKED');
    // lockedAtM ist die reine Handler-Bogenlänge (~0), unabhängig von 1/5/10 m.
    expect(st.lockedAtM!).toBeLessThan(3);
  });
});

describe('searchStartAcquisition — GPS-Qualität (Punkt 14)', () => {
  it('ein einzelner schlechter Fix darf nicht falsch locken (Support-Reset)', () => {
    const track = nearbyLaterLegTrack(5);
    let st = INITIAL_SEARCH_START;
    const good = toLL(0.3, 0.2);
    const good2 = evaluateStartCandidate(good, track.points, track.cum, cfg);
    st = stepSearchStart(st, good2, { position: good, accuracy: 4, headingDeg: null }, null, cfg);
    st = stepSearchStart(st, good2, { position: good, accuracy: 4, headingDeg: null }, null, cfg);
    expect(st.support).toBe(2);
    // Ausreisser: sehr schlechte Accuracy jenseits maxAccuracyM.
    const bad = evaluateStartCandidate(good, track.points, track.cum, cfg);
    st = stepSearchStart(st, bad, { position: good, accuracy: 40, headingDeg: null }, null, cfg);
    expect(st.support).toBe(0);
    expect(st.state).not.toBe('START_LOCKED');
    // Danach wieder gute Fixes → lockt trotzdem noch (kein Dauerblock).
    st = stepSearchStart(st, good2, { position: good, accuracy: 4, headingDeg: null }, null, cfg);
    st = stepSearchStart(st, good2, { position: good, accuracy: 4, headingDeg: null }, null, cfg);
    st = stepSearchStart(st, good2, { position: good, accuracy: 4, headingDeg: null }, null, cfg);
    expect(st.state).toBe('START_LOCKED');
  });

  it('±3/±5/±10/±20 m Accuracy: degradiert graziös statt hart zu blockieren', () => {
    const track = nearbyLaterLegTrack(3);
    const nearStart = toLL(0.5, 0.3);
    for (const acc of [3, 5, 10, 20]) {
      const evalu = evaluateStartCandidate(nearStart, track.points, track.cum, cfg);
      const st = feedFixes(3, [nearStart], acc, track, null);
      expect(st.state).toBe('START_LOCKED');
      expect(evalu.candidateDevM).not.toBeNull();
    }
  });

  it('Accuracy jenseits maxAccuracyM (25 m) wird gar nicht gewertet — aber kein Absturz/Endlosblock', () => {
    const track = nearbyLaterLegTrack(3);
    const p = toLL(0.5, 0.3);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    expect(isPlausibleStartFix(evalu, { position: p, accuracy: 30, headingDeg: null }, null, cfg)).toBe(false);
  });
});

describe('searchStartAcquisition — False Start (Punkt 15)', () => {
  it('Handler 5 m neben einem späteren Schenkel, aber 25 m vom echten Start entfernt → kein Lock', () => {
    const track = nearbyLaterLegTrack(5);
    // 25 m nördlich des Starts, aber direkt neben dem späteren Schenkel (x=5).
    const p = toLL(5, 25);
    // Im Startfenster [0,12] projiziert das auf das Ende des Start-Schenkels
    // (arc≈12) mit grosser Abweichung (~5 m seitlich UND ausserhalb der reinen
    // Nähe) — auf keinen Fall der spätere Schenkel selbst.
    const st = feedFixes(3, [p], 4, track, null);
    expect(st.state).not.toBe('START_LOCKED');
  });
});

describe('searchStartAcquisition — Early Course / Heading (Punkt 5/16)', () => {
  it('firstLegHeadingDeg: Richtung des ersten Schenkels wird korrekt berechnet', () => {
    const track = buildTrack([[0, 0], [0, 30]]);   // exakt nach Norden
    const heading = firstLegHeadingDeg(track.points, track.cum);
    expect(heading).not.toBeNull();
    expect(Math.abs(heading! - 0)).toBeLessThan(1);   // Norden ≈ 0°
  });

  it('fehlender/instabiler Kurs blockiert das Locken NIE', () => {
    const track = nearbyLaterLegTrack(3);
    const p = toLL(0.5, 0.3);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const firstLeg = firstLegHeadingDeg(track.points, track.cum);
    expect(isPlausibleStartFix(evalu, { position: p, accuracy: 4, headingDeg: null }, firstLeg, cfg)).toBe(true);
  });

  it('ein starker Kurswiderspruch verhindert das Locken (weiche Evidenz, kein Positions-Hardgate)', () => {
    const track = buildTrack([[0, 0], [0, 30]]);   // erster Schenkel exakt Norden (0°)
    const p = toLL(0.3, 0.2);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    // Bewegungsrichtung exakt entgegengesetzt (Süden, 180°) bei guter Accuracy.
    expect(isPlausibleStartFix(evalu, { position: p, accuracy: 3, headingDeg: 180 }, 0, cfg)).toBe(false);
    // Leicht abweichend (30°) bleibt plausibel — nur grobe Plausibilität verlangt.
    expect(isPlausibleStartFix(evalu, { position: p, accuracy: 3, headingDeg: 30 }, 0, cfg)).toBe(true);
  });
});

describe('searchStartAcquisition — Start Lock (Punkt 9/11)', () => {
  it('kein Übergang direkt zu START_LOCKED durch einen einzelnen Fix', () => {
    const track = nearbyLaterLegTrack(3);
    const p = toLL(0.3, 0.2);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const st = stepSearchStart(INITIAL_SEARCH_START, evalu, { position: p, accuracy: 4, headingDeg: null }, null, cfg);
    expect(st.state).toBe('START_CANDIDATE');
    expect(st.state).not.toBe('START_LOCKED');
  });

  it('einmal START_LOCKED bleibt es das, auch bei einem anschliessenden schlechten Fix (kein Zurückfallen durch Jitter)', () => {
    const locked: SearchStartAcqState = { state: 'START_LOCKED', support: 3, lockedAtM: 2 };
    const track = nearbyLaterLegTrack(3);
    const far = toLL(50, 50);
    const evalu = evaluateStartCandidate(far, track.points, track.cum, cfg);
    const st = stepSearchStart(locked, evalu, { position: far, accuracy: 40, headingDeg: null }, null, cfg);
    expect(st).toBe(locked);   // unverändert zurückgegeben
    expect(st.state).toBe('START_LOCKED');
  });
});

describe('searchStartAcquisition — UI-Text (Punkt 17)', () => {
  it('SEEKING_START zeigt keinen eigenen Text (bestehender Ansatz-Text bleibt)', () => {
    expect(searchStartStatusText('SEEKING_START')).toBeNull();
  });
  it('START_CANDIDATE / START_LOCKED haben kurze, unaufdringliche Texte', () => {
    expect(searchStartStatusText('START_CANDIDATE')).toMatch(/erkannt|erkennung/i);
    expect(searchStartStatusText('START_LOCKED')).toMatch(/erkannt/i);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Punkt 23 — Real-Field-Test-Nachbau (06.09.2026): echter Start, ein späterer
// Schenkel eng daneben, 5 m Hundabstand, leicht schwankendes GPS, Handler
// kommt zum Ansatz und die Absuche beginnt. Getrieben durch dieselben reinen
// Funktionen, die useSearchRecorder tatsächlich aufruft (evaluateStartCandidate/
// stepSearchStart/estimateDogProgressM) — "logisch nachweisbar" statt eines
// vollen Hook-Renders (kein neuer GPS-Mock-Harness für dieses eine Szenario).
// ──────────────────────────────────────────────────────────────────────────
describe('Real-Field-Test-Nachbau (06.09.2026)', () => {
  // Startbein 40 m, danach ein Schenkel, der nur 4 m neben dem Start zurückläuft
  // ("Startbereich und späterer Trackabschnitt liegen eng nebeneinander").
  const track = buildTrack([[0, 0], [0, 40], [4, 40], [4, 0]]);
  const HANDLER_DISTANCE_M = 5;   // aus dem Feldtest

  it('VOR dem Fix (logisch nachweisbar): der reine Dog-Offset würde den virtuellen Hund sofort 5 m weit vorschieben — vor jedem Lock', () => {
    // Das ist exakt der alte Aufruf aus useSearchRecorder (unverändert als
    // Funktion, siehe searchGeometry.ts) — angewendet auf progress=0 (Zustand
    // direkt nach dem Start-Tap, bevor auch nur ein Fix verarbeitet wurde).
    const dogProgressWithoutGate = estimateDogProgressM(0, HANDLER_DISTANCE_M, track.cum[track.cum.length - 1]);
    expect(dogProgressWithoutGate).toBe(HANDLER_DISTANCE_M);   // 5 m — NICHT 0 m
  });

  it('NACH dem Fix: Start-Acquisition lockt zuverlässig auf das Startsegment, cursor nahe 0', () => {
    // GPS schwankt leicht (Feldtest: Ansatzdistanz 3.0 m dann 4.4 m, danach
    // Abweichungen 7 → 4.8 → 2.1 → 1.3 m) — hier als plausible, konvergierende
    // Fix-Serie direkt am Ansatz nachgebildet.
    const fixes: { p: LL; accuracy: number }[] = [
      { p: toLL(0.3, -0.2), accuracy: 7 },    // Handler kommt an, noch leicht daneben
      { p: toLL(0.1, 0.1), accuracy: 5 },
      { p: toLL(0.05, 0.2), accuracy: 4 },
    ];
    let st = INITIAL_SEARCH_START;
    for (const f of fixes) {
      const evalu = evaluateStartCandidate(f.p, track.points, track.cum, cfg);
      st = stepSearchStart(st, evalu, { position: f.p, accuracy: f.accuracy, headingDeg: null }, null, cfg);
    }
    expect(st.state).toBe('START_LOCKED');
    // Cursor/Startprogress kommt aus dem Startfenster, nicht aus dem 4 m
    // entfernten späteren Schenkel (arc ≈ 44-84).
    expect(st.lockedAtM!).toBeLessThan(20);

    // ERST jetzt, nach dem Lock, darf der Hundabstand addiert werden — und
    // landet dann korrekt kurz hinter dem Start, nicht auf dem späteren Schenkel.
    const dogProgressAfterLock = estimateDogProgressM(st.lockedAtM!, HANDLER_DISTANCE_M, track.cum[track.cum.length - 1]);
    expect(dogProgressAfterLock).toBeLessThan(20);
  });

  it('Gegenprobe: ohne Startfenster-Beschränkung könnte derselbe Feldtest auf den falschen (späteren) Schenkel locken', () => {
    // Handler steht (noch) näher am späteren Schenkel als am echten Start —
    // exakt die im Feldtest vermutete Mehrdeutigkeit. Mit voller (nicht auf
    // das Startfenster begrenzter) Suche wäre der 4-m-entfernte spätere
    // Schenkel u.U. der geometrisch nähere Kandidat.
    const unrestricted = { ...cfg, startWindowM: 1000 };
    const p = toLL(4, 20);   // praktisch auf dem späteren Schenkel
    const evaluRestricted = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const evaluUnrestricted = evaluateStartCandidate(p, track.points, track.cum, unrestricted);
    // Mit Fenster: Kandidat bleibt der Start-Schenkel (grosse Abweichung, ~4 m).
    expect(evaluRestricted.candidateDevM!).toBeGreaterThan(3);
    // Ohne Fenster: der spätere Schenkel wäre praktisch auf der Position (~0 m) —
    // genau die Mehrdeutigkeit, die Punkt 3 verhindern soll.
    expect(evaluUnrestricted.candidateDevM!).toBeLessThan(0.5);
    expect(evaluUnrestricted.candidateAtM!).toBeGreaterThan(40);   // späterer Schenkel, arc > 44
  });
});

// ──────────────────────────────────────────────────────────────────────────
// Core-Motion-Erweiterung (Core-Motion-Sensor-Fusion, Punkt 7): motion ist ein
// rein OPTIONALES Zusatzfeld auf SearchStartFixInput. Alle Tests oben laufen
// unverändert weiter, ohne motion je zu setzen — das ist selbst bereits der
// wichtigste Regressionsbeweis: bestehende Aufrufer (useSearchRecorder, Android,
// iOS ohne Motion-Permission) verhalten sich exakt wie vor dieser Erweiterung.
// ──────────────────────────────────────────────────────────────────────────
describe('searchStartAcquisition — Core-Motion-Zusatzevidenz (Punkt 7)', () => {
  const walking: SearchStartMotionInput = { movementState: 'walking', motionConfidence: 0.9 };
  const stationaryHighConf: SearchStartMotionInput = { movementState: 'stationary', motionConfidence: 0.9 };
  const lowConfWalking: SearchStartMotionInput = { movementState: 'walking', motionConfidence: 0.2 };

  it('erster Fix 5 m vom Start entfernt: ein einzelner plausibler Fix darf NIE sofort locken, auch mit starker Motion-Evidenz', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(3, 1);   // ~5 m seitlich vom Start, innerhalb der geweiteten Allowance
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const sample: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null, motion: walking };
    const st = stepSearchStart(INITIAL_SEARCH_START, evalu, sample, null, cfg);
    expect(st.state).toBe('START_CANDIDATE');
    expect(st.state).not.toBe('START_LOCKED');
    expect(st.support).toBe(1);
  });

  it('Handler-Distanz/Motion darf vor dem Lock NIE einen virtuellen Hundefortschritt erzeugen (lockedAtM bleibt null bis START_LOCKED)', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(3, 1);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    // Auch bei starker, hoch-confidenter Bewegungsevidenz (z. B. Handler läuft
    // bereits energisch) darf lockedAtM erst nach dem vollen Support gesetzt
    // werden — Motion beschleunigt NICHT die Anzahl nötiger Fixes.
    let st = INITIAL_SEARCH_START;
    const sample: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null, motion: walking };
    st = stepSearchStart(st, evalu, sample, null, cfg);
    expect(st.lockedAtM).toBeNull();
    st = stepSearchStart(st, evalu, sample, null, cfg);
    expect(st.lockedAtM).toBeNull();
    expect(st.state).toBe('START_CANDIDATE');
  });

  it('mehrere plausible Fixes (mit Motion-Evidenz) in Folge → START_LOCKED, wie ohne Motion', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(3, 1);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    let st = INITIAL_SEARCH_START;
    const sample: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null, motion: walking };
    for (let i = 0; i < cfg.requiredFixes; i++) st = stepSearchStart(st, evalu, sample, null, cfg);
    expect(st.state).toBe('START_LOCKED');
    expect(st.lockedAtM).not.toBeNull();
  });

  it('Motion mit ausreichender Confidence (walking/running) weitet die Allowance leicht auf — ein Fix knapp ausserhalb der reinen Accuracy-Allowance wird dadurch plausibel', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(4.5, 1);   // Abweichung liegt knapp über der reinen Accuracy-Allowance (4 m), aber innerhalb +motionAllowanceBonusM (2 m)
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    expect(evalu.candidateDevM!).toBeGreaterThan(4);
    expect(evalu.candidateDevM!).toBeLessThanOrEqual(4 + cfg.motionAllowanceBonusM);

    const withoutMotion: SearchStartFixInput = { position: p, accuracy: 4, headingDeg: null };
    expect(isPlausibleStartFix(evalu, withoutMotion, null, cfg)).toBe(false);

    const withMotion: SearchStartFixInput = { position: p, accuracy: 4, headingDeg: null, motion: walking };
    expect(isPlausibleStartFix(evalu, withMotion, null, cfg)).toBe(true);
  });

  it('Motion mit zu geringer Confidence gibt KEINEN Bonus — verhält sich wie ganz ohne Motion', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(4.5, 1);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const sample: SearchStartFixInput = { position: p, accuracy: 4, headingDeg: null, motion: lowConfWalking };
    expect(isPlausibleStartFix(evalu, sample, null, cfg)).toBe(false);
  });

  it('"stationary" mit hoher Confidence bleibt NEUTRAL — kein Malus für einen ruhig stehenden Handler direkt am Start (gleiche Lehre wie der Stillstands-Regressions-Fix)', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(3, 1);   // eindeutig innerhalb der reinen Accuracy-Allowance
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const withoutMotion: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null };
    const withStationary: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null, motion: stationaryHighConf };
    expect(isPlausibleStartFix(evalu, withoutMotion, null, cfg)).toBe(true);
    expect(isPlausibleStartFix(evalu, withStationary, null, cfg)).toBe(true);   // unverändert plausibel, kein Malus
  });

  it('motion: null (explizit kein Signal, z. B. Android/iOS-Permission verweigert) verhält sich identisch zu motion: undefined', () => {
    const track = nearbyLaterLegTrack(5);
    const p = toLL(3, 1);
    const evalu = evaluateStartCandidate(p, track.points, track.cum, cfg);
    const withUndefined: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null };
    const withNull: SearchStartFixInput = { position: p, accuracy: 6, headingDeg: null, motion: null };
    expect(isPlausibleStartFix(evalu, withNull, null, cfg)).toBe(isPlausibleStartFix(evalu, withUndefined, null, cfg));
  });
});
