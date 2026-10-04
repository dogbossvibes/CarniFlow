// „Fährte fortsetzen" + „Ohne App abgeschlossen": Sichtbarkeit, Bestätigung, Wirkung.
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { TrackResumeCta } from '@/features/tracking/components/TrackResumeCta';

const mockEvaluate = jest.fn();
const mockApply = jest.fn();
const mockComplete = jest.fn();
const mockPush = jest.fn();
jest.mock('@/features/tracking/services/trackRecoveryService', () => ({
  evaluateTrackRecovery: (...a: unknown[]) => mockEvaluate(...a),
  applyTrackRecovery: (...a: unknown[]) => mockApply(...a),
  completeTrackWithoutApp: (...a: unknown[]) => mockComplete(...a),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

// Typings von react-test-renderer sind im Projekt unvollständig → bewusst lose typisiert.
type Rendered = any;
let renderer: Rendered = null;
const mount = async () => {
  await act(async () => { renderer = TestRenderer.create(<TrackResumeCta sessionId="sess-A" dogId="dog-A" hasRemoteSearchRun={false} />); });
  await act(async () => { await Promise.resolve(); });
  return renderer;
};
const byId = (r: Rendered, id: string) => r.root.findAll((n: Rendered) => n.props.testID === id)[0];
const texts = (r: Rendered) => r.root.findAllByType('Text' as never).map((n: Rendered) => n.props.children).flat().join('|');

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  [mockEvaluate, mockApply, mockComplete, mockPush].forEach(m => m.mockReset());
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
});
