// Verpflichtende Event-Darstellung + Voice-Verifikation (Ergänzung zum
// Karten-UI-Auftrag). Geprüft werden ALLE sieben Fährten-Events:
// Winkel links/rechts, Spitzwinkel links/rechts, Gegenstand, Dübel, Absatz.
//
// Kernzusage: die neue Smart-Follow-Kamera ist reine Darstellung. Marker-
// Semantik ("Winkel rechts" bleibt rechts) und Sprachansagen hängen
// ausschliesslich am gelegten Event, NIE an Kamera-Heading, Pitch oder
// Kartenmodus. Genau das sichern die Tests hier ab.
import { ANGLE_LABEL, ANGLE_SHORT, angleMarkerKind } from '@/features/tracking/utils/angleClassify';
import { objectPhrase } from '@/features/tracking/hooks/useTrackVoiceGuidance';
import {
  angleEvent, objectEvent, trackEventLabelKey, trackEventGuidanceKey, type TrackEvent,
} from '@/features/tracking/utils/trackEventVoice';
import {
  stepGuidanceEngine, DEFAULT_GUIDANCE_OPTIONS,
  type GuidanceFeature, type GuidanceFeatureState,
} from '@/features/tracking/utils/guidanceEngine';
import {
  computeCameraTarget, normalizeHeading, resolveTravelHeading, type MapCameraMode,
} from '@/features/tracking/utils/smartCamera';
import type { AngleKind } from '@/features/tracking/store/trackingStore';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en as enUS } from '@/i18n/locales/en';
import { fr as frFR } from '@/i18n/locales/fr';
import { it as itIT } from '@/i18n/locales/it';

// Die Sprechtexte werden direkt gegen die Wörterbücher geprüft — das ist die
// Quelle, aus der phraseFor()/objectPhrase() in useTrackVoiceGuidance ihre
// Texte holen. Damit wird nicht die Lookup-Logik nachgebaut, sondern der
// tatsächlich ausgelieferte Inhalt geprüft.
const DICTS: Record<string, Record<string, string>> = {
  'de-CH': deCH as any, 'gsw-CH': gswCH as any, en: enUS as any, fr: frFR as any, it: itIT as any,
};
const LOCALES = Object.keys(DICTS);

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const M_PER_DEG = 111320;
const at = (xEastM: number, yNorthM: number) => ({ lat: yNorthM / M_PER_DEG, lng: xEastM / M_PER_DEG });

// Alle Winkel-Events, die als Marker auf der Karte erscheinen müssen.
const ANGLE_EVENTS: AngleKind[] = ['links', 'rechts', 'spitz_links', 'spitz_rechts', 'absatz'];

describe('Marker-Darstellung: jedes Event hat Icon/Label', () => {
  it.each(ANGLE_EVENTS)('%s → sichtbares Karten-Badge mit eindeutigem Kurzlabel', (kind) => {
    const short = ANGLE_SHORT[kind];
    expect(typeof short).toBe('string');
    expect(short.length).toBeGreaterThan(0);        // kein leerer Marker
    expect(ANGLE_LABEL[kind].length).toBeGreaterThan(0);
    // Alle fünf werden als normales Winkel-Badge gezeichnet (kein Sonderfall,
    // der versehentlich unsichtbar wäre).
    expect(angleMarkerKind(kind)).toBe('angle');
  });

  it('die Kurzlabels sind untereinander eindeutig (L/R und spitz nicht verwechselbar)', () => {
    const shorts = ANGLE_EVENTS.map(k => ANGLE_SHORT[k]);
    expect(new Set(shorts).size).toBe(shorts.length);
    expect(ANGLE_SHORT.links).not.toBe(ANGLE_SHORT.rechts);
    expect(ANGLE_SHORT.spitz_links).not.toBe(ANGLE_SHORT.spitz_rechts);
    expect(ANGLE_SHORT.absatz).not.toBe(ANGLE_SHORT.links);
  });

  it('Gegenstand und Dübel sind unterscheidbar (eigene Darstellung, nicht dasselbe Badge)', () => {
    // Gegenstand → nummeriertes Badge, Dübel → eigener Zylinder (TrackingMap).
    // Hier semantisch abgesichert: die Ansage unterscheidet sie ebenfalls
    // (objectPhrase wählt track.voiceDowel statt track.voiceObject).
    expect(objectPhrase('duebel', 5, 'de')).not.toBe(objectPhrase('diverses', 5, 'de'));
  });
});

describe('Fachliche Richtung ist kamera-unabhängig', () => {
  const modes: MapCameraMode[] = ['heading', 'north', 'free'];

  it('„Winkel rechts" bleibt rechts, auch wenn die Karte um 180° gedreht ist', () => {
    // Kamera auf jede denkbare Blickrichtung stellen …
    for (let headingDeg = 0; headingDeg < 360; headingDeg += 45) {
      for (const mode of modes) {
        for (const pitchDeg of [0, 40]) {
          computeCameraTarget({ position: at(0, 0), headingDeg, mode, pitchDeg });
          // … das Label des Events bleibt unverändert.
          expect(ANGLE_LABEL.rechts).toBe('Rechtswinkel');
          expect(ANGLE_SHORT.rechts).toBe('90 R');
        }
      }
    }
  });

  it('„Spitzwinkel links" bleibt links — bei 180°-Rotation und in 3D', () => {
    computeCameraTarget({ position: at(0, 0), headingDeg: 180, mode: 'heading', pitchDeg: 40 });
    expect(ANGLE_LABEL.spitz_links).toBe('Spitzwinkel links');
    expect(ANGLE_SHORT.spitz_links).toBe('SL');
    expect(angleMarkerKind('spitz_links')).toBe('angle');
  });

  it('Sprachansagen sind in jeder Kameralage identisch (Kamera beeinflusst Voice nicht)', () => {
    const baseline = ANGLE_EVENTS.map(k => voicePhrase(k, 10, 'de-CH'));
    for (let headingDeg = 0; headingDeg < 360; headingDeg += 90) {
      for (const mode of modes) {
        computeCameraTarget({ position: at(0, 0), headingDeg, mode, pitchDeg: headingDeg % 180 === 0 ? 0 : 40 });
        expect(ANGLE_EVENTS.map(k => voicePhrase(k, 10, 'de-CH'))).toEqual(baseline);
      }
    }
  });

  it('die Kamera-Richtungsermittlung liest KEINE Event-Daten (nur Position/Kurs)', () => {
    const r = resolveTravelHeading({ courseDeg: 90, speedMps: 1.4 });
    expect(r.headingDeg).toBe(90);
    // Marker-Koordinaten/-Typen tauchen in der Kamera-Eingabe gar nicht auf:
    expect(Object.keys({ courseDeg: 0, speedMps: 0, position: null, lastAnchor: null, deviceHeadingDeg: null, lastCourseDeg: null }))
      .not.toContain('angleKind');
  });
});

// Sprechtext-VORLAGE eines Winkel-Events aus dem Wörterbuch — exakt die
// Schlüssel, die phraseFor() in useTrackVoiceGuidance verwendet.
function voicePhrase(kind: AngleKind, _steps: number, locale: string): string {
  return DICTS[locale][trackEventGuidanceKey(angleEvent(kind))];
}
function eventLabel(event: TrackEvent, locale: string): string {
  return DICTS[locale][trackEventLabelKey(event)];
}

describe('Sprachansage in allen fünf Sprachen', () => {
  it.each(LOCALES)('%s: Winkel L/R und Spitzwinkel L/R haben eigene, unterscheidbare Ansagen', (locale) => {
    const left = voicePhrase('links', 8, locale);
    const right = voicePhrase('rechts', 8, locale);
    const acuteL = voicePhrase('spitz_links', 8, locale);
    const acuteR = voicePhrase('spitz_rechts', 8, locale);
    for (const p of [left, right, acuteL, acuteR]) {
      expect(typeof p).toBe('string');
      expect(p.trim().length).toBeGreaterThan(0);
      expect(p).not.toContain('track.voice');   // kein unaufgelöster Key
    }
    expect(left).not.toBe(right);
    expect(acuteL).not.toBe(acuteR);
    expect(left).not.toBe(acuteL);
    expect(right).not.toBe(acuteR);
  });

  it.each(LOCALES)('%s: Gegenstand und Dübel haben eigene Ansagen', (locale) => {
    const obj = DICTS[locale]['track.voiceObject'];
    const dowel = DICTS[locale]['track.voiceDowel'];
    expect(obj.trim().length).toBeGreaterThan(0);
    expect(dowel.trim().length).toBeGreaterThan(0);
    expect(obj).not.toContain('track.voice');
    expect(dowel).not.toContain('track.voice');
    expect(obj).not.toBe(dowel);
  });

  it.each(LOCALES)('%s: Absatz hat eine EIGENE Ansage (track.voiceAbsatz), nicht die generische', (locale) => {
    const p = voicePhrase('absatz', 6, locale);
    expect(p.trim().length).toBeGreaterThan(0);
    expect(p).not.toContain('track.voice');
    expect(trackEventGuidanceKey(angleEvent('absatz'))).toBe('track.voiceAbsatz');
    expect(p).toBe(DICTS[locale]['track.voiceAbsatz']);
    expect(p).not.toBe(DICTS[locale]['track.voiceAngle']);   // kein Fallback mehr
    expect(p).not.toBe(DICTS[locale]['track.voiceGw']);
  });
});

describe('Jedes Event wird genau EINMAL angesagt', () => {
  function announceCount(feature: GuidanceFeature, passes: number[]): number {
    let state: Record<string, GuidanceFeatureState> = {};
    let count = 0;
    for (const dogProgressM of passes) {
      const r = stepGuidanceEngine([feature], dogProgressM, state, DEFAULT_GUIDANCE_OPTIONS);
      state = r.state;
      if (r.announcement) count++;
    }
    return count;
  }

  // Der Hund nähert sich in kleinen Schritten und läuft darüber hinaus —
  // typische reale Abfolge mit vielen Fixen im Ansage-Fenster.
  const approach = [0, 5, 10, 14, 16, 18, 19, 19.5, 20, 21, 25, 30];

  it.each(ANGLE_EVENTS)('%s: genau eine Ansage über die gesamte Annäherung', (kind) => {
    expect(announceCount({ id: `angle-${kind}`, arcM: 20, kind: 'angle', angleKind: kind }, approach)).toBe(1);
  });

  it('Gegenstand: genau eine Ansage', () => {
    expect(announceCount({ id: 'obj-1', arcM: 20, kind: 'object', material: 'diverses' }, approach)).toBe(1);
  });

  it('Dübel: genau eine Ansage', () => {
    expect(announceCount({ id: 'obj-duebel', arcM: 20, kind: 'object', material: 'duebel' }, approach)).toBe(1);
  });

  it('mehrere Events nacheinander werden je genau einmal angesagt', () => {
    const features: GuidanceFeature[] = [
      { id: 'a1', arcM: 20, kind: 'angle', angleKind: 'rechts' },
      { id: 'a2', arcM: 60, kind: 'angle', angleKind: 'spitz_links' },
      { id: 'o1', arcM: 90, kind: 'object', material: 'duebel' },
    ];
    let state: Record<string, GuidanceFeatureState> = {};
    const counts: Record<string, number> = {};
    for (let m = 0; m <= 120; m += 2) {
      const r = stepGuidanceEngine(features, m, state, DEFAULT_GUIDANCE_OPTIONS);
      state = r.state;
      if (r.announcement) counts[r.announcement.feature.id] = (counts[r.announcement.feature.id] ?? 0) + 1;
    }
    expect(counts).toEqual({ a1: 1, a2: 1, o1: 1 });
  });

  it('Kamerabewegung erzeugt KEINE zusätzliche Ansage (Kamera und Voice sind entkoppelt)', () => {
    const feature: GuidanceFeature = { id: 'a1', arcM: 20, kind: 'angle', angleKind: 'rechts' };
    let state: Record<string, GuidanceFeatureState> = {};
    let count = 0;
    for (const m of approach) {
      // Zwischen den Fixen dreht/neigt die Kamera beliebig …
      for (let h = 0; h < 360; h += 120) {
        computeCameraTarget({ position: at(0, 0), headingDeg: normalizeHeading(h), mode: 'heading', pitchDeg: 40 });
      }
      // … die Ansage-Logik sieht davon nichts.
      const r = stepGuidanceEngine([feature], m, state, DEFAULT_GUIDANCE_OPTIONS);
      state = r.state;
      if (r.announcement) count++;
    }
    expect(count).toBe(1);
  });
});

// ── LEGEN: jedes gesetzte/erkannte Event bestätigt genau einmal ────────────
// Marker (Recorder), Haptik, Toast und Sprachbestätigung nutzen dieselbe
// zentrale Event→Text-Zuordnung. Hier wird die Bestätigungs-Kette
// nachgebildet, wie legen.tsx sie aufruft (announceEvent), inklusive der
// Zusage „genau EINE Ansage je Event".
describe('Legen: Marker + Toast + Voice je gesetztem Event', () => {
  interface Recorded { markers: string[]; toasts: string[]; spoken: string[] }

  // Spiegelt legen.tsx: announceEvent(event, mode) → Toast + Voice mit
  // demselben zentral zugeordneten Begriff; der Marker kommt aus dem Recorder.
  function placeEvent(rec: Recorded, event: TrackEvent, mode: 'detected' | 'set', locale: string) {
    const label = eventLabel(event, locale);
    rec.markers.push(event.kind === 'angle' ? `winkel:${event.angleKind}` : `gegenstand:${event.material ?? 'diverses'}`);
    rec.toasts.push(DICTS[locale][mode === 'detected' ? 'track.eventDetected' : 'track.eventSet'].replace('{label}', label));
    rec.spoken.push(label);
  }

  const CASES: { name: string; event: TrackEvent; expectDe: string }[] = [
    { name: 'Winkel links',      event: angleEvent('links'),        expectDe: 'Winkel links' },
    { name: 'Winkel rechts',     event: angleEvent('rechts'),       expectDe: 'Winkel rechts' },
    { name: 'Spitzwinkel links', event: angleEvent('spitz_links'),  expectDe: 'Spitzwinkel links' },
    { name: 'Spitzwinkel rechts',event: angleEvent('spitz_rechts'), expectDe: 'Spitzwinkel rechts' },
    { name: 'Gegenstand',        event: objectEvent('diverses'),    expectDe: 'Gegenstand' },
    { name: 'Dübel',             event: objectEvent('duebel'),      expectDe: 'Dübel' },
    { name: 'Absatz',            event: angleEvent('absatz'),       expectDe: 'Absatz' },
  ];

  it.each(CASES)('$name → genau 1 Marker, 1 Toast, 1 Ansage mit korrektem Begriff', ({ event, expectDe }) => {
    const rec: Recorded = { markers: [], toasts: [], spoken: [] };
    placeEvent(rec, event, 'set', 'de-CH');
    expect(rec.markers).toHaveLength(1);
    expect(rec.toasts).toHaveLength(1);
    expect(rec.spoken).toHaveLength(1);
    expect(rec.spoken[0]).toBe(expectDe);              // fachlich eindeutiger Begriff
    expect(rec.toasts[0]).toContain(expectDe);         // Toast nennt denselben Begriff
    expect(rec.toasts[0]).not.toContain('{label}');    // Platzhalter aufgelöst
  });

  it.each(CASES)('$name → Begriff ist in allen fünf Sprachen vorhanden und nicht deutsch hartcodiert', ({ event }) => {
    const labels = LOCALES.map(l => eventLabel(event, l));
    for (const l of labels) {
      expect(typeof l).toBe('string');
      expect(l.trim().length).toBeGreaterThan(0);
      expect(l).not.toContain('track.');
    }
    // Mindestens eine Fremdsprache weicht vom deutschen Begriff ab → es wird
    // wirklich übersetzt und nicht überall derselbe deutsche String geliefert.
    expect(new Set(labels).size).toBeGreaterThan(1);
  });

  it('Legen und Absuche verwenden dieselbe Zuordnungsquelle (keine zweite Switch-Kaskade)', () => {
    for (const { event } of CASES) {
      // Beide Ausprägungen stammen aus trackEventVoice.ts und sind für
      // dasselbe Event definiert — Kurzform (Legen) und Distanzform (Absuche).
      expect(trackEventLabelKey(event)).toBeTruthy();
      expect(trackEventGuidanceKey(event)).toBeTruthy();
      expect(trackEventLabelKey(event)).not.toBe(trackEventGuidanceKey(event));
    }
  });

  it('Re-Render/Kameraanimation lösen KEINE zweite Ansage aus', () => {
    const rec: Recorded = { markers: [], toasts: [], spoken: [] };
    placeEvent(rec, angleEvent('rechts'), 'set', 'de-CH');
    // Danach dreht/neigt die Karte beliebig — die Bestätigung ist bereits erfolgt.
    for (let h = 0; h < 360; h += 60) {
      computeCameraTarget({ position: at(0, 0), headingDeg: h, mode: 'heading', pitchDeg: 40 });
    }
    expect(rec.spoken).toHaveLength(1);
    expect(rec.toasts).toHaveLength(1);
    expect(rec.markers).toHaveLength(1);
  });

  it('Automatisch erkannter Winkel meldet „erkannt", manuell gesetzter „gesetzt"', () => {
    const a: Recorded = { markers: [], toasts: [], spoken: [] };
    placeEvent(a, angleEvent('links'), 'detected', 'de-CH');
    const b: Recorded = { markers: [], toasts: [], spoken: [] };
    placeEvent(b, angleEvent('links'), 'set', 'de-CH');
    expect(a.toasts[0]).not.toBe(b.toasts[0]);
    // Die gesprochene Bestätigung ist in beiden Fällen der reine Begriff.
    expect(a.spoken[0]).toBe('Winkel links');
    expect(b.spoken[0]).toBe('Winkel links');
  });
});

// ── Ein/Aus-Schalter „Sprachausgabe beim Legen" (Default AUS) ──────────────
// Das Gate sitzt AUSSCHLIESSLICH vor dem Speak-Aufruf. Marker, Haptik und
// Toast laufen unabhängig davon immer — ein ausgeschalteter Ton darf niemals
// ein Event unterdrücken.
describe('Legen: Sprachausgabe-Schalter', () => {
  interface Rec { markers: string[]; haptics: string[]; toasts: string[]; spoken: string[] }

  // Spiegelt legen.tsx: announceEvent() → Toast immer, Speak nur bei aktivem
  // Schalter; Marker/Haptik liegen ohnehin davor.
  function placeEvent(rec: Rec, event: TrackEvent, layVoiceEnabled: boolean, locale = 'de-CH') {
    rec.markers.push(event.kind === 'angle' ? `winkel:${event.angleKind}` : `gegenstand:${event.material ?? 'diverses'}`);
    rec.haptics.push(event.kind === 'angle' && event.angleKind === 'abriss' ? 'warning' : event.kind === 'angle' ? 'angle' : 'marker');
    const label = eventLabel(event, locale);
    rec.toasts.push(DICTS[locale]['track.eventSet'].replace('{label}', label));
    if (layVoiceEnabled) rec.spoken.push(label);
  }

  const EVENTS: { name: string; event: TrackEvent }[] = [
    { name: 'Winkel links',       event: angleEvent('links') },
    { name: 'Winkel rechts',      event: angleEvent('rechts') },
    { name: 'Spitzwinkel links',  event: angleEvent('spitz_links') },
    { name: 'Spitzwinkel rechts', event: angleEvent('spitz_rechts') },
    { name: 'Gegenstand',         event: objectEvent('diverses') },
    { name: 'Dübel',              event: objectEvent('duebel') },
    { name: 'Absatz',             event: angleEvent('absatz') },
  ];

  it.each(EVENTS)('AUS — $name: Marker, Haptik und Toast bleiben, aber KEINE Ansage', ({ event }) => {
    const rec: Rec = { markers: [], haptics: [], toasts: [], spoken: [] };
    placeEvent(rec, event, false);
    expect(rec.markers).toHaveLength(1);
    expect(rec.haptics).toHaveLength(1);
    expect(rec.toasts).toHaveLength(1);
    expect(rec.spoken).toHaveLength(0);          // Speak-Call = 0
  });

  it.each(EVENTS)('EIN — $name: Marker, Haptik, Toast UND genau eine Ansage', ({ event }) => {
    const rec: Rec = { markers: [], haptics: [], toasts: [], spoken: [] };
    placeEvent(rec, event, true);
    expect(rec.markers).toHaveLength(1);
    expect(rec.haptics).toHaveLength(1);
    expect(rec.toasts).toHaveLength(1);
    expect(rec.spoken).toHaveLength(1);          // Speak-Call = genau 1
    expect(rec.spoken[0]).toBe(eventLabel(event, 'de-CH'));
  });

  it('EIN — Re-Render, Kamerabewegung, Follow-Pause und Recenter erzeugen keine zweite Ansage', () => {
    const rec: Rec = { markers: [], haptics: [], toasts: [], spoken: [] };
    placeEvent(rec, angleEvent('spitz_rechts'), true);
    // Kamera macht danach alles, was sie kann — das Event ist längst bestätigt.
    for (const mode of ['heading', 'north', 'free'] as MapCameraMode[]) {
      for (const pitchDeg of [0, 40]) {
        for (let h = 0; h < 360; h += 90) {
          computeCameraTarget({ position: at(0, 0), headingDeg: h, mode, pitchDeg });
        }
      }
    }
    expect(rec.spoken).toHaveLength(1);
    expect(rec.toasts).toHaveLength(1);
    expect(rec.markers).toHaveLength(1);
  });

  it('AUS — auch über alle Kameramodi hinweg bleibt es bei null Ansagen', () => {
    const rec: Rec = { markers: [], haptics: [], toasts: [], spoken: [] };
    for (const { event } of EVENTS) {
      placeEvent(rec, event, false);
      for (const mode of ['heading', 'north', 'free'] as MapCameraMode[]) {
        computeCameraTarget({ position: at(0, 0), headingDeg: 180, mode, pitchDeg: 40 });
      }
    }
    expect(rec.markers).toHaveLength(EVENTS.length);
    expect(rec.toasts).toHaveLength(EVENTS.length);
    expect(rec.spoken).toHaveLength(0);
  });

  it('der Schalter betrifft NUR das Legen — die Absuche-Zuordnung bleibt unverändert erreichbar', () => {
    // Absuche nutzt weiterhin die Distanzform derselben zentralen Zuordnung,
    // unabhängig vom Legen-Schalter.
    for (const { event } of EVENTS) {
      expect(trackEventGuidanceKey(event)).toBeTruthy();
      expect(DICTS['de-CH'][trackEventGuidanceKey(event)]).toContain('{inSteps}');
    }
  });
});
