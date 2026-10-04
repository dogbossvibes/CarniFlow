// „Fährte fortsetzen" + „Ohne App abgeschlossen": Sichtbarkeit, Bestätigung, Wirkung.
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackResumeCta } from '@/features/tracking/components/TrackResumeCta';

const mockEvaluate = jest.fn();
const mockApply = jest.fn();
const mockComplete = jest.fn();
const mockDiscard = jest.fn();
const mockPush = jest.fn();
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  evaluateTrackRecovery: (...a: unknown[]) => mockEvaluate(...a),
  applyTrackRecovery: (...a: unknown[]) => mockApply(...a),
  completeTrackWithoutApp: (...a: unknown[]) => mockComplete(...a),
  discardSearchAttempt: (...a: unknown[]) => mockDiscard(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
let mockQa = false;
jest.mock('@/features/tracking/utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockQa }));

// Typings von react-test-renderer sind im Projekt unvollständig → bewusst lose typisiert.
type Rendered = any;
let renderer: Rendered = null;
const mockVisible = jest.fn();
const mount = async () => {
  await act(async () => { renderer = TestRenderer.create(<TrackResumeCta sessionId="sess-A" dogId="dog-A" hasRemoteSearchRun={false} onVisibleChange={mockVisible} />); });
  await act(async () => { await Promise.resolve(); });
  return renderer;
};
const byId = (r: Rendered, id: string) => r.root.findAll((n: Rendered) => n.props.testID === id)[0];
const texts = (r: Rendered) => r.root.findAllByType('Text' as never).map((n: Rendered) => n.props.children).flat().join('|');

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockQa = false;
  [mockEvaluate, mockApply, mockComplete, mockPush, mockDiscard].forEach(m => m.mockReset());
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; jest.restoreAllMocks(); });

describe('TrackResumeCta', () => {
  it('nicht recoverable → nichts sichtbar (kein vorgetäuschtes Fortsetzen)', async () => {
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'completed_without_app' });
    const r = await mount();
    expect(r.toJSON()).toBeNull();
  });

  it('recoverable → primär „Fährte fortsetzen", sekundär „Ohne App abgeschlossen" mit Hilfetext', async () => {
    mockEvaluate.mockResolvedValue({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    const r = await mount();
    expect(byId(r, 'track-resume-cta')).toBeDefined();
    expect(byId(r, 'track-complete-without-app')).toBeDefined();
    expect(texts(r)).toContain('Fährte fortsetzen');
    expect(texts(r)).toContain('Ohne App abgeschlossen');
    expect(texts(r)).toContain('Markiert die Fährte als beendet, wenn du sie ohne ANYVO abgesucht hast.');
  });

  it('„Fährte fortsetzen" → Recovery + Navigation zum Ziel', async () => {
    mockEvaluate.mockResolvedValue({ ok: true });
    mockApply.mockResolvedValue({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    const r = await mount();
    await act(async () => { await byId(r, 'track-resume-cta').props.onPress(); });
    expect(mockPush).toHaveBeenCalledWith('/track/liegen?dogId=dog-A&id=sess-A');
  });

  it('„Ohne App abgeschlossen" → exakter Bestätigungsdialog; erst „Als abgeschlossen markieren" schreibt', async () => {
    mockEvaluate.mockResolvedValue({ ok: true });
    mockComplete.mockResolvedValue({ ok: true });
    const r = await mount();
    await act(async () => { byId(r, 'track-complete-without-app').props.onPress(); });
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Fährte als abgeschlossen markieren?');
    expect(message).toBe('Die Fährte bleibt im Journal. Eine Absuche wird nicht nachträglich erfunden oder aufgezeichnet. Danach kann diese Fährte nicht mehr fortgesetzt werden.');
    expect(buttons.map(b => b.text)).toEqual(['Abbrechen', 'Als abgeschlossen markieren']);
    expect(mockComplete).not.toHaveBeenCalled();   // noch nichts geschrieben
    await act(async () => { buttons[1].onPress!(); await Promise.resolve(); });
    expect(mockComplete).toHaveBeenCalledWith('sess-A', 'dog-A');
    expect(r.toJSON()).toBeNull();                  // beide Aktionen verschwinden
  });

  it('Markieren schlägt fehl → freundliche Meldung, Aktionen bleiben', async () => {
    mockEvaluate.mockResolvedValue({ ok: true });
    mockComplete.mockResolvedValue({ ok: false, reason: 'failed' });
    const r = await mount();
    await act(async () => { byId(r, 'track-complete-without-app').props.onPress(); });
    const buttons = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    await act(async () => { buttons[1].onPress!(); await Promise.resolve(); });
    expect(alertSpy).toHaveBeenLastCalledWith('Ohne App abgeschlossen', expect.stringContaining('nicht als abgeschlossen markiert'));
    expect(byId(r, 'track-resume-cta')).toBeDefined();
  });

  it('Feldfall: recoverable → grosse Karte mit Mint-Primär „Fährte fortsetzen" und Sekundär „Ohne App abgeschlossen"; meldet sichtbar', async () => {
    mockEvaluate.mockResolvedValue({ ok: true, source: 'session', mode: 'resting', target: '/track/liegen?dogId=dog-A&id=sess-A' });
    const r = await mount();
    expect(byId(r, 'track-recovery-card')).toBeDefined();
    expect(texts(r)).toContain('Diese Fährte ist noch offen');
    expect(byId(r, 'track-resume-cta')).toBeDefined();
    expect(byId(r, 'track-complete-without-app')).toBeDefined();
    expect(mockVisible).toHaveBeenLastCalledWith(true);
  });

  it('begonnene, nicht beendete Absuche (search_started) → nur „Ohne App abgeschlossen", kein Fortsetzen', async () => {
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'search_started' });
    const r = await mount();
    expect(byId(r, 'track-resume-cta')).toBeUndefined();
    expect(byId(r, 'track-complete-without-app')).toBeDefined();
    expect(texts(r)).toContain('nicht in ANYVO beendet');
  });

  it('nicht fortsetzbar: normal nichts sichtbar; im QA-Diagnosemodus der konkrete Reason', async () => {
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'search_completed' });
    let r = await mount();
    expect(r.toJSON()).toBeNull();
    expect(mockVisible).toHaveBeenLastCalledWith(false);
    act(() => { r.unmount(); }); renderer = null;
    mockQa = true;
    r = await mount();
    expect(byId(r, 'track-recovery-reason')).toBeDefined();
    expect(texts(r)).toContain('Recovery: search_completed');
    expect(byId(r, 'track-resume-cta')).toBeUndefined();
  });

  it('recovery searching → „Absuche fortsetzen" + „Ohne App abgeschlossen"', async () => {
    mockEvaluate.mockResolvedValue({ ok: true, mode: 'searching', source: 'pending', target: '/track/run?dogId=dog-A&id=sess-A' });
    const r = await mount();
    expect(texts(r)).toContain('Absuche unterbrochen');
    expect(texts(r)).toContain('Absuche fortsetzen');
    expect(byId(r, 'track-resume-cta').props.accessibilityLabel).toBe('Absuche fortsetzen');
    expect(byId(r, 'track-complete-without-app')).toBeDefined();
    expect(byId(r, 'track-discard-search')).toBeUndefined();
  });

  it('unvollständige Absuche → „Unvollständige Absuche erkannt" mit Verwerfen/Freigeben und Ohne-App; kein Fortsetzen', async () => {
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'search_started' });
    mockDiscard.mockResolvedValue({ ok: true, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    const r = await mount();
    expect(texts(r)).toContain('Unvollständige Absuche erkannt');
    expect(byId(r, 'track-resume-cta')).toBeUndefined();
    expect(texts(r)).toContain('Absuche verwerfen und Fährte wieder freigeben');
    expect(byId(r, 'track-complete-without-app')).toBeDefined();
    await act(async () => { byId(r, 'track-discard-search').props.onPress(); });
    const [title, message, buttons] = alertSpy.mock.calls[0] as [string, string, { text: string; onPress?: () => void }[]];
    expect(title).toBe('Absuche verwerfen?');
    expect(message).toContain('Die gelegte Fährte bleibt erhalten');
    expect(mockDiscard).not.toHaveBeenCalled();   // keine Auto-Entscheidung
    await act(async () => { buttons[1].onPress!(); await Promise.resolve(); });
    expect(mockDiscard).toHaveBeenCalledWith('sess-A', 'dog-A', { hasRemoteSearchRun: false });
    expect(mockPush).toHaveBeenCalledWith('/track/liegen?dogId=dog-A&id=sess-A');
  });

  it('QA-Modus: „cancelled" nennt Quelle und Zeitpunkt des Abbruchs (wodurch beendet)', async () => {
    mockQa = true;
    mockEvaluate.mockResolvedValue({ ok: false, reason: 'cancelled', detail: { lifecycleSource: 'resting_abort', lifecycleAt: '2026-10-04T09:00:00.000Z' } });
    const r = await mount();
    expect(texts(r)).toContain('Recovery: cancelled · resting_abort · 2026-10-04T09:00:00.000Z');
  });

  it('10. Mount/Unmount/Remount der Karte schreibt nichts (kein Apply/Complete/Discard) und bleibt verfügbar', async () => {
    mockEvaluate.mockResolvedValue({ ok: true, source: 'session', mode: 'resting', registryPatch: {}, pendingToWrite: null, target: '/track/liegen?dogId=dog-A&id=sess-A' });
    await mount();
    act(() => { renderer.unmount(); }); renderer = null;
    const r = await mount();
    expect(byId(r, 'track-resume-cta')).toBeDefined();
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockComplete).not.toHaveBeenCalled();
    expect(mockDiscard).not.toHaveBeenCalled();
  });
});
