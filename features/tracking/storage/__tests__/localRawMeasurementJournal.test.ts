import AsyncStorage from '@react-native-async-storage/async-storage';
import { openLocalRawMeasurementJournal } from '../localRawMeasurementJournal';
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
it('writes through the existing local storage adapter and reopens without an index', async () => {
  await AsyncStorage.clear();
  const journal = openLocalRawMeasurementJournal('account', 'track');
  await journal.append({ measuredAtMs: 1, receivedAtMs: 2, latitude: 47, longitude: 8,
    accuracy: 3, altitude: null, speed: null, heading: null, source: 'expo', delivery: 'background' });
  expect((await openLocalRawMeasurementJournal('account', 'track').read()).records).toHaveLength(1);
  await journal.remove();
  expect((await journal.read()).state).toBe('absent');
});
