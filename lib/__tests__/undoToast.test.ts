import {
  UNDO_TOAST_DURATION_MS, UNDO_TOAST_SCREEN_READER_DURATION_MS,
  getUndoToastSnapshot, setUndoToastScreenReader, showUndoToast, undoToast,
} from '@/lib/undoToast';

beforeEach(() => { jest.useFakeTimers(); setUndoToastScreenReader(false); });
afterEach(() => { getUndoToastSnapshot() && undoToast(getUndoToastSnapshot()!.id); jest.useRealTimers(); });

const callbacks = () => ({ onUndo: jest.fn(), onCommit: jest.fn() });

it('schreibt erst nach Ablauf der Frist fest', () => {
  const cb = callbacks();
  showUndoToast({ message: 'Erledigt', ...cb });
  expect(getUndoToastSnapshot()).toMatchObject({ message: 'Erledigt', durationMs: UNDO_TOAST_DURATION_MS });
  jest.advanceTimersByTime(UNDO_TOAST_DURATION_MS - 1);
  expect(cb.onCommit).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(cb.onCommit).toHaveBeenCalledTimes(1);
  expect(cb.onUndo).not.toHaveBeenCalled();
  expect(getUndoToastSnapshot()).toBeNull();
});

it('Rückgängig nimmt zurück und schreibt nie fest', () => {
  const cb = callbacks();
  showUndoToast({ message: 'Erledigt', ...cb });
  expect(undoToast(getUndoToastSnapshot()!.id)).toBe(true);
  jest.runAllTimers();
  expect(cb.onUndo).toHaveBeenCalledTimes(1);
  expect(cb.onCommit).not.toHaveBeenCalled();
  expect(undoToast(1)).toBe(false);
});

it('App wird in der Frist beendet: nichts wird festgeschrieben', () => {
  const cb = callbacks();
  showUndoToast({ message: 'Erledigt', ...cb });
  jest.advanceTimersByTime(UNDO_TOAST_DURATION_MS / 2);
  // Prozessende = keine weiteren Timer. Bis dahin lief weder Commit noch Undo.
  expect(cb.onCommit).not.toHaveBeenCalled();
  expect(cb.onUndo).not.toHaveBeenCalled();
});

it('flush schreibt sofort fest, cancel tut nichts, beides nur einmal', () => {
  const a = callbacks();
  const first = showUndoToast({ message: 'A', ...a });
  first.flush(); first.flush(); first.cancel();
  jest.runAllTimers();
  expect(a.onCommit).toHaveBeenCalledTimes(1);

  const b = callbacks();
  showUndoToast({ message: 'B', ...b }).cancel();
  jest.runAllTimers();
  expect(b.onCommit).not.toHaveBeenCalled();
  expect(b.onUndo).not.toHaveBeenCalled();
});

it('ein neuer Hinweis schliesst den alten mit Festschreiben ab', () => {
  const a = callbacks(), b = callbacks();
  const first = showUndoToast({ message: 'A', ...a });
  showUndoToast({ message: 'B', ...b });
  expect(a.onCommit).toHaveBeenCalledTimes(1);
  first.flush();
  expect(getUndoToastSnapshot()).toMatchObject({ message: 'B' });
  expect(b.onCommit).not.toHaveBeenCalled();
});

it('bleibt mit Vorlese-Funktion deutlich länger sichtbar', () => {
  setUndoToastScreenReader(true);
  const cb = callbacks();
  showUndoToast({ message: 'Erledigt', ...cb });
  jest.advanceTimersByTime(UNDO_TOAST_DURATION_MS);
  expect(cb.onCommit).not.toHaveBeenCalled();
  jest.advanceTimersByTime(UNDO_TOAST_SCREEN_READER_DURATION_MS);
  expect(cb.onCommit).toHaveBeenCalledTimes(1);
});
