import React, { useEffect, useState } from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { useUndoableListRemoval, useUndoableValueRemoval } from '@/hooks/useUndoableRemoval';
import { UNDO_TOAST_DURATION_MS, getUndoToastSnapshot, undoToast } from '@/lib/undoToast';

let list: string[];
let listApi: ReturnType<typeof useUndoableListRemoval<string>>;
let setList: (next: string[]) => void;
function ListProbe() {
  const [value, setValue] = useState(['a', 'b', 'c']);
  const api = useUndoableListRemoval(value, setValue);
  useEffect(() => { list = value; setList = setValue; listApi = api; }, [value, api]);
  return null;
}
let single: string | null;
let singleApi: ReturnType<typeof useUndoableValueRemoval<string>>;
let setSingle: (next: string | null) => void;
function ValueProbe() {
  const [value, setValue] = useState<string | null>('video-1');
  const api = useUndoableValueRemoval(value, setValue);
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
