import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDogById, updateDog } from '@/services/dogs';
import { createDogTrackSettingsStore, type DogRow } from './store';

export * from './model';

export const dogTrackSettingsStore = createDogTrackSettingsStore({
  storage: AsyncStorage,
  async fetchDog(dogId) {
    const { data, error } = await getDogById(dogId);
    if (error) throw error;
    return (data ?? null) as DogRow | null;
  },
  async writeDog(dogId, trackSettings) {
    const { error } = await updateDog(dogId, { track_settings: trackSettings });
    if (error) throw error;
  },
});
