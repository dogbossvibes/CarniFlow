import Hub from '@/app/training-hub';
import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, TouchableOpacity } from 'react-native';
import { event as mockEvent } from '@/features/calendar/__tests__/fixture';
let mockUser = 'owner-a';
const mockRefresh = jest.fn(), mockUpsert = jest.fn(), mockRemove = jest.fn(), mockDelete = jest.fn(), mockCancelReminders = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/hooks/useTrainingCalendar', () => ({ useTrainingCalendar: () => ({ events: [mockEvent], loading: false, refresh: mockRefresh, upsert: mockUpsert, remove: mockRemove }), nextEvent: () => mockEvent }));
jest.mock('@/hooks/useTrainerAppointments', () => ({ useTrainerAppointments: () => ({ pending: [], incoming: [], accept: jest.fn(), decline: jest.fn() }) }));
jest.mock('@/hooks/useCapabilities', () => ({ useCapabilities: () => ({ isTrainerModule: false }) }));
jest.mock('@/hooks/useFabBottom', () => ({ useFabBottom: () => 20 }));
jest.mock('@/lib/haptics', () => ({ haptic: { light: jest.fn() } }));
jest.mock('@/services/umfrageService', () => ({ getMyInvitations: async () => [] }));
jest.mock('@/services/calendarService', () => ({ deleteOwnCalendarEvent: (...args: unknown[]) => mockDelete(...args), updateCalendarEvent: jest.fn() }));
jest.mock('@/lib/eventReminders', () => ({ cancelEventReminders: (...args: unknown[]) => mockCancelReminders(...args) }));
jest.mock('@/lib/deviceCalendar', () => ({ DEVICE_CALENDAR_AVAILABLE: true, addEventToDeviceCalendar: jest.fn() }));
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useFocusEffect: (fn: () => void) => { const R=jest.requireActual('react');R.useEffect(fn,[fn]); }, useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('../NextAppointmentCard', () => ({ NextAppointmentCard: 'Next' }));
jest.mock('../TrainingRecommendationCard', () => ({ TrainingRecommendationCard: 'Recommendation' }));
jest.mock('../TrainerAppointmentCard', () => ({ TrainerAppointmentCard: 'TrainerCard' }));
jest.mock('../TrainerAppointmentRequest', () => ({ TrainerAppointmentRequest: 'Request' }));
jest.mock('../RescheduleModal', () => ({ RescheduleModal: 'Reschedule' }));
jest.mock('../TimelineView', () => ({ TimelineView: 'Timeline' }));
jest.mock('../WeekView', () => ({ WeekView: 'Week' }));
jest.mock('../MonthView', () => ({ MonthView: 'Month' }));
jest.mock('../CreateEventModal', () => ({ CreateEventModal: 'Editor' }));
jest.mock('../EventActionsSheet', () => ({ EventActionsSheet: 'Actions' }));
let node: ReactTestRenderer;
const root = () => node.root as typeof node.root & { findAllByType(type: unknown): (typeof node.root)[] };
beforeEach(async () => { jest.clearAllMocks(); mockUser = 'owner-a'; await act(async () => { node = TestRenderer.create(<Hub />); }); });
afterEach(() => { act(() => node.unmount()); });
it.each(['Next', 'Timeline', 'Week', 'Month'])('opens the same editor from %s and refreshes every calendar projection after save', async source => {
  if (source === 'Week' || source === 'Month') {
    const text = source === 'Week' ? 'Woche' : 'Monat';
    const button = root().findAllByType(TouchableOpacity).find(n => n.findAll(child => child.props.children === text).length)!;
    act(() => button.props.onPress());
  }
  const card = node.root.findByType(source as never);
  act(() => (source === 'Next' ? card.props.onPress : card.props.onEventPress)(mockEvent));
  act(() => node.root.findByType('Actions' as never).props.onEdit());
  if (root().findAllByType('Actions' as never).length) act(() => node.root.findByType('Actions' as never).props.onDismiss());
  const editor = node.root.findByType('Editor' as never);
  expect(editor.props.event).toEqual(mockEvent); expect(editor.props.visible).toBe(true);
  act(() => editor.props.onCreated({ ...mockEvent, title: 'edited' }));
  expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ id: mockEvent.id, title: 'edited' }));
  expect(mockRefresh).toHaveBeenCalled();
});
it('clears an open editor when the account changes', async () => {
  act(() => node.root.findByType('Next' as never).props.onPress(mockEvent));
  act(() => node.root.findByType('Actions' as never).props.onEdit());
  if (root().findAllByType('Actions' as never).length) act(() => node.root.findByType('Actions' as never).props.onDismiss());
  mockUser = 'owner-b'; await act(async () => { node.update(<Hub />); });
  expect(node.root.findByType('Editor' as never).props.visible).toBe(false);
});


describe('appointment deletion from the opened calendar action sheet', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert=jest.spyOn(Alert,'alert').mockImplementation(()=>{});
    mockDelete.mockReset().mockResolvedValue({data:{id:mockEvent.id},error:null});
    mockCancelReminders.mockReset().mockResolvedValue(undefined);
  });
  afterEach(()=>alert.mockRestore());
  function askDelete() {
    act(()=>node.root.findByType('Next' as never).props.onPress(mockEvent));
    act(()=>node.root.findByType('Actions' as never).props.onDelete());
    return alert.mock.calls[0][2].find((button: {style?:string})=>button.style==='destructive').onPress;
  }
  it('asks first and removes only the confirmed appointment and its reminders after server success', async()=>{
    const confirm=askDelete();
    expect(alert.mock.calls[0][1]).toContain(mockEvent.title);
    expect(mockDelete).not.toHaveBeenCalled(); expect(mockRemove).not.toHaveBeenCalled();
    await act(async()=>{await confirm();});
    expect(mockDelete).toHaveBeenCalledWith('owner-a',mockEvent);
    expect(mockRemove).toHaveBeenCalledWith(mockEvent.id);
    expect(mockCancelReminders).toHaveBeenCalledWith(mockEvent.id);
    expect(mockRefresh).toHaveBeenCalled();
  });
  it.each([{data:null,error:null},{data:null,error:{message:'denied'}}])('retains the appointment and reminders on failed/unconfirmed deletion',async response=>{
    mockDelete.mockResolvedValue(response);
    const confirm=askDelete(); await act(async()=>{await confirm();});
    expect(mockRemove).not.toHaveBeenCalled(); expect(mockCancelReminders).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(2);
    expect(node.root.findByType('Actions' as never).props.busy).toBe(false);
  });
  it('prevents duplicate deletion while the request is pending',async()=>{
    let resolve!: (value:unknown)=>void;
    mockDelete.mockReturnValue(new Promise(r=>{resolve=r;}));
    const confirm=askDelete();
    let pending!: Promise<void>;
    act(()=>{pending=confirm();});
    expect(node.root.findByType('Actions' as never).props.busy).toBe(true);
    await act(async()=>{await confirm();}); expect(mockDelete).toHaveBeenCalledTimes(1);
    await act(async()=>{resolve({data:{id:mockEvent.id},error:null}); await pending;});
  });
  it.each([
    [{data:{id:mockEvent.id},error:null},true],
    [{data:null,error:null},false],
    [{data:null,error:{message:'denied'}},false],
  ])('cleans reminders only for confirmed deletes resolving after an account switch (%j)',async(response,shouldCancel)=>{
    let resolve!: (value:unknown)=>void;
    mockDelete.mockReturnValue(new Promise(r=>{resolve=r;}));
    const confirm=askDelete(); let pending!: Promise<void>;
    act(()=>{pending=confirm();});
    mockUser='owner-b'; await act(async()=>{node.update(<Hub/>);});
    await act(async()=>{resolve(response); await pending;});
    expect(mockCancelReminders).toHaveBeenCalledTimes(shouldCancel ? 1 : 0);
    if(shouldCancel)expect(mockCancelReminders).toHaveBeenCalledWith(mockEvent.id);
    expect(mockRemove).not.toHaveBeenCalled(); expect(mockRefresh).not.toHaveBeenCalled();
  });
  it('does not execute a confirmation belonging to the previous account',async()=>{
    const confirm=askDelete(); mockUser='owner-b';
    await act(async()=>{node.update(<Hub/>);}); await act(async()=>{await confirm();});
    expect(mockDelete).not.toHaveBeenCalled(); expect(mockRemove).not.toHaveBeenCalled();
  });
});
