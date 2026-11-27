import AsyncStorage from '@react-native-async-storage/async-storage';
import { readFileSync } from 'fs';
import {
  OTA_START_DIAGNOSIS_KEY, START_DIAGNOSIS_TEXT_KEYS, addLateInfo, diagnosisFromResult, formatStartDiagnosis,
  loadStartDiagnosis, saveStartDiagnosis, type StartDiagnosis,
} from '@/lib/otaStartDiagnosis';
import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as itLocale } from '@/i18n/locales/it';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

// Lokale Zeit (nicht UTC): Die Anzeige zeigt die Gerätezeit, der Test muss in jeder Zeitzone gleich laufen (CI = UTC).
const AT = new Date(2026, 10, 26, 7, 0).getTime();
// Einfache Übersetzung für die Formatprüfung: deutsche Texte mit {param}-Ersetzung.
const t = (key: string, params?: Record<string, string | number>) =>
  (deCH as Record<string, string>)[key].replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ''));

beforeEach(async () => { await AsyncStorage.clear(); });

describe('Speicher (nur letzter Eintrag)', () => {
  it('speichert und liest; ein neuer Eintrag ersetzt den alten', async () => {
    await saveStartDiagnosis({ v: 1, at: AT, reason: 'no_update', ms: 900 });
    await saveStartDiagnosis({ v: 1, at: AT + 1, reason: 'check_timeout', ms: 1500 });
    expect(await loadStartDiagnosis()).toEqual({ v: 1, at: AT + 1, reason: 'check_timeout', ms: 1500 });
    expect((await AsyncStorage.getAllKeys()).filter(k => k.includes('ota_startcheck'))).toEqual([OTA_START_DIAGNOSIS_KEY]);
  });

  it('restarted nach reloaded → reloaded_ok (Befund bleibt); weitere Neustarts überschreiben ihn nicht', async () => {
    await saveStartDiagnosis({ v: 1, at: AT, reason: 'reloaded', ms: 2400 });
    await saveStartDiagnosis({ v: 1, at: AT + 5, reason: 'restarted' });
    expect(await loadStartDiagnosis()).toEqual({ v: 1, at: AT, reason: 'reloaded_ok', ms: 2400 });
    await saveStartDiagnosis({ v: 1, at: AT + 9, reason: 'restarted' });
    expect(await loadStartDiagnosis()).toMatchObject({ reason: 'reloaded_ok', at: AT });
  });

  it('restarted ohne vorheriges reloaded wird normal gespeichert', async () => {
    await saveStartDiagnosis({ v: 1, at: AT, reason: 'no_update' });
    await saveStartDiagnosis({ v: 1, at: AT + 5, reason: 'restarted' });
    expect(await loadStartDiagnosis()).toMatchObject({ reason: 'restarted' });
  });

  it('addLateInfo ergänzt nur denselben Eintrag', async () => {
    await saveStartDiagnosis({ v: 1, at: AT, reason: 'check_timeout' });
    await addLateInfo(AT - 1, { phase: 'ready', afterMs: 4000 });
    expect((await loadStartDiagnosis())?.late).toBeUndefined();
    await addLateInfo(AT, { phase: 'ready', afterMs: 4000 });
    expect((await loadStartDiagnosis())?.late).toEqual({ phase: 'ready', afterMs: 4000 });
  });

  it('ignoriert kaputte oder fremde Einträge', async () => {
    await AsyncStorage.setItem(OTA_START_DIAGNOSIS_KEY, '{kaputt');
    expect(await loadStartDiagnosis()).toBeNull();
    await AsyncStorage.setItem(OTA_START_DIAGNOSIS_KEY, JSON.stringify({ v: 1, at: AT, reason: 'unbekannt' }));
    expect(await loadStartDiagnosis()).toBeNull();
    await AsyncStorage.setItem(OTA_START_DIAGNOSIS_KEY, JSON.stringify({ v: 1, at: AT, reason: 'protected', protect: 'x' }));
    expect(await loadStartDiagnosis()).toBeNull();
  });

  it('diagnosisFromResult übernimmt Grund, Schutz, Detail und Dauer', () => {
    expect(diagnosisFromResult({ outcome: 'continue', reason: 'protected', protection: { reason: 'pending_buffer', detail: '1×cancelled·12d' }, elapsedMs: 40 }, AT))
      .toEqual({ v: 1, at: AT, reason: 'protected', protect: 'pending_buffer', detail: '1×cancelled·12d', ms: 40 });
    expect(diagnosisFromResult({ outcome: 'reload', reason: 'reloaded', elapsedMs: 2000 }, AT))
      .toEqual({ v: 1, at: AT, reason: 'reloaded', ms: 2000 });
  });
});

describe('Anzeige im Profil', () => {
  it('Aufnahme-Schutz mit Puffer', () => {
    const d: StartDiagnosis = { v: 1, at: AT, reason: 'protected', protect: 'pending_buffer', detail: '1×cancelled·12d', ms: 35 };
    const out = formatStartDiagnosis(d, t as never, 'de-CH');
    expect(out.line).toMatch(/^Letzte Startprüfung: 26\.11\.,? 0?7:00 · übersprungen \(Aufnahme-Schutz: gespeicherter Fährten-Puffer\)$/);
    expect(out.detail).toBe('1×cancelled·12d · 35 ms');
  });

  it('Zeitüberschreitung mit spätem Ausgang', () => {
    const d: StartDiagnosis = { v: 1, at: AT, reason: 'check_timeout', ms: 1500, late: { phase: 'ready', afterMs: 4260 } };
    expect(formatStartDiagnosis(d, t as never, 'de-CH').line)
      .toMatch(/übersprungen \(nach 1,5 s noch keine Antwort\) · Update nach 4[.,]3 s fertig geladen$/);
  });

  it('erfolgreicher Neustart ohne Detail', () => {
    const out = formatStartDiagnosis({ v: 1, at: AT, reason: 'reloaded_ok' }, t as never, 'de-CH');
    expect(out.line).toContain('Update geladen und neu gestartet');
    expect(out.detail).toBeNull();
  });

  it.each([deCH, gswCH, en, fr, itLocale])('hat alle Texte in jeder Sprache', locale => {
    for (const key of START_DIAGNOSIS_TEXT_KEYS) expect((locale as Record<string, string | undefined>)[key]).toBeTruthy();
  });

  it('Profil zeigt die Zeile im Versionsblock', () => {
    const profile = readFileSync('app/(tabs)/profile.tsx', 'utf8');
    expect(profile).toContain('loadStartDiagnosis()');
    expect(profile).toContain('testID="profile-start-check"');
  });
});
