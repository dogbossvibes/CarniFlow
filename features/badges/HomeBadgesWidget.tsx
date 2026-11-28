import { useMemo } from 'react';
import type { FeedItem } from '@/services/trainingFeed';
import { BadgeWidget } from './components';
import { useBadges } from './useBadges';

/** Startseiten-Widget «Abzeichen». Nutzt Feed und Hunde der Startseite (keine Zusatzabfrage). */
export function HomeBadgesWidget({ feed, dogIds, onOpen }: { feed: readonly FeedItem[]; dogIds: readonly string[]; onOpen: () => void }) {
  const { summary, fresh, hasActivity } = useBadges({ feed, dogIds });
  const freshCount = useMemo(() => fresh.length, [fresh]);
  if (!hasActivity) return null;
  return <BadgeWidget summary={summary} freshCount={freshCount} onOpen={onOpen} />;
}
