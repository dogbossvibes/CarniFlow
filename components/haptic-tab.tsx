import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
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
