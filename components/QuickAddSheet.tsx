import { useMemo, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity } from 'react-native';
import { useFabBottom } from '@/hooks/useFabBottom';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { useActiveTraining } from '@/stores/activeTraining';
import { LiveTrainingBar } from '@/components/training/LiveTrainingBar';
import { ActionListModal } from '@/components/home/ActionListModal';
import { useSession } from '@/hooks/useSession';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useDogs } from '@/hooks/useDogs';
import { quotaAllowsNew } from '@/features/subscription/plans';
import { useT, type TranslationKey } from '@/i18n';
import {
  ALL_FAB_ACTIONS,
  DEFAULT_FAB_ACTION,
  HOME_FAB_ACTIONS_META,
  setHomeScreenConfig,
  useHomeScreenConfig,
  type HomeFabActionId,
} from '@/stores/homeScreenConfig';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Übersetzung je FAB-Aktion (eine Quelle; Registry hält Icon/Route).
export const FAB_ACTION_LABEL_KEY: Record<Exclude<HomeFabActionId, 'hidden'>, TranslationKey> = {
  start_training:     'fab.actionStartTraining',
  document_training:  'fab.actionDocumentTraining',
  training_journal:   'fab.actionTrainingJournal',
  start_track:        'fab.actionStartTrack',
  create_appointment: 'fab.actionCreateAppointment',
  add_dog:            'fab.actionAddDog',
  open_backpack:      'fab.actionOpenBackpack',
};

// Personalisierbarer Startseiten-FAB (props.personalized):
//   • kurzer Tipp  → gewählte Aktion direkt ausführen
//   • langer Tipp  → Auswahl-Dialog „Schnellaktion auswählen"
//   • fabVisible=false oder Aktion 'hidden' → kein leerer Platzhalter
// Standard (ohne prop) bleibt das bisherige Plus → /unit/start.
export function QuickAddSheet({ personalized = false }: { personalized?: boolean }) {
  const router = useRouter();
  const active = useActiveTraining();
  const fabBottom = useFabBottom();
  const { user } = useSession();
  const { isPro } = useCapabilities();
  const { dogs } = useDogs();
  const config = useHomeScreenConfig(user?.id);
  const { t } = useT();
  const [actionPicker, setActionPicker] = useState(false);
  const [dogPicker, setDogPicker] = useState(false);

  // Während eines laufenden Trainings ersetzt die Live-Bar den Button.
  if (active.unitId) return <LiveTrainingBar />;

  if (!personalized) {
    return (
      <TouchableOpacity
        style={[s.fab, { bottom: fabBottom }]}
        onPress={() => { haptic.light(); router.push('/unit/start'); }}
        activeOpacity={0.85}
      >
        <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
        <Ionicons name="add" size={28} color={C.accentText} />
      </TouchableOpacity>
    );
  }

  // Ungültige/veraltete Action-ID → sicher auf Standard zurückfallen (kein Crash).
  // 'hidden' (Alt-Configs) behandeln wir wie fabVisible=false → kein Platzhalter.
  const rawId = config.fabActionId ?? DEFAULT_FAB_ACTION;
  if (config.fabVisible === false || rawId === 'hidden') return null;
  const actionId = (HOME_FAB_ACTIONS_META[rawId] ? rawId : DEFAULT_FAB_ACTION) as Exclude<HomeFabActionId, 'hidden'>;

  const meta = HOME_FAB_ACTIONS_META[actionId];
  const labelKey = FAB_ACTION_LABEL_KEY[actionId];
  const label = t(labelKey);

  const runAction = (id: HomeFabActionId) => {
    const m = HOME_FAB_ACTIONS_META[id];
    switch (id) {
      case 'start_training':
      case 'document_training':
      case 'training_journal':
      case 'start_track':
      case 'create_appointment':
        if (m?.route) router.push(m.route as never);
        return;
      case 'add_dog':
        // Bestehendes NEWBIE-Quota-Gate weiterverwenden (wie app/add-dog.tsx).
        if (!quotaAllowsNew(isPro, 'dog', dogs.length)) {
          haptic.warning();
          router.push('/premium' as never);
        } else {
          router.push('/add-dog' as never);
        }
        return;
      case 'open_backpack':
        if (dogs.length === 0) {
          Alert.alert(t('fab.noDogTitle'), t('fab.noDogBody'), [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('fab.addDog'), onPress: () => router.push('/add-dog' as never) },
          ]);
        } else if (dogs.length === 1) {
          const dog = dogs[0];
          router.push({ pathname: '/dog-backpack/[id]', params: { id: dog.id, name: dog.name } } as never);
        } else {
          setDogPicker(true); // vorhandene Hund-Auswahl (Modal, keine neue Architektur)
        }
        return;
      default:
        return; // unbekannte ID → still ignorieren (kein Crash)
    }
  };

  const actionItems = useMemo(() => {
    const selectable = ALL_FAB_ACTIONS.filter((id) => id !== 'hidden');
    return selectable.map((id) => ({
      key: id,
      icon: HOME_FAB_ACTIONS_META[id]?.icon as IconName | undefined,
      label: t(FAB_ACTION_LABEL_KEY[id]),
      selected: id === actionId,
    }));
  }, [actionId, t]);

  const dogItems = useMemo(
    () => dogs.map((dog) => ({ key: dog.id, icon: 'paw-outline' as IconName, label: dog.name })),
    [dogs],
  );

  return (
    <>
      <TouchableOpacity
        style={[s.fab, { bottom: fabBottom }]}
        onPress={() => { haptic.light(); runAction(actionId); }}
        onLongPress={() => { haptic.medium(); setActionPicker(true); }}
        delayLongPress={350}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('fab.hint')}
      >
        <LinearGradient colors={['#00FFCC', '#00FFCC']} style={StyleSheet.absoluteFill} />
        <Ionicons name={(meta?.icon ?? 'add') as IconName} size={28} color={C.accentText} />
      </TouchableOpacity>

      <ActionListModal
        visible={actionPicker}
        onClose={() => setActionPicker(false)}
        title={t('fab.selectTitle')}
        items={[
          ...actionItems,
          { key: 'fab-hidden', icon: 'eye-off-outline', label: t('fab.hide') },
        ]}
        onSelect={(key) => {
          if (key === 'fab-hidden') {
            setHomeScreenConfig({ ...config, fabVisible: false });
          } else {
            setHomeScreenConfig({ ...config, fabActionId: key as HomeFabActionId });
          }
          setActionPicker(false);
        }}
      />

      <ActionListModal
        visible={dogPicker}
        onClose={() => setDogPicker(false)}
        title={t('home.selectDog')}
        items={dogItems}
        onSelect={(dogId) => {
          setDogPicker(false);
          const dog = dogs.find((item) => item.id === dogId);
          if (!dog) return;
          router.push({ pathname: '/dog-backpack/[id]', params: { id: dog.id, name: dog.name } } as never);
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  fab: {
    position:       'absolute',
    bottom:         28,
    right:          20,
    width:          58,
    height:         58,
    borderRadius:   29,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'hidden',
    shadowColor:    '#00FFCC',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.35,
    shadowRadius:   12,
    elevation:      8,
  },
});
