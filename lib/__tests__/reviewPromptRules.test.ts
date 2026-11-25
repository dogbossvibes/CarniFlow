import {
  decideReviewPrompt, sanitizeReviewState, parseFirstLaunch,
  EMPTY_REVIEW_STATE, type ReviewContext, type ReviewPromptState,
} from '../reviewPromptRules';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 25, 12);

const ready: ReviewPromptState = { successfulSaves: 3, lastPromptAt: null, lastPromptVersion: null, countedIds: [] };
const ctx = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  now: NOW, firstLaunchAt: NOW - 8 * DAY, appVersion: '1.0.9', trackingActive: false, outcome: 'success', ...over,
});

describe('decideReviewPrompt', () => {
  it('fragt, wenn alle Bedingungen erfüllt sind', () => {
    expect(decideReviewPrompt(ready, ctx())).toEqual({ ask: true });
  });

  describe('Anzahl gespeicherter Fährten/Einheiten', () => {
    it.each([0, 1, 2])('nicht bei %i gespeicherten', (n) => {
      expect(decideReviewPrompt({ ...ready, successfulSaves: n }, ctx()))
        .toEqual({ ask: false, reason: 'too-few-saves' });
    });
    it.each([3, 4, 25])('ja bei %i gespeicherten', (n) => {
      expect(decideReviewPrompt({ ...ready, successfulSaves: n }, ctx()).ask).toBe(true);
    });
  });

  describe('erster Start mindestens 7 Tage her', () => {
    it('nicht nach 6 Tagen und 23 Stunden', () => {
      expect(decideReviewPrompt(ready, ctx({ firstLaunchAt: NOW - 7 * DAY + 60 * 60 * 1000 })))
        .toEqual({ ask: false, reason: 'too-early' });
    });
    it('ja nach genau 7 Tagen', () => {
      expect(decideReviewPrompt(ready, ctx({ firstLaunchAt: NOW - 7 * DAY })).ask).toBe(true);
    });
    it('nicht, wenn der erste Start unbekannt ist', () => {
      expect(decideReviewPrompt(ready, ctx({ firstLaunchAt: null })))
        .toEqual({ ask: false, reason: 'first-launch-unknown' });
    });
  });

  describe('pro Version einmal, mindestens 90 Tage Abstand', () => {
    it('nicht zweimal in derselben Version, auch nach 90+ Tagen', () => {
      const s = { ...ready, lastPromptAt: NOW - 200 * DAY, lastPromptVersion: '1.0.9' };
      expect(decideReviewPrompt(s, ctx())).toEqual({ ask: false, reason: 'already-asked-this-version' });
    });
    it('nicht in neuer Version, wenn die letzte Abfrage unter 90 Tagen liegt', () => {
      const s = { ...ready, lastPromptAt: NOW - 89 * DAY, lastPromptVersion: '1.0.8' };
      expect(decideReviewPrompt(s, ctx())).toEqual({ ask: false, reason: 'asked-recently' });
    });
    it('ja in neuer Version nach 90 Tagen', () => {
      const s = { ...ready, lastPromptAt: NOW - 90 * DAY, lastPromptVersion: '1.0.8' };
      expect(decideReviewPrompt(s, ctx()).ask).toBe(true);
    });
    it('nicht, wenn die App-Version unbekannt ist', () => {
      expect(decideReviewPrompt(ready, ctx({ appVersion: null })))
        .toEqual({ ask: false, reason: 'version-unknown' });
    });
  });

  it('nicht während Legen, Liegezeit oder Absuche', () => {
    expect(decideReviewPrompt(ready, ctx({ trackingActive: true })))
      .toEqual({ ask: false, reason: 'tracking-active' });
  });

  it.each(['error', 'cancelled'] as const)('nicht nach %s', (outcome) => {
    expect(decideReviewPrompt(ready, ctx({ outcome }))).toEqual({ ask: false, reason: 'not-success' });
  });
});

describe('sanitizeReviewState', () => {
  it('liefert Leerwerte bei fehlendem oder kaputtem Stand', () => {
    expect(sanitizeReviewState(null)).toEqual(EMPTY_REVIEW_STATE);
    expect(sanitizeReviewState('x')).toEqual(EMPTY_REVIEW_STATE);
    expect(sanitizeReviewState({ successfulSaves: -2, lastPromptAt: 'gestern', lastPromptVersion: 5, countedIds: [1, ''] }))
      .toEqual(EMPTY_REVIEW_STATE);
  });
  it('übernimmt gültige Werte', () => {
    const s = { successfulSaves: 4, lastPromptAt: NOW, lastPromptVersion: '1.0.9', countedIds: ['a', 'b'] };
    expect(sanitizeReviewState(s)).toEqual(s);
  });
});

describe('parseFirstLaunch', () => {
  it('liest gültige Zeitstempel und verwirft den Rest', () => {
    expect(parseFirstLaunch(String(NOW))).toBe(NOW);
    expect(parseFirstLaunch(null)).toBeNull();
    expect(parseFirstLaunch('abc')).toBeNull();
    expect(parseFirstLaunch('0')).toBeNull();
  });
});
