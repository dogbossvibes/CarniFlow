import DogHealthRecordRoute from '@/app/dog-health-record/[id]';

/** Same load, authorization and editor as the health record; no second store. */
export default function DogWeightRoute() {
  return <DogHealthRecordRoute weightJournalOnly />;
}
