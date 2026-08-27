import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FT } from '@/constants/colors';

export function PocketLockOverlay({
  visible, duration, distanceM, onUnlock,
}: {
  visible: boolean;
  duration: string;
  distanceM: string;
  onUnlock: () => void;
}) {
  if (!visible) return null;
  return (
    <View className="absolute inset-0 z-50 items-center justify-center bg-ft-bg/95 px-8" pointerEvents="auto">
      <Pressable
        accessibilityLabel="Aufnahme gesperrt. Zum Entsperren gedrückt halten"
        accessibilityHint="Mindestens 1,8 Sekunden gedrückt halten"
        accessibilityRole="button"
        className="absolute inset-0"
        onPress={() => undefined}
        onLongPress={onUnlock}
        delayLongPress={1800}
      />
      <View pointerEvents="none" className="items-center">
        <View className="w-[72px] h-[72px] rounded-full items-center justify-center bg-ft-acc-dim border-2 border-ft-acc mb-5">
          <Ionicons name="lock-closed" size={31} color={FT.acc} />
        </View>
        <Text className="text-[22px] font-black text-ft-text text-center">Aufnahme gesperrt</Text>
        <Text className="text-[14px] font-bold text-ft-acc mt-2">Fährte läuft weiter</Text>
        <View className="flex-row gap-8 mt-7">
          <View className="items-center">
            <Text className="text-[25px] font-black text-ft-text">{duration}</Text>
            <Text className="text-[9px] font-bold tracking-[1px] uppercase text-ft-muted">Dauer</Text>
          </View>
          <View className="items-center">
            <Text className="text-[25px] font-black text-ft-text">{distanceM}</Text>
            <Text className="text-[9px] font-bold tracking-[1px] uppercase text-ft-muted">Distanz</Text>
          </View>
        </View>
        <Text className="text-[12px] font-bold text-ft-muted text-center mt-8">Zum Entsperren gedrückt halten</Text>
      </View>
    </View>
  );
}
