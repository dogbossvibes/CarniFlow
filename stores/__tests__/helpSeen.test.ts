jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { keyForUser, sanitizeSeen } from '@/stores/helpSeen';
import {
  GUIDED_TOUR,
  HELP_CATEGORY_ORDER,
  HELP_TOPICS,
  topicsByCategory,
  type HelpTopicId,
} from '@/features/help/helpRegistry';

describe('helpRegistry — Themen & Rundgang', () => {
  // 4) Help-Center zeigt alle Kategorien; jedes Thema hat Titel + Kurztext
  it('4) jede Kategorie hat Themen, jedes Thema Titel+Kurztext', () => {
    for (const cat of HELP_CATEGORY_ORDER) {
      const topics = topicsByCategory(cat);
      expect(topics.length).toBeGreaterThan(0);
      for (const t of topics) {
        expect(t.title.length).toBeGreaterThan(0);
        expect(t.shortDescription.length).toBeGreaterThan(0);
        expect(t.category).toBe(cat);
      }
    }
    // jedes Registry-Thema fällt in eine bekannte Kategorie
    for (const t of Object.values(HELP_TOPICS)) {
      expect(HELP_CATEGORY_ORDER).toContain(t.category);
    }
  });

  // 5) „ANYVO kennenlernen" durchläuft mehrere Schritte
  it('5) geführter Rundgang hat 6 Schritte mit Titel+Text', () => {
    expect(GUIDED_TOUR.length).toBe(6);
    for (const step of GUIDED_TOUR) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.text.length).toBeGreaterThan(0);
    }
  });

  // 14) Smart Analyse deterministisch beschrieben, keine KI erwähnt
  it('14) keine KI-Erwähnung in Hilfetexten; Smart Analyse = deterministisch', () => {
    const blob = Object.values(HELP_TOPICS)
      .map((t) => `${t.title} ${t.shortDescription} ${(t.body ?? []).join(' ')}`)
      .join(' ')
      .toLowerCase();
    expect(blob).not.toMatch(/\bki\b/);
    expect(blob).not.toContain('künstliche intelligenz');
    expect(blob).not.toContain(' ai ');
    expect(HELP_TOPICS.smart_analysis.shortDescription).toContain('deterministisch');
  });
});

describe('helpSeen — gesehen-Status (sanitize & Key)', () => {
  // 16) beschädigter/leerer Help-State fällt sicher auf Default (leer) zurück
  it('15+16) fehlender/beschädigter State → leeres Array, keine ungültigen IDs', () => {
    expect(sanitizeSeen(null)).toEqual([]);
    expect(sanitizeSeen(undefined)).toEqual([]);
    expect(sanitizeSeen('kaputt')).toEqual([]);
    expect(sanitizeSeen({})).toEqual([]);
    expect(sanitizeSeen(['home', 'ghost', 'home', 'track_laying'])).toEqual(['home', 'track_laying']);
  });

  // 6+7) Nutzertrennung über den Storage-Key
  it('6+7) Storage-Key ist pro Nutzer getrennt', () => {
    expect(keyForUser('a')).toBe('help_seen_topics:a');
    expect(keyForUser('b')).toBe('help_seen_topics:b');
    expect(keyForUser('a')).not.toBe(keyForUser('b'));
    expect(keyForUser(null)).toBe('help_seen_topics:anon');
  });

  // 1+2+8) markHelpSeen persistiert, Reset leert — pro Nutzer isoliert
  it('1+2+8) markieren/lesen/zurücksetzen isoliert pro Nutzer', async () => {
    // Store dynamisch laden, um Modul-State pro Test frisch zu halten
    jest.resetModules();
    const mod = require('@/stores/helpSeen');
    const seenKey = mod.keyForUser('user-a');

    await AsyncStorage.setItem(seenKey, JSON.stringify(['home' as HelpTopicId]));
    const loaded = mod.sanitizeSeen(JSON.parse((await AsyncStorage.getItem(seenKey)) as string));
    expect(loaded).toEqual(['home']);

    // Nutzer B unberührt
    const keyB = mod.keyForUser('user-b');
    expect(await AsyncStorage.getItem(keyB)).toBeNull();
  });
});
