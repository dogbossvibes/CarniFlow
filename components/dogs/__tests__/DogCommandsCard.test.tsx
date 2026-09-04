jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import TestRenderer, { act, type ReactTestRenderer } from 'react-test-renderer';
import { Alert, Text, View } from 'react-native';
import { DogCommandsCard } from '@/components/dogs/DogCommandsCard';
import type { DogCommand } from '@/features/dogs/dogCommands';
import { translate } from '@/i18n';
import { haptic } from '@/lib/haptics';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/lib/haptics', () => ({
  haptic: {
    light:   jest.fn(),
    warning: jest.fn(),
    heavy:   jest.fn(),
  },
}));
jest.mock('@/components/ui/AnyvoBottomSheet', () => {
  const { Text, View } = require('react-native');
  return {
    AnyvoBottomSheet: ({ visible, title, children }: { visible: boolean; title?: string; children: React.ReactNode }) => (
      visible ? <View testID="command-actions-sheet">{title ? <Text>{title}</Text> : null}{children}</View> : null
    ),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef((props: { children: React.ReactNode; renderRightActions?: () => React.ReactNode }, ref: React.Ref<{ close: () => void }>) => {
    React.useImperativeHandle(ref, () => ({ close: jest.fn() }));
    return <View testID="swipeable-command-row">{props.children}{props.renderRightActions?.()}</View>;
  });
});

const baseCommand: DogCommand = {
  id:             'sitz',
  dogId:          'dog-1',
  name:           'Sitz',
  category:       'sport',
  area:           'Grundlagen',
  verbalCue:      'Sitz',
  handSignal:     null,
  goal:           null,
  description:    null,
  steps:          [],
  tips:           [],
  commonMistakes: [],
  videoUrl:       null,
  audioUrl:       null,
  difficulty:     'easy',
  isFavorite:     false,
  lastUsedAt:     null,
  usageCount:     0,
  createdAt:      '2026-01-01T00:00:00.000Z',
  updatedAt:      '2026-01-01T00:00:00.000Z',
};

function render(overrides: Partial<Parameters<typeof DogCommandsCard>[0]> = {}) {
  const props = {
    commands:         [baseCommand],
    onAdd:            jest.fn(),
    onOpen:           jest.fn(),
    onEdit:           jest.fn(),
    onDelete:         jest.fn(),
    onToggleFavorite: jest.fn(),
    ...overrides,
  };
  let node!: ReactTestRenderer;
  act(() => { node = TestRenderer.create(<DogCommandsCard {...props} />); });
  return { node, props };
}

function pressByTestId(node: ReactTestRenderer, testID: string, handler: 'onPress' | 'onLongPress' = 'onPress') {
  act(() => { (node.root as any).findByProps({ testID }).props[handler](); });
}

describe('DogCommandsCard command actions', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('keeps the normal command-card tap unchanged', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-card-sitz');
    expect(props.onOpen).toHaveBeenCalledWith(baseCommand);
    expect(props.onEdit).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('opens the action sheet on long press and edits the selected command', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-card-sitz', 'onLongPress');
    expect(haptic.light).toHaveBeenCalledTimes(1);
    expect((node.root as any).findByProps({ testID: 'command-actions-sheet' }).findAllByType(Text).some((t: any) => t.props.children === 'Sitz')).toBe(true);

    pressByTestId(node, 'command-action-edit');
    expect(props.onEdit).toHaveBeenCalledWith(baseCommand);
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('shows the delete confirmation from long-press actions and respects cancel', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-card-sitz', 'onLongPress');
    pressByTestId(node, 'command-action-delete');

    expect(alertSpy).toHaveBeenCalledWith(
      translate('cmd.deleteConfirm'),
      translate('cmd.deleteConfirmBody'),
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0][2];
    act(() => { buttons[0].onPress?.(); });
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it('deletes only after the confirmation is accepted', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-card-sitz', 'onLongPress');
    pressByTestId(node, 'command-action-delete');

    const buttons = alertSpy.mock.calls[0][2];
    act(() => { buttons[1].onPress(); });
    expect(haptic.heavy).toHaveBeenCalledTimes(1);
    expect(props.onDelete).toHaveBeenCalledWith(baseCommand);
  });

  it('shows the same confirmation from the left-swipe delete action', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-swipe-delete-sitz');

    expect(alertSpy).toHaveBeenCalledWith(
      translate('cmd.deleteConfirm'),
      translate('cmd.deleteConfirmBody'),
      expect.any(Array),
    );
    const buttons = alertSpy.mock.calls[0][2];
    act(() => { buttons[1].onPress(); });
    expect(props.onDelete).toHaveBeenCalledWith(baseCommand);
  });

  it('keeps the favorite star as a separate tap target', () => {
    const { node, props } = render();
    pressByTestId(node, 'command-favorite-sitz');

    expect(props.onToggleFavorite).toHaveBeenCalledWith(baseCommand);
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
