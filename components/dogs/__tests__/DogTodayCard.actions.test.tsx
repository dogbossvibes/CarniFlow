import React from 'react';
import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { DogTodayCard } from '../DogTodayCard';
import { DogAppointmentsCard } from '../DogAppointmentsCard';
import type { TodayHint, DogAppointment } from '@/features/dogs/dashboard';
jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Icon' }));
jest.mock('@/i18n', () => ({ useT: () => ({ t: (key: string) => key }) }));
const appointment: DogAppointment = { id: 'event-a', title: 'UO / Fährte', startAt: '2026-10-25T09:41:00Z', discipline: null, type: 'training', overdue: true };
let node: ReactTestRenderer;
afterEach(() => { act(() => node?.unmount()); });
it('makes each real hint independently actionable, without grouping buttons into one accessible card', () => {
 const first = jest.fn(), recent = jest.fn();
 const hints: TodayHint[] = [{ kind: 'appointment_overdue', appointment }, { kind: 'last_activity' }];
 act(() => { node = TestRenderer.create(<DogTodayCard dogName="Yam" hints={hints} backpackActive={0} backpackPacked={0} lastTrainingLabel="Fährte · vor 3 Tagen" localeTag="de-CH" getHintAction={hint => hint.kind === 'appointment_overdue' ? first : recent} />); });
 const buttons = node.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
 const press = (label: string) => buttons.find(n => n.props.accessibilityLabel.includes(label))!.props.onPress();
 act(() => { press('UO / Fährte'); }); expect(first).toHaveBeenCalledTimes(1); expect(recent).not.toHaveBeenCalled();
 act(() => { press('Fährte · vor 3 Tagen'); }); expect(recent).toHaveBeenCalledTimes(1);
 expect(node.root.findAll(n => n.props.accessible === false).length).toBeGreaterThan(0);
});
it('does not present an unavailable action as a tappable button', () => {
 act(() => { node = TestRenderer.create(<DogTodayCard dogName="Yam" hints={[{kind:'last_activity'}]} backpackActive={0} backpackPacked={0} lastTrainingLabel="Alt" localeTag="de-CH" />); });
 expect(node.root.findAll(n => n.props.accessibilityRole === 'button')).toHaveLength(0);
});
it('opens the exact overdue appointment rather than the generic calendar', () => {
 const open = jest.fn(), calendar = jest.fn();
 act(() => { node = TestRenderer.create(<DogAppointmentsCard appointments={[appointment]} localeTag="de-CH" onOpenCalendar={calendar} onOpenAppointment={open} />); });
 const row = node.root.findAll(n => typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith('UO / Fährte'))[0];
 act(() => row.props.onPress()); expect(open).toHaveBeenCalledWith(appointment); expect(calendar).not.toHaveBeenCalled();
});
