// T-184 ESLint-Fix (react-hooks/set-state-in-effect, react-hooks/purity):
// Sprachmemo-Wiedergabe im Trainingsdetail. Hält fest, dass das Ende der
// Wiedergabe die Anzeige zurücksetzt und die lokale Kopie genau einmal löscht.
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import UnitDetailScreen from '@/app/unit/detail';

let mockStatus = { didJustFinish: false };
const mockPlayer = { playing: false, pause: jest.fn(), play: jest.fn(), replace: jest.fn() };
const mockDelete = jest.fn();
const mockDownload = jest.fn();

jest.mock('expo-audio', () => ({ useAudioPlayer: () => mockPlayer, useAudioPlayerStatus: () => mockStatus }));
jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'cache/',
  deleteAsync: (...args: unknown[]) => mockDelete(...args),
  downloadAsync: (...args: unknown[]) => mockDownload(...args),
}));
jest.mock('expo-video', () => ({ VideoView: () => null, useVideoPlayer: () => ({ replace: jest.fn() }) }));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'unit-1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('react-native-gesture-handler', () => ({ GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/components/ui/KeyboardAwareScrollView', () => {
  const { ScrollView } = jest.requireActual('react-native');
  return { KeyboardAwareScrollView: ScrollView };
});
jest.mock('@/lib/greetingAudioSafety', () => ({ setAppAudioModeAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/components/ui/Glass', () => ({ Glass: () => null, GlassIconButton: () => null, isGlass: false }));
jest.mock('@/components/ui/SignedImage', () => ({ SignedImage: () => null }));
jest.mock('@/components/ui/ZoomableImage', () => ({ ZoomableImage: () => null }));
jest.mock('@/hooks/useSignedUrl', () => ({ useSignedUrl: () => null }));
jest.mock('@/lib/mediaUrl', () => ({ signMediaUrl: (url: string) => Promise.resolve(`signed:${url}`) }));
jest.mock('@/components/training/HeroImage', () => ({ HeroImage: ({ children }: { children?: React.ReactNode }) => children }));
jest.mock('@/components/training/CommentThread', () => ({ CommentThread: () => null }));
jest.mock('@/features/ai/components/SmartFeedbackSection', () => ({ SmartFeedbackSection: () => null }));
jest.mock('@/features/voice/components/VoiceNotesList', () => ({ VoiceNotesList: () => null }));
jest.mock('@/features/training/trackLinks/components/LinkedTracksCard', () => ({ LinkedTracksCard: () => null }));
jest.mock('@/features/training/trackLinks/store', () => ({ forgetUnitLinks: jest.fn(async () => {}) }));
jest.mock('@/features/voice/components/VoiceRecorderCard', () => ({ VoiceRecorderCard: () => null }));
jest.mock('@/features/voice/hooks/useVoiceNotes', () => ({ useVoiceNotes: () => ({ notes: [], loading: false, refresh: jest.fn() }) }));
jest.mock('@/services/trainingUnitService', () => ({
  getTrainingUnitById: () => Promise.resolve({ data: {
    id: 'unit-1', owner_id: 'owner-1', dog_id: 'dog-1', status: 'completed', session_date: '2026-11-10',
    exercises: [], photos: [], videos: [], audio_files: [{ url: 'audio/a.m4a', duration: '0:12' }],
  }, error: null }),
  deleteTrainingUnit: jest.fn(),
}));
jest.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: jest.fn() } }));
jest.mock('@/lib/haptics', () => ({ tapHaptic: jest.fn() }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));

const playIcons = (node: ReactTestRenderer) =>
  node.root.findAll(n => (n.type as unknown) === 'Ionicons' && ['play', 'pause'].includes(n.props.name)).map(n => n.props.name);

it('resets the play button and deletes the local copy once when playback finishes', async () => {
  mockDownload.mockResolvedValue({ status: 200, uri: 'cache/local-memo.mp4' });
  let node!: ReactTestRenderer;
  await act(async () => { node = TestRenderer.create(<UnitDetailScreen />); });
  expect(playIcons(node)).toEqual(['play']);

  const button = node.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => (c.type as unknown) === 'Ionicons' && c.props.name === 'play').length > 0)[0];
  await act(async () => { await button.props.onPress(); });
  expect(playIcons(node)).toEqual(['pause']);
  expect(mockDownload).toHaveBeenCalledWith('signed:audio/a.m4a', expect.stringMatching(/^cache\/memo_0_\d+\.mp4$/));
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);

  mockStatus = { didJustFinish: true };
  await act(async () => { node.update(<UnitDetailScreen />); });
  expect(playIcons(node)).toEqual(['play']);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  expect(mockDelete).toHaveBeenCalledWith('cache/local-memo.mp4', { idempotent: true });

  mockStatus = { didJustFinish: false };
  await act(async () => { node.update(<UnitDetailScreen />); });
  expect(playIcons(node)).toEqual(['play']);
  expect(mockDelete).toHaveBeenCalledTimes(1);
  act(() => node.unmount());
});
