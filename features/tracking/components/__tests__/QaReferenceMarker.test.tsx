import React from 'react';
import { act, create } from 'react-test-renderer';
import { QaReferenceMarker } from '../QaReferenceMarker';

let mockEnabled = true;
let mockToken: string | null = 'test-access';
jest.mock('@/features/tracking/utils/qaDiagnosticsMode', () => ({ isQaDiagnosticsEnabled: () => mockEnabled, subscribeQaDiagnostics: () => () => {} }));
jest.mock('@/lib/diagnosticsAccessState', () => ({ diagnosticsAccessToken: () => mockToken, subscribeDiagnosticsAccess: () => () => {} }));

it('records before offering choices and keeps the selected label on the original handle', () => {
  mockEnabled = true; mockToken = 'test-access';
  const handle = { mark: { tMs: 123, kind: 'unbekannt' as const }, token: 'test-access' };
  const mark = jest.fn(() => handle); const label = jest.fn();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<QaReferenceMarker paused={false} hidden={false} mark={mark} label={label} />); });
  act(() => tree!.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0].props.onPress());
  expect(mark).toHaveBeenCalledTimes(1);
  act(() => tree!.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[2].props.onPress());
  expect(label).toHaveBeenCalledWith(handle, 'spitz_rechts');
  act(() => tree!.unmount());
});

it('is hidden without diagnostic access and disables new marks during pause', () => {
  mockEnabled = true; mockToken = null;
  const mark = jest.fn(); const label = jest.fn();
  let tree: ReturnType<typeof create>;
  act(() => { tree = create(<QaReferenceMarker paused={false} hidden={false} mark={mark} label={label} />); });
  expect((tree! as unknown as { toJSON: () => unknown }).toJSON()).toBeNull();
  act(() => tree!.unmount());
  mockToken = 'test-access';
  act(() => { tree = create(<QaReferenceMarker paused hidden={false} mark={mark} label={label} />); });
  expect(tree!.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0].props.disabled).toBe(true);
  act(() => tree!.unmount());
});
