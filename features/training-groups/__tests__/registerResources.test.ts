import i18n from '@/i18n/config';
import { registerGroupResources } from '../registerResources';
jest.mock('@/i18n/config', () => ({ __esModule: true, default: {
  isInitialized: false, addResourceBundle: jest.fn(), on: jest.fn(), off: jest.fn(),
} }));
beforeEach(() => { jest.clearAllMocks(); i18n.isInitialized = false; });
it('defers namespace registration without crashing a delayed or failed root initialization', () => {
  registerGroupResources('example', { de: { stop: 'Stoppen' } });
  expect(i18n.addResourceBundle).not.toHaveBeenCalled(); expect(i18n.on).toHaveBeenCalledWith('initialized', expect.any(Function));
  const listener = jest.mocked(i18n.on).mock.calls[0][1];
  i18n.isInitialized = true; listener();
  expect(i18n.addResourceBundle).toHaveBeenCalledWith('de', 'example', { stop: 'Stoppen' }, true, false);
  expect(i18n.off).toHaveBeenCalledWith('initialized', listener);
});
it('registers immediately when the existing locale service is ready', () => {
  i18n.isInitialized = true; registerGroupResources('example', { en: { stop: 'Stop' } });
  expect(i18n.addResourceBundle).toHaveBeenCalledTimes(1); expect(i18n.on).not.toHaveBeenCalled();
});
