import {
  type ActiveFaehrte, type ActiveFaehrtenMap,
  isOpenStatus, isValidEntry, upsertEntry, removeEntry, sanitizeMap,
  reconcileWithDogs, sortActive, faehrteElapsedSeconds, reopenTarget, statusLabel,
  hasActiveFaehrte, startDecision, statusTone, gpsQualityLabel, fmtClockOfDay, weatherLine,
} from '@/features/tracking/store/activeFaehrtenModel';

const entry = (dogId: string, over: Partial<ActiveFaehrte> = {}): ActiveFaehrte => ({
  dogId, sessionId: null, runId: null, status: 'resting',
  startedAt: null, layStartedAt: 1000, searchStartedAt: null, distanceMeters: 0,
  winkelCount: 0, objektCount: 0, gpsAccuracy: null, weather: null, updatedAt: 1000, ...over,
});

describe('Registry: offene Status', () => {
  it('laying/laid/resting/searching sind offen, completed/cancelled nicht', () => {
    expect(isOpenStatus('laying')).toBe(true);
    expect(isOpenStatus('resting')).toBe(true);
    expect(isOpenStatus('searching')).toBe(true);
    expect(isOpenStatus('completed')).toBe(false);
    expect(isOpenStatus('cancelled')).toBe(false);
    expect(isOpenStatus(null)).toBe(false);
  });
});

describe('Registry: dog_id als einziger Schlüssel (mehrere Hunde gleichzeitig)', () => {
  it('mehrere Hunde können GLEICHZEITIG eine offene Fährte haben', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'max',  { status: 'resting', layStartedAt: 100 });
    m = upsertEntry(m, 'luna', { status: 'searching', searchStartedAt: 200 });
    expect(Object.keys(m).sort()).toEqual(['luna', 'max']);
    expect(m.max.status).toBe('resting');
    expect(m.luna.status).toBe('searching');
  });
  it('neue Fährte für Luna verändert Max NICHT (Wurzel des alten Bugs)', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'max', { status: 'resting', layStartedAt: 100, distanceMeters: 420 });
    const maxBefore = m.max;
    m = upsertEntry(m, 'luna', { status: 'laying' });
    expect(m.max).toBe(maxBefore);          // Referenz unverändert
    expect(m.max.distanceMeters).toBe(420);
  });
  it('Patch mergt, ohne bestehende Felder zu verlieren', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'max', { status: 'laying', distanceMeters: 300, winkelCount: 4 });
    m = upsertEntry(m, 'max', { status: 'resting', layStartedAt: 500 });
    expect(m.max.distanceMeters).toBe(300);
    expect(m.max.winkelCount).toBe(4);
    expect(m.max.status).toBe('resting');
    expect(m.max.layStartedAt).toBe(500);
  });
  it('completed/cancelled entfernt den Eintrag (max. eine offene Fährte pro Hund)', () => {
    let m: ActiveFaehrtenMap = { max: entry('max') };
    m = upsertEntry(m, 'max', { status: 'completed' });
    expect(m.max).toBeUndefined();
    m = upsertEntry({ max: entry('max') }, 'max', { status: 'cancelled' });
    expect(m.max).toBeUndefined();
  });
  it('leere dogId wird ignoriert', () => {
    const m = upsertEntry({}, '', { status: 'resting' });
    expect(Object.keys(m)).toHaveLength(0);
  });
});

describe('Regeln „Aktive Fährten" (verbindlich)', () => {
  it('Regel 2/4: gleicher Hund kann KEINE zweite aktive Fährte starten', () => {
    const m = upsertEntry({}, 'malu', { status: 'resting', layStartedAt: 1 });
    expect(hasActiveFaehrte(m, 'malu')).toBe(true);
    expect(startDecision(m, 'malu')).toBe('conflict');   // → Dialog, keine zweite
  });

  it('Regel 3: ZWEI Hunde besitzen gleichzeitig aktive Fährten', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'malu',    { status: 'resting' });
    m = upsertEntry(m, 'bazooka', { status: 'resting' });
    expect(hasActiveFaehrte(m, 'malu')).toBe(true);
    expect(hasActiveFaehrte(m, 'bazooka')).toBe(true);
    expect(Object.keys(m)).toHaveLength(2);
  });

  it('Regel 3: DREI Hunde gleichzeitig (resting/searching/laying)', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'malu',    { status: 'resting' });
    m = upsertEntry(m, 'bazooka', { status: 'searching', searchStartedAt: 1 });
    m = upsertEntry(m, 'luna',    { status: 'laying' });
    expect(['malu', 'bazooka', 'luna'].every(d => hasActiveFaehrte(m, d))).toBe(true);
    expect(Object.keys(m)).toHaveLength(3);
  });

  it('Regel 5: Hundwechsel + neue Fährte verändert fremde Fährte NICHT', () => {
    let m: ActiveFaehrtenMap = {};
    m = upsertEntry(m, 'malu', { status: 'resting', layStartedAt: 111, distanceMeters: 500 });
    const maluBefore = m.malu;
    // Wechsel zu Bazooka + neue Fährte
    m = upsertEntry(m, 'bazooka', { status: 'laying' });
    expect(m.malu).toBe(maluBefore);         // identische Referenz → unverändert
    expect(m.malu.layStartedAt).toBe(111);
    expect(m.malu.distanceMeters).toBe(500);
  });

  it('Regel 8: completed erlaubt eine neue Fährte', () => {
    let m = upsertEntry({}, 'malu', { status: 'resting' });
    m = upsertEntry(m, 'malu', { status: 'completed' });   // Abschluss → aus Registry
    expect(hasActiveFaehrte(m, 'malu')).toBe(false);
    expect(startDecision(m, 'malu')).toBe('start');
  });

  it('Regel 2: cancelled erlaubt eine neue Fährte', () => {
    let m = upsertEntry({}, 'malu', { status: 'searching', searchStartedAt: 1 });
    m = upsertEntry(m, 'malu', { status: 'cancelled' });
    expect(hasActiveFaehrte(m, 'malu')).toBe(false);
    expect(startDecision(m, 'malu')).toBe('start');
  });

  it('Regel 4: Dialog-Entscheidung ist „conflict" NUR bei offener Fährte', () => {
    expect(startDecision({}, 'malu')).toBe('start');                 // keine → direkt starten
    expect(startDecision({}, null)).toBe('start');                  // ohne Hund → kein Konflikt
    const m = upsertEntry({}, 'malu', { status: 'laying' });
    expect(startDecision(m, 'malu')).toBe('conflict');
  });

  it('Regel 7: Sortierung recording (laying) → searching → resting', () => {
    const list = [
      entry('a', { status: 'resting',   updatedAt: 50 }),
      entry('b', { status: 'searching', updatedAt: 40 }),
      entry('c', { status: 'laying',    updatedAt: 30 }),
    ];
    expect(sortActive(list).map(e => e.status)).toEqual(['laying', 'searching', 'resting']);
  });
});

describe('UX-Erweiterung: Status-Badge, GPS-Qualität, Wetter-Snapshot', () => {
  it('Status-Ton: recording/searching/resting/completed', () => {
    expect(statusTone('laying')).toBe('recording');
    expect(statusTone('searching')).toBe('searching');
    expect(statusTone('resting')).toBe('resting');
    expect(statusTone('completed')).toBe('completed');
  });
  it('Status-Label: recording = „Aufnahme läuft"', () => {
    expect(statusLabel('laying')).toBe('Aufnahme läuft');
    expect(statusLabel('searching')).toBe('Suche läuft');
    expect(statusLabel('resting')).toBe('Fährte liegt');
    expect(statusLabel('completed')).toBe('Abgeschlossen');
  });
  it('GPS-Qualität aus vorhandener Genauigkeit (m)', () => {
    expect(gpsQualityLabel(2)).toBe('Sehr gut');
    expect(gpsQualityLabel(6)).toBe('Gut');
    expect(gpsQualityLabel(12)).toBe('Mittel');
    expect(gpsQualityLabel(30)).toBe('Schlecht');
  });
  it('GPS ohne Daten → „—" (nicht „Schlecht")', () => {
    expect(gpsQualityLabel(null)).toBe('—');
    expect(gpsQualityLabel(undefined)).toBe('—');
  });
  it('recording-Elapsed nutzt startedAt', () => {
    const e = entry('max', { status: 'laying', startedAt: 1_000_000, layStartedAt: null });
    expect(faehrteElapsedSeconds(e, 1_000_000 + 90_000)).toBe(90);
  });
  it('Start-Uhrzeit HH:MM', () => {
    const d = new Date(2026, 0, 1, 9, 12, 0).getTime();
    expect(fmtClockOfDay(d)).toBe('09:12');
    expect(fmtClockOfDay(null)).toBe('—');
  });
  it('Wetterzeile aus Snapshot; offline (null) → keine Zeile', () => {
    expect(weatherLine({ temperature: 18, windSpeed: 7, humidity: 60, condition: 'Bewölkt' }))
      .toBe('18°C · Wind 7 km/h · Bewölkt');
    expect(weatherLine(null)).toBeNull();
    expect(weatherLine({ temperature: null, windSpeed: null, humidity: null, condition: null })).toBeNull();
  });
  it('Wetter-Snapshot bleibt beim Statuswechsel laying→resting erhalten (Merge)', () => {
    let m = upsertEntry({}, 'max', { status: 'laying', startedAt: 1, weather: { temperature: 18, windSpeed: 7, humidity: 60, condition: 'Bewölkt' } });
    m = upsertEntry(m, 'max', { status: 'resting', layStartedAt: 100 });
    expect(m.max.weather?.temperature).toBe(18);   // nicht verloren
    expect(m.max.startedAt).toBe(1);
  });
  it('gpsAccuracy lässt sich explizit auf null zurücksetzen', () => {
    let m = upsertEntry({}, 'max', { status: 'laying', gpsAccuracy: 5 });
    expect(m.max.gpsAccuracy).toBe(5);
    m = upsertEntry(m, 'max', { gpsAccuracy: null });
    expect(m.max.gpsAccuracy).toBeNull();
  });
});

describe('Registry: remove + sanitize + reconcile', () => {
  it('remove entfernt gezielt einen Hund', () => {
    const m = removeEntry({ max: entry('max'), luna: entry('luna') }, 'max');
    expect(m.max).toBeUndefined();
    expect(m.luna).toBeDefined();
  });
  it('sanitizeMap verwirft ungültige/fremde Einträge', () => {
    const raw = {
      max: entry('max'),
      bad1: entry('other'),            // dogId ≠ Schlüssel
      bad2: { ...entry('bad2'), status: 'completed' },  // nicht offen
      bad3: null,
    };
    const clean = sanitizeMap(raw);
    expect(Object.keys(clean)).toEqual(['max']);
  });
  it('sanitizeMap toleriert kaputte Eingaben', () => {
    expect(sanitizeMap(null)).toEqual({});
    expect(sanitizeMap('nonsense')).toEqual({});
    expect(sanitizeMap(42)).toEqual({});
  });
  it('reconcileWithDogs entfernt Fährten gelöschter Hunde (keine Geister)', () => {
    const m = { max: entry('max'), luna: entry('luna') };
    const clean = reconcileWithDogs(m, ['max']);
    expect(Object.keys(clean)).toEqual(['max']);
  });
});

describe('Registry: Sortierung + Anzeigehelfer', () => {
  it('Absuche vor Liegen vor Legen, dann neueste zuerst', () => {
    const list = [
      entry('a', { status: 'laid', updatedAt: 10 }),
      entry('b', { status: 'searching', updatedAt: 5 }),
      entry('c', { status: 'resting', updatedAt: 20 }),
      entry('d', { status: 'resting', updatedAt: 30 }),
    ];
    expect(sortActive(list).map(e => e.dogId)).toEqual(['b', 'd', 'c', 'a']);
  });
  it('Liegezeit zeitstempelbasiert (kein laufender Timer)', () => {
    const e = entry('max', { status: 'resting', layStartedAt: 1_000_000 });
    expect(faehrteElapsedSeconds(e, 1_000_000 + 42_000)).toBe(42);
    expect(faehrteElapsedSeconds(e, 500_000)).toBe(0);   // nie negativ
  });
  it('Absuche nutzt searchStartedAt', () => {
    const e = entry('max', { status: 'searching', searchStartedAt: 2_000_000, layStartedAt: 1 });
    expect(faehrteElapsedSeconds(e, 2_000_000 + 60_000)).toBe(60);
  });
  it('statusLabel liefert deutsche Kurzlabels', () => {
    expect(statusLabel('resting')).toBe('Fährte liegt');
    expect(statusLabel('searching')).toBe('Suche läuft');
  });
});

describe('Registry: Wiederöffnen (reopenTarget) — immer mit dogId', () => {
  it('resting → Liegen-Screen mit dogId + id', () => {
    expect(reopenTarget(entry('max', { status: 'resting', sessionId: 'S1' })))
      .toBe('/track/liegen?dogId=max&id=S1');
  });
  it('searching → Run-Screen', () => {
    expect(reopenTarget(entry('max', { status: 'searching', sessionId: 'S2' })))
      .toBe('/track/run?dogId=max&id=S2');
  });
  it('offline ohne sessionId bleibt gültig (nur dogId)', () => {
    expect(reopenTarget(entry('max', { status: 'resting', sessionId: null })))
      .toBe('/track/liegen?dogId=max');
  });
});
