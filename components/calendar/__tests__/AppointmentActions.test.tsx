import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { NextAppointmentCard } from '../NextAppointmentCard';
import { EventActionsSheet } from '../EventActionsSheet';
import { event } from '@/features/calendar/__tests__/fixture';
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('expo-blur', () => ({ BlurView: 'Blur' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
jest.mock('@/lib/deviceCalendar', () => ({ DEVICE_CALENDAR_AVAILABLE: true }));
jest.mock('@/components/ui/AnyvoBottomSheet', () => ({ AnyvoBottomSheet: 'Sheet' }));
let node: ReactTestRenderer;
afterEach(() => { act(() => node?.unmount()); });
it('opens the actual main appointment card with the exact calendar event', () => {
  const press = jest.fn();
  act(() => { node = TestRenderer.create(<NextAppointmentCard event={event} onPress={press} />); });
  const button = node.root.findAll(n => n.props.accessibilityRole === 'button')[0];
  act(() => button.props.onPress());
  expect(press).toHaveBeenCalledWith(event);
});
it.each(['owner-b', 'trainer'])('does not expose owner edit/delete for %s', userId => {
  act(() => { node = TestRenderer.create(<EventActionsSheet visible event={event} userId={userId} onClose={jest.fn()} onDismiss={jest.fn()} onEdit={jest.fn()} onDelete={jest.fn()} onExport={jest.fn()} />); });
  expect(node.root.findAll(n => n.props.children === 'common.edit')).toHaveLength(0);
  expect(node.root.findAll(n => n.props.children === 'calendar.deleteEvent')).toHaveLength(0);
  expect(node.root.findAll(n => n.props.children === 'calendar.exportEvent').length).toBeGreaterThan(0);
});
