import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState } from 'react-native';
import { useAccessRefresh } from '../useAccessRefresh';

it('Resume erneuert Rechte; Logout/Accountwechsel entfernt alte Listener', () => {
  const handlers: ((state: string) => void)[] = [];
  const remove = jest.fn();
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    handlers.push(handler);
    return { remove };
  });
  const refetch = jest.fn().mockResolvedValue(undefined);
  function Probe({ uid }: { uid?: string }) { useAccessRefresh(uid, refetch); return null; }
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Probe uid="one" />); });
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
