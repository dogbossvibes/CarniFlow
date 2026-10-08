import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { usePlan } from '../usePlan';

const mockProfile = jest.fn();
const mockCaps = jest.fn();
jest.mock('@/hooks/useProfile', () => ({ useProfile: () => mockProfile() }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => mockCaps() }));

it('Legacy AI-Gate folgt ACTIVE-lifetime und verliert Rechte bei Accountwechsel', () => {
  mockProfile.mockReturnValue({ profile: { trial_used: false }, isPremium: false, planExpiresAt: null, loading: false });
  mockCaps.mockReturnValue({ isPro: true, hasActiveLifetimeAccess: true, loading: false });
  let result: ReturnType<typeof usePlan>;
  function Probe() { result = usePlan(); return null; }
  let renderer: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Probe />); });
  expect(result!).toMatchObject({ plan: 'premium', isPremium: true, expiresAt: null });
  mockCaps.mockReturnValue({ isPro: false, hasActiveLifetimeAccess: false, loading: false });
  act(() => { renderer!.update(<Probe />); });
  expect(result!).toMatchObject({ plan: 'free', isPremium: false });
  act(() => { renderer!.unmount(); });
});
