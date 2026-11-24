import {
  mergeDogTrackSettings, normalizeDogTrackSettings, readRunIndication, runIndication, hapticsEnabled, voiceEnabled,
} from '../model';
import { dogTrackSettingsSummary } from '../summary';

describe('Fährten-Einstellungen je Hund — Modell', () => {
  it('liest gültige Felder und verwirft ungültige, ohne etwas zu erfinden', () => {
    expect(normalizeDogTrackSettings({ version: 1, indication: 'down', handlerDistanceM: 10, examTemplate: 'ifh1', layReminderMin: 60, haptics: false, voice: true }))
      .toEqual({ indication: 'down', handlerDistanceM: 10, examTemplate: 'ifh1', layReminderMin: 60, haptics: false, voice: true });
    expect(normalizeDogTrackSettings({ indication: 'bark', handlerDistanceM: 7, examTemplate: 'xyz', layReminderMin: 45, haptics: 'no' })).toEqual({});
    expect(normalizeDogTrackSettings({ examTemplate: null, layReminderMin: null })).toEqual({ examTemplate: null, layReminderMin: null });
    for (const v of [null, undefined, 'x', [], 3]) expect(normalizeDogTrackSettings(v)).toEqual({});
  });

  it('Verbellen ist nie eine gültige Anzeige', () => {
    expect(normalizeDogTrackSettings({ indication: 'bark' }).indication).toBeUndefined();
    expect(readRunIndication({ indication: { version: 1, value: 'bark', source: 'dog_profile' } })).toBeNull();
  });

  it('Speichern behält unbekannte Felder einer neueren App und entfernt nur ausdrücklich gelöschte', () => {
    const next = mergeDogTrackSettings({ version: 1, futureField: { a: 1 }, indication: 'sit', voice: false }, { indication: undefined, haptics: false });
    expect(next).toEqual({ version: 1, futureField: { a: 1 }, voice: false, haptics: false });
    expect(mergeDogTrackSettings(null, { indication: 'stand' })).toEqual({ version: 1, indication: 'stand' });
  });

  it('ohne Einstellung bleiben Vibration und Sprachansagen an (bisheriges Verhalten)', () => {
    expect(hapticsEnabled({})).toBe(true);
    expect(voiceEnabled({})).toBe(true);
    expect(hapticsEnabled({ haptics: false })).toBe(false);
    expect(voiceEnabled({ voice: false })).toBe(false);
  });

  it('Vermerk im Ergebnis nur mit gesetzter Anzeige; Altdaten ohne Vermerk bleiben gültig', () => {
    expect(runIndication({})).toBeUndefined();
    expect(runIndication({ indication: 'retrieve' })).toEqual({ version: 1, value: 'retrieve', source: 'dog_profile' });
    expect(readRunIndication({ indication: { version: 1, value: 'retrieve', source: 'dog_profile' } })).toBe('retrieve');
    expect(readRunIndication({ articles_found: 2 })).toBeNull();
    expect(readRunIndication(null)).toBeNull();
    expect(readRunIndication({ indication: { version: 2, value: 'down' } })).toBeNull();
  });

  it('Kurzübersicht fürs Hundeprofil', () => {
    const t = (key: string, p?: Record<string, string | number>) => p ? `${key}:${JSON.stringify(p)}` : key;
    expect(dogTrackSettingsSummary({}, t as never)).toBe('track.settings.summaryEmpty');
    expect(dogTrackSettingsSummary({ indication: 'down', handlerDistanceM: 10, examTemplate: 'igp3', layReminderMin: 30 }, t as never))
      .toBe('track.settings.indication.down · 10 m · IGP-3 · track.settings.summaryReminder:{"minutes":30}');
  });
});
