import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { ExchangeEntry } from '@/features/tracking-exchange/ExchangeEntry';
import TrackShareRoute from '@/app/track/share';
const mockPush = jest.fn(); let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }), useLocalSearchParams: () => mockParams, Redirect: 'Redirect' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/features/tracking-sharing/i18n', () => ({}));
jest.mock('@/features/tracking-exchange/ExchangeScreen', () => ({ __esModule: true, default: 'ExistingExchangeScreen' }));
let screen: ReturnType<typeof TestRenderer.create>;
afterEach(() => { if (screen) act(() => screen.unmount()); mockParams = {}; mockPush.mockClear(); });
it('routes hub and completed detail entry to the new used screen, retaining the source ID', () => {
  act(() => { screen = TestRenderer.create(<ExchangeEntry sourceId="actual-source" />); });
  act(() => screen.root.findAll(n => n.props.accessibilityRole === 'button')[0].props.onPress());
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/track/sharing', params: { sourceId: 'actual-source' } });
});
it('moves an unqualified old landing route to the new hub', () => {
  mockParams = { sourceId: 'actual-source' }; act(() => { screen = TestRenderer.create(<TrackShareRoute />); });
  expect(screen.root.findAll(n => n.props.href)[0].props.href).toEqual({ pathname: '/track/sharing', params: { sourceId: 'actual-source' } });
});
const deepLinks: Record<string, string>[] = [{ taskId: 'real-task' }, { incoming: 'one-shot-token' }, { mode: 'compose' }, { mode: 'file' }];
it.each(deepLinks)('keeps existing file/task handling for %p', params => {
  mockParams = params; act(() => { screen = TestRenderer.create(<TrackShareRoute />); });
  expect(screen.root.findAll(n => n.props.href)).toHaveLength(0);
});
