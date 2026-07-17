import { Platform } from 'react-native';

// expo-haptics vollständig mocken — die Trigger-Funktionen sollen aufrufbar
// und zählbar sein, die Enums die vom Service erwarteten Keys liefern.
jest.mock('expo-haptics', () => ({
  selectionAsync:    jest.fn(() => Promise.resolve()),
  impactAsync:       jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle:    { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

import * as Haptics from 'expo-haptics';
import { haptic, setHapticsEnabled } from '@/lib/haptics';
import { hapticAngle } from '@/features/tracking/utils/haptics';

const selectionAsync = Haptics.selectionAsync as jest.Mock;
const impactAsync = Haptics.impactAsync as jest.Mock;
const notificationAsync = Haptics.notificationAsync as jest.Mock;

beforeEach(() => {
  selectionAsync.mockClear();
  impactAsync.mockClear();
  notificationAsync.mockClear();
  setHapticsEnabled(true);
  (Platform as { OS: string }).OS = 'ios';
});

describe('haptic service – mapping', () => {
  it('selection() ruft Selection-Haptik auf', () => {
    haptic.selection();
    expect(selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('light/medium/heavy sind korrekt auf Impact gemappt', () => {
    haptic.light();
    haptic.medium();
    haptic.heavy();
    expect(impactAsync).toHaveBeenNthCalledWith(1, 'light');
    expect(impactAsync).toHaveBeenNthCalledWith(2, 'medium');
    expect(impactAsync).toHaveBeenNthCalledWith(3, 'heavy');
  });

  it('success/warning/error sind korrekt auf Notification gemappt', () => {
    haptic.success();
    haptic.warning();
    haptic.error();
    expect(notificationAsync).toHaveBeenNthCalledWith(1, 'success');
    expect(notificationAsync).toHaveBeenNthCalledWith(2, 'warning');
    expect(notificationAsync).toHaveBeenNthCalledWith(3, 'error');
  });
});

describe('haptic service – Robustheit', () => {
  it('Fehler in expo-haptics werfen nie bis zur UI durch', () => {
    impactAsync.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => haptic.medium()).not.toThrow();

    notificationAsync.mockImplementationOnce(() => { throw new Error('boom'); });
    expect(() => haptic.error()).not.toThrow();
  });

  it('eine Nutzeraktion läuft trotz Haptik-Fehler weiter', () => {
    impactAsync.mockImplementationOnce(() => { throw new Error('boom'); });
    const handler = () => { haptic.medium(); return 'gespeichert'; };
    expect(handler()).toBe('gespeichert');
  });

  it('Web ist no-op', () => {
    (Platform as { OS: string }).OS = 'web';
    haptic.selection();
    haptic.light();
    haptic.success();
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });

  it('deaktiviertes Haptik-Flag ist no-op', () => {
    setHapticsEnabled(false);
    haptic.selection();
    haptic.medium();
    haptic.success();
    expect(selectionAsync).not.toHaveBeenCalled();
    expect(impactAsync).not.toHaveBeenCalled();
    expect(notificationAsync).not.toHaveBeenCalled();
  });
});

describe('Klick + Resultat = zwei getrennte Feedbacks', () => {
  it('light beim Tap und success beim Erfolg feuern je genau einmal', () => {
    // Simuliert: Button-Klick (light) → gespeichert (success).
    haptic.light();
    haptic.success();
    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith('light');
    expect(notificationAsync).toHaveBeenCalledTimes(1);
    expect(notificationAsync).toHaveBeenCalledWith('success');
  });
});

describe('Android und iOS nutzen denselben Service', () => {
  it('löst auf beiden Plattformen über dieselbe Implementierung aus', () => {
    (Platform as { OS: string }).OS = 'android';
    haptic.medium();
    (Platform as { OS: string }).OS = 'ios';
    haptic.medium();
    expect(impactAsync).toHaveBeenCalledTimes(2);
    expect(impactAsync).toHaveBeenNthCalledWith(1, 'medium');
    expect(impactAsync).toHaveBeenNthCalledWith(2, 'medium');
  });
});

describe('automatische Erkennungen – Drosselung', () => {
  it('feuert nicht bei jedem automatischen Update (Zeit-Gate)', () => {
    hapticAngle();   // erste Auslösung erlaubt
    hapticAngle();   // sofort danach → geblockt
    hapticAngle();   // ebenfalls geblockt
    expect(impactAsync).toHaveBeenCalledTimes(1);
    expect(impactAsync).toHaveBeenCalledWith('light');
  });
});
