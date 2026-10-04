// Kunden-Fährtendiagnose in der Auswertung: Zusammenfassung, Teilen (Capture / gespeichert),
// verständlicher Hinweis ohne Daten, Fehlerbehandlung. Getrennt von der internen QA-Diagnose.
import fs from 'fs';
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { CustomerTrackDiagnosisCard } from '@/features/tracking/components/CustomerTrackDiagnosisCard';

const mockAvailability = jest.fn();
const mockShareCustomer = jest.fn();
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/features/tracking/services/supportDiagnosticsService', () => ({
  customerDiagnosticsAvailability: (...a: unknown[]) => mockAvailability(...a),
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

beforeEach(() => { mockAvailability.mockReset(); mockShareCustomer.mockReset(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('CustomerTrackDiagnosisCard', () => {
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
});
