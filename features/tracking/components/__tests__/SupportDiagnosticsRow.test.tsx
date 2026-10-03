// „Diagnosedaten teilen": Sichtbarkeit (nur mit Diagnose), Tippen → Share, freundliche Fehlermeldung.
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SupportDiagnosticsRow } from '@/features/tracking/components/SupportDiagnosticsRow';

const mockHas = jest.fn();
const mockShare = jest.fn();
jest.mock('@/features/tracking/services/supportDiagnosticsService', () => ({
  hasSupportDiagnostics: (...a: unknown[]) => mockHas(...a),
  shareSupportDiagnostics: (...a: unknown[]) => mockShare(...a),
}));

// Typings von react-test-renderer sind im Projekt unvollständig (findAll/toJSON) → bewusst lose typisiert.
type Rendered = any;
let renderer: Rendered = null;
const mount = async () => {
  await act(async () => { renderer = TestRenderer.create(<SupportDiagnosticsRow sessionLocalId="sess-1" />); });
  await act(async () => { await Promise.resolve(); });
  return renderer!;
};
const button = (r: Rendered) => r.root.findAll((n: Rendered) => n.props.testID === 'support-diagnostics-share')[0];
const texts = (r: Rendered) => r.root.findAllByType('Text' as never).map((n: Rendered) => n.props.children).flat().join('|');

beforeEach(() => { mockHas.mockReset(); mockShare.mockReset(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('SupportDiagnosticsRow', () => {
  it('alte Fährte ohne Diagnose: kein Button, kein Fehler', async () => {
    mockHas.mockResolvedValue(false);
    const r = await mount();
    expect(button(r)).toBeUndefined();
    expect(r.toJSON()).toBeNull();
  });

  it('Prüfung wirft: kein Button, kein Crash', async () => {
    mockHas.mockRejectedValue(new Error('storage'));
    const r = await mount();
    expect(r.toJSON()).toBeNull();
  });

  it('mit Diagnose: dezente Zeile mit Titel, Erklärung und Accessibility; Tippen teilt genau einmal', async () => {
    mockHas.mockResolvedValue(true);
    mockShare.mockResolvedValue({ ok: true, fileName: 'x.json' });
    const r = await mount();
    const b = button(r);
    expect(b.props.accessibilityRole).toBe('button');
    expect(b.props.accessibilityLabel).toBe('Diagnosedaten teilen');
    expect(texts(r)).toContain('Diagnosedaten teilen');
    expect(texts(r)).toContain('Technische Fährtendaten für Support und Fehleranalyse teilen.');
    await act(async () => { await b.props.onPress(); });
    expect(mockShare).toHaveBeenCalledTimes(1);
    expect(mockShare).toHaveBeenCalledWith('sess-1');
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('Fehler beim Vorbereiten: freundliche Meldung ohne technische Details', async () => {
    mockHas.mockResolvedValue(true);
    mockShare.mockResolvedValue({ ok: false, reason: 'failed' });
    const r = await mount();
    await act(async () => { await button(r).props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith('Diagnosedaten teilen', 'Diagnosedaten konnten nicht vorbereitet werden.');
  });

  it('Diagnose zwischenzeitlich weg: eigene, ruhige Meldung', async () => {
    mockHas.mockResolvedValue(true);
    mockShare.mockResolvedValue({ ok: false, reason: 'missing' });
    const r = await mount();
    await act(async () => { await button(r).props.onPress(); });
    expect(Alert.alert).toHaveBeenCalledWith('Diagnosedaten teilen', 'Für diese Fährte liegen keine Diagnosedaten vor.');
  });

  it('Doppeltipp während des Teilens startet nicht zweimal', async () => {
    mockHas.mockResolvedValue(true);
    let release!: (v: unknown) => void;
    mockShare.mockImplementation(() => new Promise(res => { release = res; }));
    const r = await mount();
    let first!: Promise<void>;
    act(() => { first = button(r).props.onPress(); });
    await act(async () => { await button(r).props.onPress(); });
    expect(mockShare).toHaveBeenCalledTimes(1);
    await act(async () => { release({ ok: true, fileName: 'x' }); await first; });
  });
});
