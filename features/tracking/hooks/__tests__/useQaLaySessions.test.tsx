/**
 * QA-Export Session Freshness — Hook: Laden bei initialem Fokus und bei jedem
 * weiteren Fokus; neue Session erscheint beim nächsten Fokus; späte alte
 * Antwort überschreibt keine neuere; leere Liste; ohne User leer.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useQaLaySessions } from '@/features/tracking/hooks/useQaLaySessions';
import type { QaSessionSummary } from '@/features/tracking/services/qaTrackExportService';

// expo-router useFocusEffect: Effekt einfangen und Fokus manuell auslösen
// (react-navigation ruft ihn bei jedem Fokus erneut auf — hier simuliert).
let focusEffect: (() => void | (() => void)) | null = null;
jest.mock('expo-router', () => ({ useFocusEffect: (cb: () => void | (() => void)) => { focusEffect = cb; } }));
const mockList = jest.fn();
jest.mock('@/features/tracking/services/qaTrackExportService', () => ({ listRecentLaySessions: (...a: unknown[]) => mockList(...a) }));

const row = (localId: string, startedAt: string): QaSessionSummary => ({ localId, qaId: `qa-${localId}`, startedAt, durationSeconds: 10, layPointCount: 3, distanceM: 12 });
const OLD = row('old', '2026-09-12T18:30:00.000Z');
const NEW = row('new', '2026-09-13T08:24:00.000Z');

let latest: ReturnType<typeof useQaLaySessions> | null = null;
function Harness({ uid }: { uid: string | null }) { latest = useQaLaySessions(uid, 5); return null; }
let renderer: ReactTestRenderer | null = null;
const focus = async () => { await act(async () => { focusEffect?.(); await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => { focusEffect = null; latest = null; mockList.mockReset(); });
afterEach(() => { act(() => { renderer?.unmount(); }); renderer = null; });

describe('useQaLaySessions', () => {
  it('1. initialer Fokus (Mount) lädt die aktuellen Sessions', async () => {
    mockList.mockResolvedValue([OLD]);
    act(() => { renderer = TestRenderer.create(<Harness uid="u1" />); });
    expect(focusEffect).not.toBeNull();
    await focus();
    expect(mockList).toHaveBeenCalledWith('u1', 5);
    expect(latest!.sessions.map(s => s.localId)).toEqual(['old']);
  });

  it('2./3./4./5. erneuter Fokus lädt neu: die inzwischen gelegte Fährte steht oben und ersetzt die alte Liste', async () => {
    mockList.mockResolvedValueOnce([OLD]);
    act(() => { renderer = TestRenderer.create(<Harness uid="u1" />); });
    await focus();
    expect(latest!.sessions.map(s => s.localId)).toEqual(['old']);
    // … Fährte gelegt + Finish (SQLite hat jetzt NEW vor OLD), Screen blieb gemountet → Rückkehr = Fokus
    mockList.mockResolvedValueOnce([NEW, OLD]);
    await focus();
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(latest!.sessions.map(s => s.localId)).toEqual(['new', 'old']);
    expect(latest!.sessions[0].qaId).toBe('qa-new');   // „Letzte gelegte Fährte" = wirklich die neueste
  });

  it('8. späte Antwort eines älteren Ladevorgangs überschreibt keine neuere Liste', async () => {
    let resolveFirst: (v: QaSessionSummary[]) => void = () => {};
    mockList.mockImplementationOnce(() => new Promise<QaSessionSummary[]>(res => { resolveFirst = res; }));
    mockList.mockResolvedValueOnce([NEW, OLD]);
    act(() => { renderer = TestRenderer.create(<Harness uid="u1" />); });
    await focus();                       // 1. Anfrage hängt
    await focus();                       // 2. Anfrage antwortet sofort mit [NEW, OLD]
    expect(latest!.sessions.map(s => s.localId)).toEqual(['new', 'old']);
    await act(async () => { resolveFirst([OLD]); await Promise.resolve(); await Promise.resolve(); });
    expect(latest!.sessions.map(s => s.localId)).toEqual(['new', 'old']);   // alte Antwort verworfen
  });

  it('9. leere Liste / Fehler → [] ; ohne User → [] ohne Repository-Aufruf', async () => {
    mockList.mockRejectedValueOnce(new Error('db'));
    act(() => { renderer = TestRenderer.create(<Harness uid="u1" />); });
    await focus();
    expect(latest!.sessions).toEqual([]);
    act(() => { renderer!.unmount(); });
    mockList.mockReset();
    act(() => { renderer = TestRenderer.create(<Harness uid={null} />); });
    await focus();
    expect(mockList).not.toHaveBeenCalled();
    expect(latest!.sessions).toEqual([]);
  });
});
