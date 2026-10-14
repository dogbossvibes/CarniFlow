import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSession } from '@/hooks/useSession';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';
import { getCalendarEvents } from '@/services/calendarService';
import { getDogs } from '@/services/dogs';
import { addNetListener, fetchIsOnline } from '@/features/sync/services/netinfo';
import { dailyWidgetTransport } from '@/modules/anyvo-daily-widget';
import { createDailyWidgetPublisher } from './dailyWidgetPublisher';
import { DAILY_WIDGET_MAX_DOGS, DAILY_WIDGET_MAX_ITEMS, type WidgetOwnedDog, type WidgetCalendarSource } from './dailyWidgetSnapshot';
import { subscribeDailyWidgetDataChanged } from './dailyWidgetRefresh';

async function readWidgetData(ownerId: string) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const [dogs, events] = await Promise.all([
    getDogs(ownerId).select('id,name,owner_id').limit(DAILY_WIDGET_MAX_DOGS + 1),
    getCalendarEvents(ownerId).select('id,owner_id,dog_id,dog_ids,type,types,start_at,end_at,status,source_type')
      .eq('owner_id', ownerId).in('status', ['confirmed', 'pending'])
      .or(`start_at.gte.${from.toISOString()},end_at.gt.${new Date().toISOString()}`).limit(DAILY_WIDGET_MAX_ITEMS + 1),
  ]);
  if (dogs.error || events.error) throw new Error('Widget data unavailable');
  return {
    dogs: (dogs.data ?? []) as WidgetOwnedDog[], events: (events.data ?? []) as WidgetCalendarSource[],
    truncated: (dogs.data?.length ?? 0) > DAILY_WIDGET_MAX_DOGS || (events.data?.length ?? 0) > DAILY_WIDGET_MAX_ITEMS,
  };
}

function SupportedDailyWidgetSync() {
  const { session, loading } = useSession();
  const ownerId = session?.user.id ?? null;
  useEffect(() => {
    if (loading || !dailyWidgetTransport) return;
    const publisher = createDailyWidgetPublisher({ transport: dailyWidgetTransport, read: readWidgetData, online: fetchIsOnline });
    publisher.setIdentity(ownerId);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      // Synchronous invalidation in the auth callback, before React rerenders.
      publisher.setIdentity(next?.user.id ?? null);
    });
    const appListener = AppState.addEventListener('change', state => { if (state === 'active') void publisher.refresh(); });
    const netOff = addNetListener(s => { if (s.online) void publisher.refresh(); });
    const dataOff = subscribeDailyWidgetDataChanged(() => publisher.invalidate());
    // Calendar edits already invalidate/refetch these queries. Coalesce native
    // refreshes; do not add a polling timer or mutate the existing query cache.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const queryOff = queryClient.getQueryCache().subscribe(event => {
      if (event.type !== 'updated' || !['calendar', 'dogs'].includes(String(event.query.queryKey[0]))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void publisher.refresh(); }, 500);
    });
    return () => {
      publisher.dispose(); subscription.unsubscribe(); appListener.remove(); netOff(); queryOff(); dataOff();
      if (timer) clearTimeout(timer);
    };
  }, [ownerId, loading]);
  return null;
}

export function DailyWidgetSync() {
  if (!dailyWidgetTransport) return null;
  try { if (!dailyWidgetTransport.isAvailable()) return null; } catch { return null; }
  return <SupportedDailyWidgetSync />;
}
