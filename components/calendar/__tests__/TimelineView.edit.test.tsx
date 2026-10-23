import React from 'react';
import { TouchableOpacity } from 'react-native';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { TimelineView } from '../TimelineView';
import { event } from '@/features/calendar/__tests__/fixture';
import type { CalendarEvent } from '@/types/calendar';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('../DogEventCard', () => ({ DogEventCard: 'EventCard' }));
jest.mock('@/hooks/useTrainingCalendar', () => ({ localDayKey: (date: string) => date.slice(0, 10) }));
jest.mock('@/lib/eventFormat', () => ({ dayHeadingFromKey: (key: string) => key }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
let node: ReactTestRenderer;
const edits = () => (node.root as unknown as { findAllByType: (type: unknown) => { props: { testID?: string; onPress: () => void } }[] }).findAllByType(TouchableOpacity).filter(n => n.props.testID === 'calendar-visible-edit');
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date(2026, 9, 23)); });
afterEach(() => { act(() => node.unmount()); jest.useRealTimers(); });
test('visible edit targets only owned manual appointments, leaving imported/trainer events read-only', () => {
  const edit = jest.fn();
  const events = [event, { ...event, id: 'foreign', owner_id: 'other' }, { ...event, id: 'trainer', trainer_id: 'trainer' }, { ...event, id: 'import', source_type: 'vet', source_id: 'source' }] as CalendarEvent[];
  act(() => { node = TestRenderer.create(<TimelineView events={events} onEventPress={jest.fn()} userId="owner-a" onEdit={edit} />); });
  expect(edits()).toHaveLength(1); act(() => edits()[0].props.onPress()); expect(edit).toHaveBeenCalledWith(event);
});
test('an account change removes the edit affordance', () => {
  act(() => { node = TestRenderer.create(<TimelineView events={[event]} onEventPress={jest.fn()} userId="other" onEdit={jest.fn()} />); });
  expect(edits()).toHaveLength(0);
});
