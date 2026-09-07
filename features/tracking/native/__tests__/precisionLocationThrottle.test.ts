// Verifiziert den EMIT-DROSSEL-VERTRAG, der in
// modules/anyvo-precision-location/ios/AnyvoPrecisionLocationManager.swift
// (didUpdateLocations) nativ implementiert ist — Audit-Abschnitt 2/6 (Fälle
// B–E). Dies ist ein reiner TS-Spiegel des Algorithmus (erster Fix sofort,
// danach mindestens `intervalMs` seit dem letzten EMIT, monotone Uhr), NICHT
// die kompilierte Swift-Implementierung selbst — Jest kann kein Swift
// ausführen. Die reale Kompilierung/Verlinkung wird gesondert durch den
// nativen iOS-Simulator-Build (Abschnitt 10 des Audits) nachgewiesen; das
// tatsächliche Zeitverhalten auf echter Hardware braucht den iPhone-Retest
// (Abschnitt U). Fall A (Winkel-Sequenz bei gedrosselten ~1-Hz-Punkten) wird
// separat in twoCornerSequence.test.ts abgedeckt (dieselbe Geometrie-Pipeline,
// keine zweite Implementierung).
function throttledEmit(rawArrivalsMs: readonly number[], intervalMs: number): number[] {
  const emitted: number[] = [];
  let lastEmit: number | null = null;
  for (const t of rawArrivalsMs) {
    if (lastEmit == null || t - lastEmit >= intervalMs) {
      emitted.push(t);
      lastEmit = t;
    }
  }
  return emitted;
}

// 5 Hz über 5 s: 0,200,400,…,4800 ms (25 Rohankünfte).
function fiveHzArrivals(durationMs: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < durationMs; t += 200) out.push(t);
  return out;
}

describe('Fall C — erster Fix sofort', () => {
  it('der allererste Rohfix wird immer sofort emittiert, unabhängig von intervalMs', () => {
    const arrivals = fiveHzArrivals(5000);
    const emitted = throttledEmit(arrivals, 1000);
    expect(emitted[0]).toBe(arrivals[0]);
  });
});

describe('Fall D — nach 1 s Pause der nächste Fix', () => {
  it('Rohfixe innerhalb von < intervalMs nach dem letzten Emit werden übersprungen, der nächste NACH Ablauf kommt durch', () => {
    // Emit bei 0. Bei 200/400/600/800 jeweils < 1000ms seit letztem Emit → skip.
    // Bei 1000 sind exakt 1000ms vergangen → emittiert.
    const emitted = throttledEmit([0, 200, 400, 600, 800, 1000], 1000);
    expect(emitted).toEqual([0, 1000]);
  });
});

describe('Fall B — 4–5 Hz Rohfixe, aber nur ~1 Hz erreicht "JS"', () => {
  it('bei intervalMs=1000 kommt über 5 s Laufzeit nur je 1 Emission pro Sekunde durch (nicht 25)', () => {
    const arrivals = fiveHzArrivals(5000);   // 25 Rohfixe (5 Hz)
    const emitted = throttledEmit(arrivals, 1000);
    expect(emitted.length).toBeLessThanOrEqual(6);   // ~5 Emissionen über 5 s, klar unter den 25 Rohfixen
    expect(emitted.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < emitted.length; i++) {
      expect(emitted[i] - emitted[i - 1]).toBeGreaterThanOrEqual(1000);
    }
  });
});

describe('Fall E — Burst-Flut erzeugt trotzdem nur EINE Emission', () => {
  it('20 Rohfixe innerhalb von 50 ms (pathologischer Burst) lösen nur 1 Emission aus, keine Flut in useTrackRecorder', () => {
    const burst: number[] = [];
    for (let i = 0; i < 20; i++) burst.push(i * 2.5);   // 0..47.5 ms, alle < 1000ms Abstand zueinander
    const emitted = throttledEmit(burst, 1000);
    expect(emitted).toEqual([0]);   // nur der allererste (Fall C), der Rest wird gedrosselt
  });

  it('ein Burst mitten in einer laufenden Sequenz fügt keine zusätzlichen Emissionen hinzu', () => {
    const arrivals = [0, 1000, 1000 + 5, 1000 + 10, 1000 + 15, 2000, 3000];
    const emitted = throttledEmit(arrivals, 1000);
    expect(emitted).toEqual([0, 1000, 2000, 3000]);   // die 3 Burst-Fixe bei ~1000ms werden übersprungen
  });
});

// Abschnitt 3 des Audits ("intervalMs ≈ 1000 ms sinnvoll?"): die Drosselung
// ändert NUR, wie oft ein Rohfix JS erreicht — die geometrische Auflösung der
// Winkel-/Suchlinien-Logik hängt ausschliesslich von MIN_STEP_M=2.0 m
// (useTrackRecorder.ts) bzw. MIN_SEGMENT=1.5 m (useSearchRecorder.ts) ab,
// NICHT von der Fix-Rate — siehe twoCornerSequence.test.ts (Fall A), das mit
// genau dieser ~1-Hz-Punktdichte beide Winkel deterministisch erkennt. 1 Hz
// ist für normales Gehtempo (~1–1.5 m/s) ausreichend ("höchstens ungefähr
// 1 Hz" reicht der bestehenden Logik); eine adaptive Sampling-Strategie ist
// nicht nötig (siehe Abschlussbericht, Abschnitt D).
