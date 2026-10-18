import { deCH } from '@/i18n/de-CH';
import { gswCH } from '@/i18n/gsw-CH';
import { en } from '@/i18n/locales/en';
import { fr } from '@/i18n/locales/fr';
import { it as italian } from '@/i18n/locales/it';
import { FIRST_STEP_TOPICS, GUIDED_TOUR_KEY, HELP_TOPICS, HELP_TOPIC_BODY_KEYS, HELP_TOPIC_RELATED, HELP_TOPIC_SHORT_KEY, HELP_TOPIC_TITLE_KEY } from '../helpRegistry';

const keys = new Set([
  ...Object.values(HELP_TOPIC_TITLE_KEY), ...Object.values(HELP_TOPIC_SHORT_KEY),
  ...Object.values(HELP_TOPIC_BODY_KEYS).flatMap(value => value ?? []), ...GUIDED_TOUR_KEY.flatMap(step => [step.titleKey, step.textKey]),
  'help.detailsShow', 'help.detailsHide', 'help.relatedTopics', 'help.skip', 'help.faqGpsQuestion', 'help.faqTrainingAnswer', 'help.tourSub',
  'help.trackGroupsReady', 'help.trackGroupsUnavailable', 'help.tourA11y', 'help.titleA11y',
]);
const placeholders = (value: string) => [...value.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).sort();

it.each(Object.entries({ de: deCH, gsw: gswCH, en, fr, it: italian }))('has explicit help text and matching placeholders in %s', (_locale, dictionary) => {
  const locale = dictionary as Record<string, string>, base = deCH as Record<string, string>;
  for (const key of keys) {
    expect(typeof locale[key]).toBe('string');
    expect(locale[key]?.trim().length).toBeGreaterThan(0);
    expect(placeholders(locale[key])).toEqual(placeholders(base[key]));
  }
});

it('keeps first steps and every related topic in the existing registry', () => {
  expect(FIRST_STEP_TOPICS).toEqual(['add_dog', 'document_training', 'track_laying']);
  for (const [id, related] of Object.entries(HELP_TOPIC_RELATED)) {
    expect(new Set(related).size).toBe(related.length);
    for (const topic of related) { expect(HELP_TOPICS[topic]).toBeDefined(); expect(topic).not.toBe(id); }
  }
});

it('does not advertise group availability when the actual release gate is off', () => {
  jest.isolateModules(() => {
    jest.doMock('@/features/tracking-exchange/groups/releaseGate', () => ({ GROUP_DISTRACTION_RELEASE_READY: false }));
    const registry = jest.requireActual<typeof import('../helpRegistry')>('../helpRegistry');
    expect(registry.HELP_TOPIC_BODY_KEYS.track_together).toContain('help.trackGroupsUnavailable');
    expect(registry.HELP_TOPIC_BODY_KEYS.track_together).not.toContain('help.trackGroupsReady');
  });
  jest.dontMock('@/features/tracking-exchange/groups/releaseGate');
});

it('keeps uncertainty and body-position limits rather than precision or pocket guarantees', () => {
  expect(deCH['help.trackGpsShort']).toContain('Schätzung');
  expect(deCH['help.trackGpsBody2']).toContain('nicht bei jedem Handy immer schlechter');
  expect(deCH['help.trackGpsBody2']).toContain('Empfehlung');
  expect(deCH['help.trackGpsBody3']).toContain('keine feste Wartezeit');
  expect(deCH['help.trackLayingBody1']).not.toContain('genau dort');
  expect(deCH['help.trackTogetherVersions']).toContain('In manchen Android-Versionen');
  expect(deCH['help.trackTogetherVersions']).toContain('keine verfügbare Absuche');
});
