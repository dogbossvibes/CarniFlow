import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { readFileSync } from 'fs';
import { TrainingRecommendationCard } from '@/components/calendar/TrainingRecommendationCard';

jest.mock('@/hooks/useTrainingFeed', () => ({
  useTrainingFeed: () => ({
    feed: [{
      id: 'f1',
      owner_id: 'u1',
      dog_id: 'd1',
      session_date: new Date(Date.now() - 16 * 86_400_000).toISOString(),
      started_at: null,
      ended_at: null,
      duration_sec: null,
      rating: null,
      score: null,
      notes: null,
      photos: [],
      videos: [],
      audio_files: [],
      motivation: null,
      konzentration: null,
      praezision: null,
      ausdauer: null,
      trieblage: null,
      impulskontrolle: null,
      shared_with_trainer: false,
      status: 'completed',
      created_at: new Date().toISOString(),
      dog: null,
      exercises: [],
      source: 'unit',
    }],
    loading: false,
    refresh: jest.fn(),
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

describe('TrainingRecommendationCard', () => {
  it('rendert lokale Empfehlungen ohne Crash', async () => {
    let tree: ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(<TrainingRecommendationCard events={[]} />);
    });
    expect(tree).toBeTruthy();
  });

  it('enthält keinen Edge-Function-Aufruf auf recommend', () => {
    const source = readFileSync('components/calendar/TrainingRecommendationCard.tsx', 'utf8');
    expect(source).not.toMatch(/functions\.invoke\(\s*['"]recommend['"]/);
    expect(source).not.toMatch(/@\/lib\/supabase/);
  });
});
