import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { DogCommandsCard } from '@/components/dogs/DogCommandsCard';
import { getCommands, toggleFavorite, type DogCommand } from '@/features/dogs/dogCommands';
import { AnyvoButton } from '@/components/ui/AnyvoButton';

export default function DogCommandsHubRoute() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const [commands, setCommands] = useState<DogCommand[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!dogId) return;
    setLoading(true);
    setCommands(await getCommands(dogId));
    setLoading(false);
  }, [dogId]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const openAdd = () => router.push({ pathname: '/dog-command/add', params: { dogId } } as never);
  const openCommand = (command: DogCommand) => router.push({ pathname: '/dog-command/detail', params: { dogId, commandId: command.id } } as never);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={s.flex}>
        <View style={s.header}>
          <TouchableOpacity style={s.iconButton} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <Text style={s.title}>Kommandos</Text>
          <View style={s.iconButton} />
        </View>
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {commands.length ? <DogCommandsCard
              commands={commands}
              onAdd={openAdd}
              onOpen={openCommand}
              onToggleFavorite={command => { toggleFavorite(dogId, command.id).then(reload); }}
            /> : <View style={s.emptyHub}>
              <View style={s.emptyTiles}>
                <CategoryTile icon="home-outline" title="Alltag" />
                <CategoryTile icon="trophy-outline" title="Training / Sport" />
              </View>
              <Text style={s.emptyText}>Noch keine Kommandos</Text>
              <AnyvoButton label="Kommando hinzufügen" icon="add" onPress={openAdd} />
            </View>}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function CategoryTile({ icon, title }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string }) {
  return <View style={s.tile}><Ionicons name={icon} size={19} color={C.trackPrimary} /><Text style={s.tileTitle}>{title}</Text><Text style={s.tileCount}>0 Kommandos</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg },
  flex: { flex: 1 },
  center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, color: C.trackText, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  emptyHub: { gap: 14 },
  emptyTiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, minHeight: 104, borderRadius: 16, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 14, gap: 7 },
  tileTitle: { color: C.trackText, fontSize: 14, fontWeight: '900' },
  tileCount: { color: C.trackTextSec, fontSize: 12, fontWeight: '600' },
  emptyText: { color: C.trackTextSec, fontSize: 13, textAlign: 'center' },
});
