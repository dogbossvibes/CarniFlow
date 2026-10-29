import React from 'react';
import { event as savedEvent } from '@/features/calendar/__tests__/fixture';
import { toDogAppointments } from '@/features/dogs/dashboard';
import { Alert } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
jest.setTimeout(30000);
const mockFinish = jest.fn(), mockUpsert = jest.fn(), mockCancelReminders = jest.fn();
let mockOwner = 'owner';
let mockEventId: string | undefined = 'event-a';
let mockLoading = true;
let mockEvents: { id: string; start_at: string; title: string }[] = [];
const mockSetParams = jest.fn();
const mockRouter = { setParams: mockSetParams, push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ useRouter: () => mockRouter, useLocalSearchParams: () => ({ eventId: mockEventId }), useFocusEffect: (fn: () => void) => { const R = jest.requireActual('react'); R.useEffect(fn, [fn]); } }));
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockOwner } } }) }));
jest.mock('@/hooks/useTrainingCalendar', () => ({ useTrainingCalendar: () => ({ events: mockEvents, loading: mockLoading, refresh: jest.fn(), upsert: mockUpsert, remove: jest.fn() }), nextEvent: () => null }));
jest.mock('@/hooks/useTrainerAppointments', () => ({ useTrainerAppointments: () => ({ pending: [], incoming: [] }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isTrainerModule: false }) }));
jest.mock('@/hooks/useFabBottom', () => ({ useFabBottom: () => 0 }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (k: string) => k }) }));
jest.mock('@/services/umfrageService', () => ({ getMyInvitations: async () => [] }));
jest.mock('@/services/calendarService', () => ({ deleteCalendarEvent: jest.fn(), updateCalendarEvent: jest.fn(), finishOwnCalendarEvent: (...args: unknown[]) => mockFinish(...args) }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn() } }));
jest.mock('@/lib/eventReminders', () => ({ cancelEventReminders: (...args: unknown[]) => mockCancelReminders(...args) }));
jest.mock('@/lib/deviceCalendar', () => ({ DEVICE_CALENDAR_AVAILABLE: false }));
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeArea' }));
for (const name of ['NextAppointmentCard','TrainingRecommendationCard','TrainerAppointmentCard','TrainerAppointmentRequest','RescheduleModal','TimelineView','WeekView','MonthView','EventActionsSheet','CreateEventModal']) {
 jest.doMock(`@/components/calendar/${name}`, () => ({ [name]: name }));
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Hub = require('@/app/training-hub').default;
let node: ReactTestRenderer;
beforeEach(() => { mockRouter.push.mockClear(); mockOwner='owner'; mockFinish.mockReset();mockUpsert.mockClear();mockCancelReminders.mockReset().mockResolvedValue(undefined); mockEventId = 'event-a'; mockLoading = true; mockEvents = []; mockSetParams.mockClear(); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => { act(() => node?.unmount()); jest.restoreAllMocks(); });
async function render() { await act(async () => { node = TestRenderer.create(<Hub />); }); }
it('waits for authorized calendar data, then opens the exact appointment once', async () => {
 await render(); expect(mockSetParams).not.toHaveBeenCalled();
 const event = { id:'event-a', start_at:'2026-10-25T09:41:00Z', title:'UO / Fährte' };
 mockEvents = [event]; mockLoading = false;
 await act(async () => { node.update(<Hub />); });
 const sheet = node.root.findAll(n => (n as unknown as {type:unknown}).type === 'EventActionsSheet')[0];
 expect(sheet.props.event).toBe(event); expect(sheet.props.visible).toBe(true);
 expect(mockSetParams).toHaveBeenCalledTimes(1);
 await act(async () => { node.update(<Hub />); }); expect(mockSetParams).toHaveBeenCalledTimes(1);
});
it('does not open missing or inaccessible IDs and reports unavailable instead', async () => {
 mockLoading = false; mockEvents = [{ id:'other', title:'Other', start_at:'2026-10-25' }]; await render();
 expect(node.root.findAll(n => (n as unknown as {type:unknown}).type === 'EventActionsSheet')).toHaveLength(0);
 expect(Alert.alert).toHaveBeenCalledWith('common.error','calendar.entryUnavailable');
});

it.each(['completed','cancelled'] as const)('explicitly confirms %s, updates the same record, removes reminders and no longer projects overdue', async status=>{
 mockOwner='owner-a';mockEventId=savedEvent.id;mockLoading=false;mockEvents=[savedEvent];
 mockFinish.mockResolvedValue({data:{...savedEvent,status},error:null});await render();
 const sheet=node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0];
 act(()=>{(status==='completed'?sheet.props.onComplete:sheet.props.onCancelEvent)();});
 expect(mockFinish).not.toHaveBeenCalled();
 const confirm=(Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress;
 await act(async()=>{await confirm();});
 expect(mockFinish).toHaveBeenCalledWith('owner-a',savedEvent,status);
 expect(mockUpsert).toHaveBeenCalledWith({...savedEvent,status});expect(mockCancelReminders).toHaveBeenCalledWith(savedEvent.id);
 expect(toDogAppointments([{...savedEvent,status}], 'dog-a')).toEqual([]);
});
it('retains the open record and overdue state when server save fails, without cancelling reminders', async()=>{
 mockOwner='owner-a';mockEventId=savedEvent.id;mockLoading=false;mockEvents=[savedEvent];
 mockFinish.mockResolvedValue({data:null,error:{message:'offline'}});await render();
 act(()=>node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0].props.onComplete());
 const confirm=(Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress;
 await act(async()=>{await confirm();});
 expect(mockUpsert).not.toHaveBeenCalled();expect(mockCancelReminders).not.toHaveBeenCalled();
 expect(node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0].props.visible).toBe(true);
});
it('ignores a stale confirmation after the account changes',async()=>{
 mockOwner='owner-a';mockEventId=savedEvent.id;mockLoading=false;mockEvents=[savedEvent];await render();
 act(()=>node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0].props.onComplete());
 const confirm=(Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress;
 mockOwner='other';await act(async()=>{node.update(<Hub/>);});await act(async()=>{await confirm();});
 expect(mockFinish).not.toHaveBeenCalled();
});

it('opens a health-linked appointment in its health record through the existing sheet dismissal flow',async()=>{
 const linked={...savedEvent,source_type:'health_vaccination',source_id:'vaccination'};
 mockOwner='owner-a';mockEventId=linked.id;mockLoading=false;mockEvents=[linked];await render();
 const sheet=node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0];
 act(()=>sheet.props.onOpenSource());
 const current=node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0];
 if(current)act(()=>current.props.onDismiss());
 expect(mockRouter.push).toHaveBeenCalledWith('/dog-health-record/dog-a');expect(mockFinish).not.toHaveBeenCalled();
});

it('serializes double confirmation so the same status action is saved only once',async()=>{
 mockOwner='owner-a';mockEventId=savedEvent.id;mockLoading=false;mockEvents=[savedEvent];
 let finish!:(value:unknown)=>void;mockFinish.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await render();
 act(()=>node.root.findAll(n=>(n as unknown as {type:unknown}).type==='EventActionsSheet')[0].props.onComplete());
 const confirm=(Alert.alert as jest.Mock).mock.calls.at(-1)[2][1].onPress;let first!:Promise<void>;
 act(()=>{first=confirm();void confirm();});expect(mockFinish).toHaveBeenCalledTimes(1);
 await act(async()=>{finish({data:{...savedEvent,status:'completed'},error:null});await first;});
 expect(mockUpsert).toHaveBeenCalledTimes(1);
});
