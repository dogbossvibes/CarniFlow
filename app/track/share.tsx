import { Redirect, useLocalSearchParams } from 'expo-router';
import ExchangeScreen from '@/features/tracking-exchange/ExchangeScreen';
/** Preserve native file/task deep links; the old unqualified landing opens the new hub. */
export default function TrackShareRoute() {
  const params = useLocalSearchParams<{ sourceId?: string; taskId?: string; incoming?: string; mode?: string; importNotice?: string }>();
  if (!params.taskId && !params.incoming && !params.mode && !params.importNotice) {
    return <Redirect href={{ pathname: '/track/sharing', params: typeof params.sourceId === 'string' ? { sourceId: params.sourceId } : {} } as never} />;
  }
  return <ExchangeScreen />;
}
