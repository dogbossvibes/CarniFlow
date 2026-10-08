import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, type AppStateStatus } from 'react-native';
import { useAccessRefresh } from '../useAccessRefresh';

// The repo's minimal renderer declaration omits the public update method.
type UpdatingRenderer = ReturnType<typeof TestRenderer.create> & { update(element: React.ReactElement): void };

it('Resume erneuert Rechte; Logout/Accountwechsel entfernt alte Listener', () => {
  const handlers: ((state: AppStateStatus) => void)[] = [];
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return { remove };
  });
  const refetch = jest.fn().mockResolvedValue(undefined);
  function Probe({ uid }: { uid?: string }) { useAccessRefresh(uid, refetch); return null; }
  let renderer: UpdatingRenderer;
  act(() => { renderer = TestRenderer.create(<Probe uid="one" />) as UpdatingRenderer; });
  act(() => { handlers[0]('background'); });
  expect(refetch).not.toHaveBeenCalled();
  act(() => { handlers[0]('active'); });
  expect(refetch).toHaveBeenCalledWith({ cancelRefetch: false });
  act(() => { renderer!.update(<Probe uid="two" />); });
  expect(remove).toHaveBeenCalledTimes(1);
  act(() => { renderer!.update(<Probe />); });
  expect(remove).toHaveBeenCalledTimes(2);
  expect(handlers).toHaveLength(2);
  act(() => { renderer!.unmount(); });
  spy.mockRestore();
});
