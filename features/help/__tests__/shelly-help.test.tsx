import React from 'react';
import { Alert, Linking } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { HelpSheet } from '@/components/help/HelpSheet';
import { HELP_TOPICS, topicsByCategory } from '@/features/help/helpRegistry';
import i18n from '@/i18n/config';

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: jest.requireActual('react-native').View,
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

interface HelpTestNode {
  props: { children?: React.ReactNode; accessibilityRole?: string; onPress: () => Promise<void> };
}
interface HelpTestTree {
  root: {
    findAllByType(type: string): HelpTestNode[];
    findAll(predicate: (node: HelpTestNode) => boolean): HelpTestNode[];
  };
}
const topic = HELP_TOPICS.track_shelly;
let rendered: ReturnType<typeof TestRenderer.create> | undefined;
afterEach(async () => {
  if (rendered) await act(async () => { rendered!.unmount(); });
  rendered = undefined;
  jest.restoreAllMocks();
  await i18n.changeLanguage('de');
});

async function render(showDetails = true) {
  await act(async () => {
    rendered = TestRenderer.create(<HelpSheet visible topic={topic} onClose={() => {}} showDetails={showDetails} />);
  });
  return rendered as unknown as HelpTestTree;
}

it('is discoverable through the existing tracking help category', () => {
  expect(topicsByCategory('tracking')).toContain(topic);
});

it.each(['de', 'gsw', 'en', 'fr', 'it'])('shows the model and limitations in %s without untranslated keys', async (locale) => {
  await i18n.changeLanguage(locale);
  const tree = await render();
  const text = tree.root.findAllByType('Text').map(n => String(n.props.children)).join(' ');
  expect(text).toContain('Shelly BLU Button Tough 1 ZB');
  expect(text).toContain('BTHome');
  expect(text).toContain(i18n.t('help.shellyBody1'));
  expect(text).toContain(i18n.t('help.shellyBody3'));
  expect(text).not.toMatch(/help\.shelly/);
  expect(tree.root.findAll(n => n.props.accessibilityRole === 'link').length).toBeGreaterThan(0);
});

it('opens only the official product URL and reports an opening failure', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('offline'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const tree = await render();
  const link = tree.root.findAll(n => n.props.accessibilityRole === 'link')[0];
  await act(async () => { await link.props.onPress(); });
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith('https://www.shelly.com/de/products/shelly-blu-button-tough-1-zb-black');
  expect(alert).toHaveBeenCalledWith(i18n.t('common.error'), i18n.t('help.shellyLinkError'));
});

it('leaves existing topics and compact help without a product link', async () => {
  const tree = await render(false);
  expect(tree.root.findAll(n => n.props.accessibilityRole === 'link')).toHaveLength(0);
  expect(Object.values(HELP_TOPICS).filter(t => t.externalLink)).toEqual([topic]);
});
