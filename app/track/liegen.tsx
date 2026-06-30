import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FT } from '@/constants/colors';
import { useTrackingStore } from '@/features/tracking/store/trackingStore';
import { setTrackLyingTime, getTrackSessionDogName } from '@/features/tracking/services/trackService';

// Liegezeit als h:mm:ss (ab 1 h) bzw. mm:ss — die Fährte kann Stunden reifen.
function fmtAge(sec: number) {
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// WARTEPHASE zwischen Legen und Absuche: die gelegte Fährte „reift". Ein Timer
// zählt die Liegezeit ab `layFinishedAt` hoch; der Nutzer startet die Absuche
// per Knopf. Die gemessene Liegezeit (Minuten) wird auf der Session gespeichert.
// Der Lege-Store bleibt unangetastet, damit die Absuche ihn snapshotten kann.
export default function TrackLiegenScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [startMs] = useState(() => useTrackingStore.getState().layFinishedAt ?? Date.now());
  const [now, setNow] = useState(Date.now());
  const [dogName, setDogName] = useState('Hund');
  const [starting, setStarting] = useState(false);

  // Kennzahlen der gelegten Fährte für die Zusammenfassung (einmalig).
  const [summary] = useState(() => {
    const st = useTrackingStore.getState();
    return {
      distanceM: Math.round(st.distanceMeters),
      winkel:    st.markers.filter(m => m.type === 'winkel').length,
      objekte:   st.markers.filter(m => m.type === 'gegenstand').length,
    };
  });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (id) getTrackSessionDogName(id).then(r => { if (r.data) setDogName(r.data); }); }, [id]);

  const elapsedS = Math.max(0, Math.floor((now - startMs) / 1000));

  const startSearch = async () => {
    if (starting) return;
    setStarting(true);
    const minutes = Math.max(0, Math.round((Date.now() - startMs) / 60000));
    if (id) await setTrackLyingTime(id, minutes).catch(() => {});
    router.replace((id ? `/track/run?id=${id}` : '/track') as never);
  };

  const cancel = () => {
    useTrackingStore.getState().reset();
    router.replace('/track' as never);
  };

  return (
    <View className="flex-1 bg-ft-bg">
      <SafeAreaView edges={['top']} className="flex-1">
        {/* Top-Bar */}
        <View className="flex-row items-center gap-3 px-[18px] pb-[10px]">
          <Pressable className="w-9 h-9 rounded-[11px] border border-ft-line-strong bg-white/5 items-center justify-center" onPress={cancel} hitSlop={8}>
            <Ionicons name="chevron-back" size={18} color={FT.text} />
          </Pressable>
          <Text className="text-[15px] font-extrabold text-ft-text">Liegezeit</Text>
        </View>

        {/* Timer in der Mitte */}
        <View className="flex-1 items-center justify-center px-6">
          <View className="w-[150px] h-[150px] rounded-full items-center justify-center mb-7 border-2 border-[rgba(21,230,195,0.35)] bg-ft-acc-dim">
            <Ionicons name="hourglass-outline" size={30} color={FT.acc} />
          </View>
          <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1.4px] uppercase mb-1">Fährte liegt seit</Text>
          <Text className="text-[58px] leading-[62px] text-ft-text font-black" style={{ fontVariant: ['tabular-nums'] }}>{fmtAge(elapsedS)}</Text>
          <Text className="text-[13px] text-ft-muted font-semibold text-center mt-3 max-w-[280px]">
            Lass die Fährte reifen. Starte die Absuche mit {dogName}, sobald du bereit bist.
          </Text>

          {/* Kennzahlen der gelegten Fährte */}
          <View className="flex-row gap-2 mt-7">
            {[
              { v: `${summary.distanceM} m`, l: 'Distanz' },
              { v: String(summary.winkel),   l: 'Winkel' },
              { v: String(summary.objekte),  l: 'Gegenst.' },
            ].map((x, i) => (
              <View key={i} className="items-center px-5 py-3 rounded-[16px] bg-white/5 border border-ft-line">
                <Text className="text-[17px] font-black text-ft-text" style={{ fontVariant: ['tabular-nums'] }}>{x.v}</Text>
                <Text className="text-[8.5px] text-ft-muted font-bold tracking-[1px] uppercase mt-px">{x.l}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Absuche starten */}
        <View className="px-[18px] pt-[14px] pb-[26px]">
          <Pressable
            className="h-[60px] rounded-[18px] flex-row items-center justify-center gap-2 bg-ft-acc"
            style={starting ? { opacity: 0.5 } : undefined}
            onPress={startSearch} disabled={starting}
          >
            <Ionicons name="play" size={18} color={FT.accText} />
            <Text className="text-[14px] font-extrabold text-ft-acc-text">Absuche starten</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}
