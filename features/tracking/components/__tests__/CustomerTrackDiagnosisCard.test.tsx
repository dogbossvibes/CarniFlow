// Kunden-Fährtendiagnose in der Auswertung: Zusammenfassung, Teilen (Capture / gespeichert),
// verständlicher Hinweis ohne Daten, Fehlerbehandlung. Getrennt von der internen QA-Diagnose.
import fs from 'fs';
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CustomerTrackDiagnosisCard } from '@/features/tracking/components/CustomerTrackDiagnosisCard';
import i18n from '@/i18n/config';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const mockAvailability = jest.fn();
const mockShareCustomer = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/features/tracking/services/supportDiagnosticsService', () => ({
  customerDiagnosticsOverview: async (...a: unknown[]) => {
    const value = await mockAvailability(...a);
    return typeof value === 'string' ? { availability: value, partial: false, reduced: false } : value;
  },
  shareCustomerDiagnostics: (...a: unknown[]) => mockShareCustomer(...a),
  hasSupportDiagnostics: jest.fn(),
  shareSupportDiagnostics: jest.fn(),
}));

const T0 = Date.parse('2026-10-04T08:00:00.000Z');
const detail = {
  distance_meters: 40, corners_total: 2, articles_total: 1, markers: [], runs: [],
  points: [0, 1, 2].map(i => ({ latitude: 47 + i * 1e-4, longitude: 8, accuracy: 3, timestamp: new Date(T0 + i * 1000).toISOString() })),
};
type Rendered = any;
let renderer: Rendered = null;
const mount = async (d: Record<string, any> = detail) => {
  await act(async () => { renderer = TestRenderer.create(<CustomerTrackDiagnosisCard sessionLocalId="sess-1" detail={d} />); });
  await act(async () => { await Promise.resolve(); });
  return renderer!;
};
const texts = (r: Rendered) => r.root.findAllByType('Text' as never).map((n: Rendered) => [].concat(n.props.children).join('')).join('|');
const button = (r: Rendered) => r.root.findAll((n: Rendered) => n.props.testID === 'support-diagnostics-share' && typeof n.props.onPress === 'function')[0];

beforeAll(async () => { await i18n.changeLanguage('de'); });
afterAll(async () => { await i18n.changeLanguage('de'); });
beforeEach(() => { mockAvailability.mockReset(); mockShareCustomer.mockReset(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('CustomerTrackDiagnosisCard', () => {
  it('zeigt TrackLab, unbekannte Aufnahmeangaben und die Grenzen einer Teilaufnahme', async () => {
    mockAvailability.mockResolvedValue({ availability: 'capture', partial: true, reduced: true });
    const r = await mount();
    expect(texts(r)).toContain('Als JSON-Datei für TrackLab');
    expect(texts(r)).toContain('Legen: Build/Gerät unbekannt');
    expect(texts(r)).toContain('Absuche: Build/Gerät unbekannt');
    expect(texts(r)).toContain('nur einen Teil der Absuche');
    expect(texts(r)).toContain('ausgedünnt');
  });
  it('verhindert Doppeltippen auch vor einem erneuten Rendern und behandelt Abbruch ohne Fehler', async () => {
    mockAvailability.mockResolvedValue('persisted');
    let done!: (value: unknown) => void;
    mockShareCustomer.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const r = await mount();
    const press = button(r).props.onPress;
    await act(async () => {
      const pending = press();
      await press();
      expect(mockShareCustomer).toHaveBeenCalledTimes(1);
      done({ ok: true, source: 'persisted', fileName: 'synthetic.json' });
      await pending;
    });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(button(r).props.accessibilityState).toEqual({ disabled: false, busy: false });
  });
  it('zeigt bei gespeicherten Aufnahmeständen niemals die aktuelle Exportversion als Aufnahme', async () => {
    mockAvailability.mockResolvedValue({ availability: 'persisted', partial: false, reduced: false, recording: {
      lay: { availability: 'available', partial: false, segments: [{ source: 'recording_start',
        environment: { appVersion: '1.0.6', nativeBuildVersion: '57', deviceModel: 'Synthetic Phone' } }] },
      search: { availability: 'unknown', segments: [] },
    } });
    const r = await mount();
    expect(texts(r)).toContain('Legen: 1.0.6 (57) · Synthetic Phone');
    expect(texts(r)).toContain('Absuche: Build/Gerät unbekannt');
  });
  it('normaler Kunde: Fährtendiagnose mit Zusammenfassung + Teilen (Capture)', async () => {
    mockAvailability.mockResolvedValue('capture');
    mockShareCustomer.mockResolvedValue({ ok: true, fileName: 'x.json', source: 'capture' });
    const r = await mount();
    const t = texts(r);
    expect(t).toContain('Fährtendiagnose');
    expect(t).toContain('GPS-Qualität beim Legen');
    expect(t).toContain('Sehr gut · ±3 m');
    expect(t).toContain('Noch nicht abgesucht');
    expect(t).toContain('Technische Fährtendaten für Support und Fehleranalyse teilen.');
    await act(async () => { await button(r).props.onPress(); });
    expect(mockShareCustomer).toHaveBeenCalledWith('sess-1', detail);
    expect(Alert.alert).not.toHaveBeenCalled();
  });
  it('ohne Capture, aber gespeicherte Daten: Teilen mit ehrlichem Hinweis', async () => {
    mockAvailability.mockResolvedValue('persisted');
    const r = await mount();
    expect(button(r)).toBeDefined();
    expect(texts(r)).toContain('Aus den gespeicherten Fährtendaten erstellt (ohne Live-Mitschnitt der Absuche).');
  });
  it('alte Fährte ohne Daten: kein Button, verständlicher Hinweis, kein Crash', async () => {
    mockAvailability.mockResolvedValue('none');
    const r = await mount({ points: [] });
    expect(button(r)).toBeUndefined();
    expect(texts(r)).toContain('Für diese ältere Fährte liegen keine vollständigen Diagnosedaten vor.');
  });
  it('Share-Fehler: freundliche Meldung ohne Technik', async () => {
    mockAvailability.mockResolvedValue('persisted');
    mockShareCustomer.mockResolvedValue({ ok: false, reason: 'failed' });
    const r = await mount();
    await act(async () => { await button(r).props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith('Diagnosedaten teilen', 'Diagnosedaten konnten nicht vorbereitet werden.');
  });
  it('Prüfung wirft: Hinweis statt Crash', async () => {
    mockAvailability.mockRejectedValue(new Error('x'));
    const r = await mount();
    expect(texts(r)).toContain('Für diese ältere Fährte liegen keine vollständigen Diagnosedaten vor.');
  });
  it('getrennt von der internen QA-Diagnose: kein /dev-Link, kein QA-/Tester-Zugriff', () => {
    for (const f of ['features/tracking/components/CustomerTrackDiagnosisCard.tsx', 'features/tracking/utils/customerTrackDiagnosis.ts', 'features/tracking/components/SupportDiagnosticsRow.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      for (const bad of ['/dev/', 'useDiagnosticsAccess', 'isQaDiagnosticsEnabled', 'setQaDiagnosticsEnabled', 'is_internal_tester', 'DiagnosticsRouteGate']) expect(src).not.toContain(bad);
    }
    const profile = fs.readFileSync('app/(tabs)/profile.tsx', 'utf8');
    expect(profile).toContain('{diagnosticsAccess.allowed && (');
    expect(fs.readFileSync('app/dev/precision-location-test.tsx', 'utf8')).toContain('<DiagnosticsRouteGate>');
  });

  it.each([
    ['de',  'Fährtendiagnose',          'Diagnosedaten teilen',               'GPS-Qualität beim Legen'],
    ['gsw', 'Fährte-Diagnose',          'Diagnosedate teile',                 'GPS-Qualität bim Lege'],
    ['en',  'Track diagnosis',          'Share diagnostic data',              'GPS quality while laying'],
    ['fr',  'Diagnostic de piste',      'Partager les données de diagnostic', 'Qualité GPS lors de la pose'],
    ['it',  'Diagnostica della pista',  'Condividi dati diagnostici',         'Qualità GPS durante la posa'],
  ])('%s: Titel, Teilen und Zeilen übersetzt, keine rohen Keys', async (lng, title, share, gps) => {
    await act(async () => { await i18n.changeLanguage(lng); });
    mockAvailability.mockResolvedValue('capture');
    const r = await mount();
    const t = texts(r);
    expect(t).toContain(title);
    expect(t).toContain(share);
    expect(t).toContain(gps);
    expect(t).not.toMatch(/track\.customerDiagnosis|\{\w+\}/);
    expect(button(r).props.accessibilityLabel).toBe(share);
    act(() => { renderer.unmount(); }); renderer = null;
    mockAvailability.mockResolvedValue('none');
    const r2 = await mount({ points: [] });
    expect(texts(r2)).not.toMatch(/track\.customerDiagnosis/);
    await act(async () => { await i18n.changeLanguage('de'); });
  });
});
