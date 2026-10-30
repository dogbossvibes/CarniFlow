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

it.each(['owner-a','owner-b'])('only editable owners see completion/cancellation actions (%s)', userId => {
 act(()=>{node=TestRenderer.create(<EventActionsSheet visible event={event} userId={userId} onClose={()=>{}} onDismiss={()=>{}} onEdit={()=>{}} onDelete={()=>{}} onExport={()=>{}} onComplete={()=>{}} onCancelEvent={()=>{}} />);});
 expect(node.root.findAll(n=>n.props.children==='calendar.markCompleted').length>0).toBe(userId==='owner-a');
 expect(node.root.findAll(n=>n.props.children==='calendar.cancelAppointment').length>0).toBe(userId==='owner-a');
});
it('source-managed appointments offer their source and never mark a vaccination completed through calendar status',()=>{
 act(()=>{node=TestRenderer.create(<EventActionsSheet visible event={{...event,source_type:'health_vaccination',source_id:'v'}} userId="owner-a" onClose={()=>{}} onDismiss={()=>{}} onEdit={()=>{}} onDelete={()=>{}} onExport={()=>{}} onComplete={()=>{}} onOpenSource={()=>{}} />);});
 expect(node.root.findAll(n=>n.props.children==='calendar.markCompleted')).toHaveLength(0);
 expect(node.root.findAll(n=>n.props.children==='health.recordTitle').length).toBeGreaterThan(0);
});


it('offers deletion for an owned trainer appointment without enabling owner editing', () => {
  act(() => { node = TestRenderer.create(<EventActionsSheet visible event={{...event,trainer_id:'trainer',created_by:'trainer'}} userId="owner-a" onClose={()=>{}} onDismiss={()=>{}} onEdit={()=>{}} onDelete={()=>{}} onExport={()=>{}} />); });
  expect(node.root.findAll(n=>n.props.children==='calendar.deleteEvent').length).toBeGreaterThan(0);
  expect(node.root.findAll(n=>n.props.children==='common.edit')).toHaveLength(0);
});
it('never offers source deletion or deletion during a busy mutation', () => {
  const remove=jest.fn();
  act(() => { node = TestRenderer.create(<EventActionsSheet visible event={{...event,source_id:'health-source'}} userId="owner-a" onClose={()=>{}} onDismiss={()=>{}} onEdit={()=>{}} onDelete={remove} onExport={()=>{}} />); });
  expect(node.root.findAll(n=>n.props.children==='calendar.deleteEvent')).toHaveLength(0);
  act(() => { node.update(<EventActionsSheet visible event={event} userId="owner-a" busy onClose={()=>{}} onDismiss={()=>{}} onEdit={()=>{}} onDelete={remove} onExport={()=>{}} />); });
  expect(node.root.findAll(n=>n.props.accessibilityRole==='button').every(n=>n.props.accessibilityState?.disabled)).toBe(true);
});
