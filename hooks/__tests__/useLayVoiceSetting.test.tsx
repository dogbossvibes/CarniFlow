// Sprachausgabe beim Legen — Ein/Aus-Präferenz.
// Default AUS, persistent über App-Neustarts (AsyncStorage, dasselbe Muster
// wie useAutoDetectSetting). Gilt ausdrücklich NUR fürs Legen.
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLayVoiceSetting } from '@/hooks/useLayVoiceSetting';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const STORAGE_KEY = 'track_lay_voice';

type Api = ReturnType<typeof useLayVoiceSetting>;
function Harness({ onReady }: { onReady: (api: Api) => void }) {
  onReady(useLayVoiceSetting());
  return null;
}

// Simuliert einen App-Start: frische Komponente, AsyncStorage bleibt erhalten.
async function mountFresh(): Promise<{ get: () => Api; unmount: () => void }> {
  let api!: Api;
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(<Harness onReady={(a) => { api = a; }} />);
    await Promise.resolve();
  });
  return { get: () => api, unmount: () => act(() => { renderer.unmount(); }) };
}

describe('useLayVoiceSetting', () => {
  beforeEach(async () => { await AsyncStorage.clear(); });

  it('Default ohne gespeicherte Präferenz: AUS', async () => {
    const h = await mountFresh();
    expect(h.get().enabled).toBe(false);
    expect(h.get().loaded).toBe(true);
    h.unmount();
  });

  it('EIN schalten → App-Neustart → weiterhin EIN', async () => {
    const first = await mountFresh();
    await act(async () => { await first.get().setEnabled(true); });
    expect(first.get().enabled).toBe(true);
    first.unmount();

    // Neuer App-Start (neue Komponente, gleicher Speicher).
    const second = await mountFresh();
    expect(second.get().enabled).toBe(true);
    second.unmount();
  });

  it('AUS schalten → App-Neustart → bleibt AUS', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, 'true');
    const first = await mountFresh();
    expect(first.get().enabled).toBe(true);
    await act(async () => { await first.get().setEnabled(false); });
    first.unmount();

    const second = await mountFresh();
    expect(second.get().enabled).toBe(false);
    second.unmount();
  });

  it('schreibt unter einem eigenen Schlüssel — fremde Einstellungen bleiben unberührt', async () => {
    await AsyncStorage.setItem('track_auto_detect', 'false');   // Winkel-Erkennung
    const h = await mountFresh();
    await act(async () => { await h.get().setEnabled(true); });
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(await AsyncStorage.getItem('track_auto_detect')).toBe('false');   // unverändert
    h.unmount();
  });
});
