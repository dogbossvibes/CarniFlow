import React, { useEffect, useState } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useUndoableListRemoval, useUndoableValueRemoval } from '@/hooks/useUndoableRemoval';
import { UNDO_TOAST_DURATION_MS, getUndoToastSnapshot, undoToast } from '@/lib/undoToast';

let list: string[];
let listApi: ReturnType<typeof useUndoableListRemoval<string>>;
let setList: (next: string[]) => void;
function ListProbe({ scope, locked }: { scope?: string; locked?: boolean }) {
  const [value, setValue] = useState(['a', 'b', 'c']);
  const api = useUndoableListRemoval(value, setValue, { scope, locked });
  useEffect(() => { list = value; setList = setValue; listApi = api; }, [value, api]);
  return null;
}
let single: string | null;
let singleApi: ReturnType<typeof useUndoableValueRemoval<string>>;
let setSingle: (next: string | null) => void;
function ValueProbe({ scope, locked }: { scope?: string; locked?: boolean }) {
  const [value, setValue] = useState<string | null>('video-1');
  const api = useUndoableValueRemoval(value, setValue, { scope, locked });
  useEffect(() => { single = value; setSingle = setValue; singleApi = api; }, [value, api]);
  return null;
}
let tree: ReactTestRenderer;
const mount = (el: React.ReactElement) => act(() => { tree = TestRenderer.create(el); });
const pressUndo = () => act(() => { undoToast(getUndoToastSnapshot()!.id); });

beforeEach(() => jest.useFakeTimers());
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

it('entfernt sofort und setzt bei Rückgängig an den alten Platz zurück', () => {
  mount(<ListProbe />);
  act(() => listApi.remove(1, 'Foto entfernt'));
  expect(list).toEqual(['a', 'c']);
  expect(getUndoToastSnapshot()).toMatchObject({ message: 'Foto entfernt' });
  pressUndo();
  expect(list).toEqual(['a', 'b', 'c']);
  expect(getUndoToastSnapshot()).toBeNull();
});

it('behält später hinzugefügte Einträge bei Rückgängig', () => {
  mount(<ListProbe />);
  act(() => listApi.remove(2, 'Foto entfernt'));
  act(() => setList([...list, 'd']));
  pressUndo();
  expect(list).toEqual(['a', 'b', 'c', 'd']);
});

it('ohne Rückgängig bleibt der Eintrag entfernt und der Hinweis verschwindet', () => {
  mount(<ListProbe />);
  act(() => listApi.remove(0, 'Foto entfernt'));
  act(() => { jest.advanceTimersByTime(UNDO_TOAST_DURATION_MS); });
  expect(list).toEqual(['b', 'c']);
  expect(getUndoToastSnapshot()).toBeNull();
});

it('schliesst den Hinweis beim Verlassen des Formulars und vor einer neuen Auswahl', () => {
  mount(<ListProbe />);
  act(() => listApi.remove(0, 'Foto entfernt'));
  act(() => listApi.settle());
  expect(getUndoToastSnapshot()).toBeNull();
  act(() => listApi.remove(0, 'Foto entfernt'));
  act(() => tree.unmount());
  expect(getUndoToastSnapshot()).toBeNull();
  mount(<ListProbe />);
});

it('Einzelwert: Rückgängig stellt nur wieder her, wenn nichts Neues gewählt wurde', () => {
  mount(<ValueProbe />);
  act(() => singleApi.remove('Video entfernt'));
  expect(single).toBeNull();
  pressUndo();
  expect(single).toBe('video-1');

  act(() => singleApi.remove('Video entfernt'));
  act(() => setSingle('video-2'));
  pressUndo();
  expect(single).toBe('video-2');
});

// ── Nachbesserung nach Review OTA «Bedienung» (B1, B2, N2) ──────────────────
describe('Rückgängig gilt nur für das Formular, in dem entfernt wurde', () => {
  it('B1: nach einem Hundewechsel ist der Hinweis zu und nichts landet beim anderen Hund', () => {
    mount(<ListProbe scope="hund-a" />);
    act(() => listApi.remove(0, 'Foto entfernt'));
    const open = getUndoToastSnapshot()!;
    // Hundewechsel: das Formular zeigt jetzt die Fotos von Hund B.
    act(() => { tree.update(<ListProbe scope="hund-b" />); setList(['foto-b']); });
    expect(getUndoToastSnapshot()).toBeNull();
    act(() => { undoToast(open.id); });
    expect(list).toEqual(['foto-b']);
  });

  it('B2: sobald gespeichert wird, ist der Hinweis zu und Entfernen gesperrt', () => {
    mount(<ListProbe scope="hund-a" />);
    act(() => listApi.remove(0, 'Foto entfernt'));
    act(() => { tree.update(<ListProbe scope="hund-a" locked />); });
    expect(getUndoToastSnapshot()).toBeNull();
    act(() => listApi.remove(0, 'Foto entfernt'));
    expect(list).toEqual(['b', 'c']);
    expect(getUndoToastSnapshot()).toBeNull();
  });

  it('B1/B2 auch für den Einzelwert (Video)', () => {
    mount(<ValueProbe scope="hund-a" />);
    act(() => singleApi.remove('Video entfernt'));
    act(() => { tree.update(<ValueProbe scope="hund-b" />); });
    expect(getUndoToastSnapshot()).toBeNull();
    act(() => { tree.update(<ValueProbe scope="hund-b" locked />); setSingle('video-b'); });
    act(() => singleApi.remove('Video entfernt'));
    expect(single).toBe('video-b');
  });

  it('N2: fügt ein inzwischen wieder vorhandenes Element nicht doppelt ein', () => {
    mount(<ListProbe />);
    act(() => listApi.remove(0, 'Foto entfernt'));
    // Ein laufender Upload schreibt mit dem alten Stand zurück (inklusive «a»).
    act(() => setList(['a', 'b', 'c', 'neu']));
    pressUndo();
    expect(list).toEqual(['a', 'b', 'c', 'neu']);
  });
});
