import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { useDogs } from '@/hooks/useDogs';
import { useSession } from '@/hooks/useSession';
import { useCoachWeek } from '@/features/ai/hooks/useCoachWeek';
import { CoachWeekCard, suggestionEventTexts } from '@/features/ai/components/CoachWeekCard';

// Coach PR B: Wochenvorschlag im Coach-Bildschirm (nur Premium, wie der Bildschirm selbst).
// Hund wählen (nur eigene Hunde), darunter die Woche. Hier lässt sich der Coach im
// Hundeprofil wieder einblenden.
export function CoachWeekSection() {
  const { t } = useT();
  const { session } = useSession();
  const { dogs } = useDogs();
  const own = dogs.filter(d => d.owner_id === session?.user.id);
  const [picked, setPicked] = useState<string | null>(null);
  const dog = own.find(d => d.id === picked) ?? own[0] ?? null;
  const c = useCoachWeek(dog, true);
  if (!dog) return null;

  return (
    <View style={{ gap: 10 }}>
      {own.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} accessibilityLabel={t('coach.week.pickDog')}>
          {own.map(d => {
            const on = d.id === dog.id;
            return (
              <TouchableOpacity key={d.id} onPress={() => setPicked(d.id)} style={[s.chip, on && s.chipOn]} accessibilityRole="button" accessibilityState={{ selected: on }} testID={`coach-dog-${d.id}`}>
                <Text style={[s.chipTxt, on && s.chipTxtOn]} numberOfLines={1}>{d.name}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}
      <CoachWeekCard
        week={c.week}
        isPro
        isLoading={c.isLoading}
        disabledCount={c.prefs.disabledRules[dog.id]?.length ?? 0}
        planned={c.planned}
        busy={c.busy}
        onTakeOver={list => c.takeOver(list.map(sg => ({ suggestion: sg, ...suggestionEventTexts(sg, t) })))}
        onDismiss={key => { void c.dismiss(key); }}
        onDisableRule={rule => { void c.setRule(rule, false); }}
        onEnableAll={() => { void c.enableAllRules(); }}
        onHideInProfile={c.prefs.hiddenInProfile ? undefined : () => { void c.setHiddenInProfile(true); }}
      />
      {c.prefs.hiddenInProfile ? (
        <TouchableOpacity onPress={() => { void c.setHiddenInProfile(false); }} style={s.hidden} accessibilityRole="button" testID="coach-show-profile">
          <Text style={s.hiddenTxt}>{t('coach.week.hiddenHint')} <Text style={s.link}>{t('coach.week.showProfile')}</Text></Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  chips:     { gap: 8 },
  chip:      { borderRadius: 99, borderWidth: 1, borderColor: C.border, paddingHorizontal: 14, paddingVertical: 7, maxWidth: 160 },
  chipOn:    { borderColor: C.accent, backgroundColor: C.accentDim },
  chipTxt:   { fontSize: 13, color: C.muted, fontWeight: '700' },
  chipTxtOn: { color: C.white },
  hidden:    { paddingHorizontal: 4 },
  hiddenTxt: { fontSize: 12.5, color: C.muted, lineHeight: 18 },
  link:      { color: C.accent, fontWeight: '700' },
});
