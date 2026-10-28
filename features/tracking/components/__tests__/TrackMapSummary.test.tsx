import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TrackMapSummary } from '../TrackMapSummary';

jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

it('renders actual measurements and delegates both actions without owning editor state', () => {
  const details = jest.fn(); const analysis = jest.fn();
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<TrackMapSummary distanceM={418.4} corners={7} objects={2} onDetails={details} onAnalysis={analysis} />); });
  const texts = node.root.findAll(n => (n as unknown as { type: unknown }).type === 'Text').map(n => n.props.children);
  expect(texts).toEqual(expect.arrayContaining(['418 m', '7', '2']));
  act(() => {
    node.root.findAll(n => n.props.onPress === details)[0].props.onPress();
    node.root.findAll(n => n.props.onPress === analysis)[0].props.onPress();
  });
  expect(details).toHaveBeenCalledTimes(1); expect(analysis).toHaveBeenCalledTimes(1);
  act(() => node.unmount());
});

it('keeps unknown measurements distinct from recorded zero and disables unavailable details', () => {
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<TrackMapSummary distanceM={null} corners={0} objects={undefined} onAnalysis={() => {}} />); });
  expect(node.root.findAll(n => (n as unknown as { type: unknown }).type === 'Text').map(n => n.props.children)).toEqual(expect.arrayContaining(['—', '0']));
  expect(node.root.findAll(n => typeof (n as unknown as { type: unknown }).type === 'string' && n.props.accessibilityRole === 'button')[0].props.accessibilityState).toEqual({ disabled: true });
  act(() => node.unmount());
});
