import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert } from 'react-native';
import { CreateEventModal } from '../CreateEventModal';
import { event } from '@/features/calendar/__tests__/fixture';

let mockUser = 'owner-a';
const mockUpdate = jest.fn(), mockCreate = jest.fn(), mockReminders = jest.fn();
jest.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: { user: { id: mockUser } } }) }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => ({ bottom: 20 }) }));
jest.mock('@/services/calendarService', () => ({ createOwnEvent: (...args: unknown[]) => mockCreate(...args), updateOwnCalendarEvent: (...args: unknown[]) => mockUpdate(...args) }));
jest.mock('@/lib/eventReminders', () => ({ scheduleEventReminders: (...args: unknown[]) => mockReminders(...args) }));
jest.mock('@/lib/deviceCalendar', () => ({ DEVICE_CALENDAR_AVAILABLE: false, addEventToDeviceCalendar: jest.fn() }));
jest.mock('../AppointmentTypeGrid', () => ({ AppointmentTypeGrid: 'Types' }));
jest.mock('../DogSelectionCards', () => ({ DogSelectionCards: 'Dogs' }));
jest.mock('../LocationPickerCard', () => ({ LocationPickerCard: 'Location' }));
jest.mock('../ReminderCard', () => ({ ReminderCard: 'Reminders' }));
jest.mock('../ConnectedTrainerSelector', () => ({ ConnectedTrainerSelector: 'Trainer' }));
jest.mock('@/components/ui/DateField', () => ({ DateField: 'DateField' }));
jest.mock('../StickyCreateAppointmentButton', () => ({ StickyCreateAppointmentButton: 'Save' }));

let node: ReactTestRenderer;
const close = jest.fn(), saved = jest.fn();
const props = () => ({ visible: true, event, onClose: close, onCreated: saved });
async function render() { await act(async () => { node = TestRenderer.create(<CreateEventModal {...props()} />); }); }
const save = () => node.root.findByType('Save' as never).props.onPress();
const title = () => node.root.findAll(n => n.props.accessibilityLabel === 'calendar.eventTitleUpper')[0];
beforeEach(() => { jest.clearAllMocks(); mockUser = 'owner-a'; mockUpdate.mockResolvedValue({ data: event, error: null }); mockReminders.mockResolvedValue(undefined); jest.spyOn(Alert, 'alert').mockImplementation(() => {}); });
afterEach(() => { act(() => node?.unmount()); jest.restoreAllMocks(); });

it('prefills existing fields and updates the same record with only the intended change', async () => {
  await render();
  expect(title().props.value).toBe('UO / Fährte');
  act(() => title().props.onChangeText('UO edited'));
  await act(async () => { await save(); });
  expect(mockUpdate).toHaveBeenCalledWith('owner-a', event, { title: 'UO edited' });
  expect(mockCreate).not.toHaveBeenCalled();
  expect(saved).toHaveBeenCalledWith(event); expect(close).toHaveBeenCalled();
});
it('retains inputs on offline errors and retries with no create fallback', async () => {
  mockUpdate.mockRejectedValueOnce(new Error('offline'));
  await render(); act(() => title().props.onChangeText('Keep this'));
  await act(async () => { await save(); });
  expect(title().props.value).toBe('Keep this'); expect(close).not.toHaveBeenCalled();
  await act(async () => { await save(); });
  expect(mockUpdate).toHaveBeenCalledTimes(2); expect(mockCreate).not.toHaveBeenCalled();
});
it('blocks two taps in the same frame and cancellation while saving', async () => {
  let resolve!: (value: unknown) => void;
  mockUpdate.mockReturnValue(new Promise(r => { resolve = r; }));
  await render();
  await act(async () => { void save(); void save(); });
  expect(mockUpdate).toHaveBeenCalledTimes(1);
  expect(node.root.findByType('Save' as never).props.loading).toBe(true);
  await act(async () => { resolve({ data: event, error: null }); });
  expect(saved).toHaveBeenCalledTimes(1);
});
it('cancels without saving and reopens with server values', async () => {
  await render(); act(() => title().props.onChangeText('Discard'));
  act(() => node.root.findAll(n => n.props.accessibilityLabel === 'common.close')[0].props.onPress());
  expect(mockUpdate).not.toHaveBeenCalled();
  await act(async () => { node.update(<CreateEventModal {...props()} visible={false} />); });
  await act(async () => { node.update(<CreateEventModal {...props()} />); });
  expect(title().props.value).toBe(event.title);
});
it('drops a late old-account completion without reminders or callbacks', async () => {
  let resolve!: (value: unknown) => void;
  mockUpdate.mockReturnValue(new Promise(r => { resolve = r; }));
  await render(); await act(async () => { void save(); });
  mockUser = 'owner-b'; await act(async () => { node.update(<CreateEventModal {...props()} />); });
  expect((node as unknown as { toJSON(): unknown }).toJSON()).toBeNull();
  await act(async () => { resolve({ data: event, error: null }); });
  expect(mockReminders).not.toHaveBeenCalled(); expect(saved).not.toHaveBeenCalled();
});
it('does not schedule completed or cancelled appointments again', async () => {
  for (const status of ['completed', 'cancelled']) {
    mockUpdate.mockResolvedValue({ data: { ...event, status }, error: null });
    await render(); await act(async () => { await save(); });
    expect(mockReminders).toHaveBeenLastCalledWith(expect.objectContaining({ status, reminder_minutes: [] }));
    act(() => node.unmount());
  }
});

it('preserves legacy null reminders on a text-only edit', async () => {
  const legacy = { ...event, reminder_minutes: null } as unknown as typeof event;
  await act(async () => { node = TestRenderer.create(<CreateEventModal {...props()} event={legacy} />); });
  act(() => title().props.onChangeText('Text only'));
  await act(async () => { await save(); });
  expect(mockUpdate).toHaveBeenCalledWith('owner-a', legacy, { title: 'Text only' });
});
it.each(['pending', 'confirmed'] as const)('does not expose the direct edit form for %s trainer-linked appointments', async status => {
  await act(async () => { node = TestRenderer.create(<CreateEventModal {...props()} event={{ ...event, status, trainer_id: 'trainer', created_by: 'trainer' }} />); });
  expect((node as unknown as { toJSON(): unknown }).toJSON()).toBeNull();
  expect(mockUpdate).not.toHaveBeenCalled();
});

it('does not edit a trainer-created event even if its trainer link was removed', async () => {
  await act(async () => { node = TestRenderer.create(<CreateEventModal {...props()} event={{ ...event, created_by: 'trainer' }} />); });
  expect((node as unknown as { toJSON(): unknown }).toJSON()).toBeNull();
  expect(mockUpdate).not.toHaveBeenCalled();
});
it('only changes reminders after an explicit user choice on a legacy null event', async () => {
  const legacy = { ...event, reminder_minutes: null } as unknown as typeof event;
  await act(async () => { node = TestRenderer.create(<CreateEventModal {...props()} event={legacy} />); });
  const reminder = node.root.findByType('Reminders' as never);
  act(() => { reminder.props.setPushOn(true); reminder.props.onToggle(60); });
  await act(async () => { await save(); });
  expect(mockUpdate).toHaveBeenCalledWith('owner-a', legacy, { reminder_minutes: [60] });
});
