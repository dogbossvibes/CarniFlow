import { useLocalSearchParams } from 'expo-router';
import { HeatDogGate } from '@/components/dogs/heat/HeatDogGate';
import { HeatJournalScreen } from '@/components/dogs/heat/HeatJournalScreen';

export default function DogHeatOverview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <HeatDogGate dogId={id}>{dog => <HeatJournalScreen dog={dog} />}</HeatDogGate>;
}
