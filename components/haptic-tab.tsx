import { BottomTabBarButtonProps } from 'expo-router/js-tabs';
import { PlatformPressable } from 'expo-router/react-navigation';
import { haptic } from '@/lib/haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        // Tab-Wechsel = Selection-Haptik, konsistent auf Android UND iOS.
        haptic.selection();
        props.onPressIn?.(ev);
      }}
    />
  );
}
