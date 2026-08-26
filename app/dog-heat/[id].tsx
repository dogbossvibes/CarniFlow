import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { haptic } from '@/lib/haptics';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { DateField } from '@/components/ui/DateField';
import { toISODate } from '@/features/dogs/dateInput';
import {
  getHeatCycle, updateHeatCycle, endHeatCycle, deleteHeatCycle,
  getHeatPhases, addHeatPhase, updateHeatPhase, deleteHeatPhase,
  getHeatObservations, addHeatObservation, deleteHeatObservation,
  fmtDate, durationDays, heatCycleDay, isActiveCycle,
  HEAT_PHASE_TYPES, HEAT_OBSERVATION_TYPES,
  type HeatCycle, type HeatPhase, type HeatObservation,
} from '@/features/dogs/heatCycles';
import { useT } from '@/i18n';
import { useCapabilities } from '@/hooks/useCapabilities';

const PINK = '#F472B6';
const PINK_DIM = 'rgba(244,114,182,0.14)';

// Detailansicht einer einzelnen Läufigkeit mit Timeline, Phasen- und Beobachtungsverwaltung.
export default function DogHeatDetail() {
  const router = useRouter();
  const { isPro, loading: capLoading } = useCapabilities();
  const { id: heatCycleId } = useLocalSearchParams<{ id: string }>();
  const { t } = useT();
  const insets = useSafeAreaInsets();

  // Premium gate
  useEffect(() => {
    if (!capLoading && !isPro) router.replace('/premium' as never);
  }, [capLoading, isPro, router]);

  // Data
  const [cycle, setCycle] = useState<HeatCycle | null>(null);
  const [phases, setPhases] = useState<HeatPhase[]>([]);
  const [observations, setObservations] = useState<HeatObservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editStart, setEditStart] = useState<Date | null>(null);
  const [editEnd, setEditEnd] = useState<Date | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Phase form
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [editingPhase, setEditingPhase] = useState<HeatPhase | null>(null);
  const [phaseType, setPhaseType] = useState<string | null>(null);
  const [phaseStart, setPhaseStart] = useState<Date | null>(new Date());
  const [phaseEnd, setPhaseEnd] = useState<Date | null>(null);
  const [phaseNotes, setPhaseNotes] = useState('');

  // Observation form
  const [showObsForm, setShowObsForm] = useState(false);
  const [obsType, setObsType] = useState<string | null>(null);
  const [obsDate, setObsDate] = useState<Date | null>(new Date());
  const [obsValue, setObsValue] = useState('');
  const [obsNotes, setObsNotes] = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!heatCycleId) return;
    try {
      const [c, p, o] = await Promise.all([
        getHeatCycle(heatCycleId),
        getHeatPhases(heatCycleId),
        getHeatObservations(heatCycleId),
      ]);
      setCycle(c);
      setPhases(p);
      setObservations(o);
    } catch { /* ignore */ }
    setLoading(false);
  }, [heatCycleId]);

  useEffect(() => { load(); }, [load]);

  // ── Edit Cycle ────────────────────────────────────────────────────────────

  const startEdit = () => {
    if (!cycle) return;
    setEditStart(new Date(cycle.startDate));
    setEditEnd(cycle.endDate ? new Date(cycle.endDate) : null);
    setEditNotes(cycle.notes ?? '');
    setEditing(true);
  };

  const saveCycle = async () => {
    if (!cycle || !editStart || saving) return;
    setSaving(true);
    try {
      const endIso = editEnd ? toISODate(editEnd) : null;
      const { error } = await updateHeatCycle(cycle.id, {
        startDate: toISODate(editStart),
        endDate: endIso,
        status: endIso ? 'completed' : 'active',
        notes: editNotes.trim() || null,
      });
      if (error) { haptic.error(); return; }
      haptic.success();
      setEditing(false);
      load();
    } finally { setSaving(false); }
  };

  // ── End Cycle ─────────────────────────────────────────────────────────────

  const handleEndCycle = () => {
    if (!cycle) return;
    Alert.alert(
      t('heat.endTitle'),
      t('heat.endBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('heat.endConfirm'), style: 'destructive', onPress: async () => {
          await endHeatCycle(cycle.id);
          haptic.success();
          load();
        }},
      ],
    );
  };

  // ── Delete Cycle ──────────────────────────────────────────────────────────

  const handleDeleteCycle = () => {
    if (!cycle) return;
    Alert.alert(
      t('dog.deleteHeatTitle'),
      t('dog.deleteEntryBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: async () => {
          await deleteHeatCycle(cycle.id);
          haptic.success();
          router.back();
        }},
      ],
    );
  };

  // ── Phase CRUD ────────────────────────────────────────────────────────────

  const openNewPhase = () => {
    setEditingPhase(null);
    setPhaseType(null);
    setPhaseStart(new Date());
    setPhaseEnd(null);
    setPhaseNotes('');
    setShowPhaseForm(true);
  };

  const openEditPhase = (p: HeatPhase) => {
    setEditingPhase(p);
    setPhaseType(p.phaseType);
    setPhaseStart(new Date(p.startDate));
    setPhaseEnd(p.endDate ? new Date(p.endDate) : null);
    setPhaseNotes(p.notes ?? '');
    setShowPhaseForm(true);
  };

  const savePhase = async () => {
    if (!cycle || !phaseType || !phaseStart) return;
    try {
      if (editingPhase) {
        await updateHeatPhase(editingPhase.id, {
          phaseType,
          startDate: toISODate(phaseStart),
          endDate: phaseEnd ? toISODate(phaseEnd) : null,
          notes: phaseNotes.trim() || null,
        });
      } else {
        // If a previous phase is still open, close it
        const openPhase = phases.find(p => !p.endDate);
        if (openPhase) {
          // Close the previous phase one day before the new phase starts
          const prevDay = new Date(phaseStart);
          prevDay.setDate(prevDay.getDate() - 1);
          await updateHeatPhase(openPhase.id, {
            endDate: toISODate(prevDay),
          });
        }
        await addHeatPhase(cycle.id, {
          phaseType,
          startDate: toISODate(phaseStart),
          endDate: phaseEnd ? toISODate(phaseEnd) : null,
          notes: phaseNotes.trim() || null,
        }, cycle.dogId);
      }
      haptic.success();
      setShowPhaseForm(false);
      load();
    } catch {
      haptic.error();
    }
  };

  const handleDeletePhase = (p: HeatPhase) => {
    Alert.alert(t('heat.deletePhaseTitle'), t('heat.deletePhaseBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deleteHeatPhase(p.id);
        load();
      }},
    ]);
  };

  // ── Observation CRUD ──────────────────────────────────────────────────────

  const openNewObs = () => {
    setObsType(null);
    setObsDate(new Date());
    setObsValue('');
    setObsNotes('');
    setShowObsForm(true);
  };

  const saveObs = async () => {
    if (!cycle || !obsType || !obsDate) return;
    try {
      await addHeatObservation(cycle.id, {
        date: toISODate(obsDate),
        type: obsType,
        value: obsValue.trim() || null,
        notes: obsNotes.trim() || null,
      }, cycle.dogId);
      haptic.success();
      setShowObsForm(false);
      load();
    } catch {
      haptic.error();
    }
  };

  const handleDeleteObs = (o: HeatObservation) => {
    Alert.alert(t('heat.deleteObsTitle'), t('heat.deleteObsBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        await deleteHeatObservation(o.id);
        load();
      }},
    ]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (!capLoading && !isPro) return null;
  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={PINK} /></View>;
  }
  if (!cycle) {
    return (
      <View style={s.center}>
        <Text style={s.err}>{t('heat.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()}><Text style={s.link}>{t('common.back')}</Text></TouchableOpacity>
      </View>
    );
  }

  const active = isActiveCycle(cycle);
  const dur = durationDays(cycle.startDate, cycle.endDate);
  const today = toISODate(new Date());
  const cycleDay = heatCycleDay(cycle.startDate, today);
  const currentPhase = active
    ? [...phases]
      .filter(phase => phase.startDate <= today && (!phase.endDate || phase.endDate >= today))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
    : null;

  // Timeline: merge phases + observations chronologically
  const timeline: { kind: 'start' | 'end' | 'phase' | 'observation'; date: string; data: HeatPhase | HeatObservation }[] = [];
  timeline.push({ kind: 'start', date: cycle.startDate, data: cycle as unknown as HeatPhase });
  phases.forEach(p => timeline.push({ kind: 'phase', date: p.startDate, data: p }));
  observations.forEach(o => timeline.push({ kind: 'observation', date: o.date, data: o }));
  if (cycle.endDate) {
    timeline.push({ kind: 'end', date: cycle.endDate, data: cycle as unknown as HeatPhase });
  }
  timeline.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

  return (
    <View style={s.root}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.bar}>
          <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="chevron-back" size={20} color={C.trackText} />
          </TouchableOpacity>
          <Text style={s.barTitle}>{t('heat.title')}</Text>
          <TouchableOpacity style={s.iconBtn} onPress={startEdit} hitSlop={8}>
            <Ionicons name="create-outline" size={18} color={C.trackText} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView
            contentContainerStyle={[s.scroll, { paddingBottom: 32 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
            showsVerticalScrollIndicator={false}
          >
            {/* Status Banner */}
            <View style={[s.banner, active && s.bannerActive]}>
              <View style={s.bannerRow}>
                <View style={[s.bannerDot, active && s.bannerDotActive]} />
                <Text style={[s.bannerTitle, active && s.bannerTitleActive]}>
                  {active ? t('heat.active') : t('heat.completed')}
                </Text>
              </View>
              <Text style={s.bannerDate}>
                {fmtDate(cycle.startDate)}{cycle.endDate ? ` – ${fmtDate(cycle.endDate)}` : ''}
              </Text>
              {active && currentPhase ? <Text style={s.bannerPhase}>Aktuell: {currentPhase.phaseType}</Text> : null}
              <View style={s.bannerStats}>
                <View style={s.bannerStat}>
                  <Text style={s.bannerStatV}>{active ? `Tag ${cycleDay}` : `${dur} Tage`}</Text>
                  <Text style={s.bannerStatL}>{active ? 'Aktuell' : 'Dauer'}</Text>
                </View>
                <View style={s.bannerStatDiv} />
                <View style={s.bannerStat}>
                  <Text style={s.bannerStatV}>{phases.length}</Text>
                  <Text style={s.bannerStatL}>{t('heat.phases')}</Text>
                </View>
                <View style={s.bannerStatDiv} />
                <View style={s.bannerStat}>
                  <Text style={s.bannerStatV}>{observations.length}</Text>
                  <Text style={s.bannerStatL}>{t('heat.observations')}</Text>
                </View>
              </View>
            </View>

            {/* Edit form (inline) */}
            {editing && (
              <View style={s.editCard}>
                <Text style={s.sectionLabel}>{t('heat.editCycle')}</Text>
                <Text style={s.label}>{t('dog.heatStart')}</Text>
                <DateField value={editStart} onChange={setEditStart} maximumDate={new Date()} />
                <Text style={s.label}>{t('dog.heatEndOptional')}</Text>
                <DateField value={editEnd} onChange={setEditEnd} onClear={() => setEditEnd(null)} placeholder={t('dog.stillOpen')} maximumDate={new Date()} />
                <Text style={s.label}>{t('dog.observationsOptional')}</Text>
                <TextInput
                  value={editNotes} onChangeText={setEditNotes} multiline
                  placeholder={t('dog.heatNotesPlaceholder')}
                  placeholderTextColor={C.trackTextMut}
                  style={[s.input, s.multiline]}
                />
                <View style={s.editActions}>
                  <TouchableOpacity onPress={() => setEditing(false)} style={s.editCancel}>
                    <Text style={s.editCancelTxt}>{t('common.cancel')}</Text>
                  </TouchableOpacity>
                  <AnyvoButton label={t('common.save')} icon="checkmark" onPress={saveCycle} loading={saving} />
                </View>
              </View>
            )}

            {/* Action Buttons */}
            {!editing && (
              <View style={s.actions}>
                <TouchableOpacity style={s.actionBtn} onPress={openNewPhase} activeOpacity={0.85}>
                  <Ionicons name="add-circle-outline" size={18} color={PINK} />
                  <Text style={s.actionTxt}>{t('heat.addPhase')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={openNewObs} activeOpacity={0.85}>
                  <Ionicons name="eye-outline" size={18} color={C.trackPrimary} />
                  <Text style={s.actionTxt}>{t('heat.addObservation')}</Text>
                </TouchableOpacity>
                {active && (
                  <TouchableOpacity style={s.actionBtn} onPress={handleEndCycle} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={C.trackPrimary} />
                    <Text style={s.actionTxt}>{t('heat.endCycle')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Timeline */}
            {timeline.length > 0 && (
              <>
                <Text style={s.sectionLabel}>{t('heat.timeline')}</Text>
                <View style={s.timeline}>
                  {timeline.map((item, i) => {
                    const isLast = i === timeline.length - 1;
                    if (item.kind === 'start') {
                      return (
                        <View key={`start-${i}`} style={[s.tlItem, isLast && s.tlItemLast]}>
                          <View style={[s.tlDot, s.tlDotStart]} />
                          {!isLast && <View style={s.tlLine} />}
                          <View style={s.tlContent}>
                            <Text style={s.tlDate}>{fmtDate(item.date)}</Text>
                            <Text style={s.tlTitle}>{t('heat.cycleStart')}</Text>
                            {cycle.notes ? <View style={s.tlNote}><Text style={s.tlNoteLabel}>Notiz</Text><Text style={s.tlSub} numberOfLines={2}>{cycle.notes}</Text></View> : null}
                          </View>
                        </View>
                      );
                    }
                    if (item.kind === 'end') {
                      return (
                        <View key={`end-${i}`} style={[s.tlItem, isLast && s.tlItemLast]}>
                          <View style={[s.tlDot, s.tlDotEnd]} />
                          {!isLast && <View style={s.tlLine} />}
                          <View style={s.tlContent}>
                            <Text style={s.tlDate}>{fmtDate(item.date)}</Text>
                            <Text style={s.tlTitle}>{t('heat.cycleEnd')}</Text>
                          </View>
                        </View>
                      );
                    }
                    if (item.kind === 'phase') {
                      const p = item.data as HeatPhase;
                      const durP = durationDays(p.startDate, p.endDate);
                      return (
                        <View key={`phase-${p.id}`} style={[s.tlItem, isLast && s.tlItemLast]}>
                          <View style={[s.tlDot, s.tlDotPhase]} />
                          {!isLast && <View style={s.tlLine} />}
                          <View style={s.tlContent}>
                            <View style={s.tlRow}>
                              <Text style={s.tlDate}>{fmtDate(p.startDate)}{p.endDate ? ` – ${fmtDate(p.endDate)}` : ''}</Text>
                              <View style={s.tlPhaseActions}>
                                <TouchableOpacity onPress={() => openEditPhase(p)} hitSlop={6} style={s.tlAction}>
                                  <Ionicons name="create-outline" size={14} color={C.trackTextMut} />
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => handleDeletePhase(p)} hitSlop={6} style={s.tlAction}>
                                  <Ionicons name="trash-outline" size={14} color={C.trackTextMut} />
                                </TouchableOpacity>
                              </View>
                            </View>
                            <Text style={s.tlTitle}>{p.phaseType}</Text>
                            {durP ? <Text style={s.tlSub}>{durP} {t('heat.days')}</Text> : null}
                            {p.notes ? <Text style={s.tlSub} numberOfLines={2}>{p.notes}</Text> : null}
                          </View>
                        </View>
                      );
                    }
                    // Observation
                    const o = item.data as HeatObservation;
                    return (
                      <View key={`obs-${o.id}`} style={[s.tlItem, isLast && s.tlItemLast]}>
                        <View style={[s.tlDot, s.tlDotObs]} />
                        {!isLast && <View style={s.tlLine} />}
                        <View style={s.tlContent}>
                          <View style={s.tlRow}>
                            <Text style={s.tlDate}>{fmtDate(o.date)}</Text>
                            <TouchableOpacity onPress={() => handleDeleteObs(o)} hitSlop={6} style={s.tlAction}>
                              <Ionicons name="trash-outline" size={14} color={C.trackTextMut} />
                            </TouchableOpacity>
                          </View>
                          <Text style={s.tlTitle}>{o.type}</Text>
                          {o.value ? <Text style={s.tlValue}>{o.value}</Text> : null}
                          {o.notes ? <Text style={s.tlSub} numberOfLines={2}>{o.notes}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            )}

            {/* Delete Cycle */}
            {!editing && (
              <TouchableOpacity style={s.deleteBtn} onPress={handleDeleteCycle} activeOpacity={0.85}>
                <Ionicons name="trash-outline" size={16} color={C.trackDanger} />
                <Text style={s.deleteTxt}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Phase Form Modal */}
        {showPhaseForm && (
          <View style={s.modal}>
            <View style={s.modalInner}>
              <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
                    <View style={s.modalBar}>
                      <TouchableOpacity onPress={() => setShowPhaseForm(false)} hitSlop={8}>
                        <Ionicons name="close" size={22} color={C.trackText} />
                      </TouchableOpacity>
                      <Text style={s.modalTitle}>{editingPhase ? t('heat.editPhase') : t('heat.addPhase')}</Text>
                      <View style={{ width: 30 }} />
                    </View>

                    <Text style={s.label}>{t('heat.phaseType')}</Text>
                    <View style={s.chips}>
                      {[...HEAT_PHASE_TYPES].map(ph => {
                        const on = phaseType === ph;
                        return (
                          <TouchableOpacity key={ph} style={[s.chip, on && s.chipOn]} onPress={() => setPhaseType(on ? null : ph)} activeOpacity={0.85}>
                            <Text style={[s.chipTxt, on && s.chipTxtOn]}>{ph}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={s.label}>{t('dog.heatStart')}</Text>
                    <DateField value={phaseStart} onChange={setPhaseStart} maximumDate={new Date()} />

                    <Text style={s.label}>{t('dog.heatEndOptional')}</Text>
                    <DateField value={phaseEnd} onChange={setPhaseEnd} onClear={() => setPhaseEnd(null)} placeholder={t('dog.stillOpen')} maximumDate={new Date()} />

                    <Text style={s.label}>{t('dog.observationsOptional')}</Text>
                    <TextInput
                      value={phaseNotes} onChangeText={setPhaseNotes} multiline
                      placeholder={t('dog.heatNotesPlaceholder')}
                      placeholderTextColor={C.trackTextMut}
                      style={[s.input, s.multiline]}
                    />

                    <View style={{ height: 16 }} />
                    <AnyvoButton
                      label={editingPhase ? t('common.save') : t('heat.addPhase')}
                      icon="checkmark"
                      onPress={savePhase}
                      loading={false}
                    />
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </View>
          </View>
        )}

        {/* Observation Form Modal */}
        {showObsForm && (
          <View style={s.modal}>
            <View style={s.modalInner}>
              <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                  <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
                    <View style={s.modalBar}>
                      <TouchableOpacity onPress={() => setShowObsForm(false)} hitSlop={8}>
                        <Ionicons name="close" size={22} color={C.trackText} />
                      </TouchableOpacity>
                      <Text style={s.modalTitle}>{t('heat.addObservation')}</Text>
                      <View style={{ width: 30 }} />
                    </View>

                    <Text style={s.label}>{t('heat.obsType')}</Text>
                    <View style={s.chips}>
                      {[...HEAT_OBSERVATION_TYPES].map(tp => {
                        const on = obsType === tp;
                        return (
                          <TouchableOpacity key={tp} style={[s.chip, on && s.chipOn]} onPress={() => setObsType(on ? null : tp)} activeOpacity={0.85}>
                            <Text style={[s.chipTxt, on && s.chipTxtOn]}>{tp}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>

                    <Text style={s.label}>{t('heat.obsDate')}</Text>
                    <DateField value={obsDate} onChange={setObsDate} maximumDate={new Date()} />

                    <Text style={s.label}>{t('heat.obsValueOptional')}</Text>
                    <TextInput
                      value={obsValue} onChangeText={setObsValue}
                      placeholder={t('heat.obsValuePlaceholder')}
                      placeholderTextColor={C.trackTextMut}
                      style={s.input}
                    />

                    <Text style={s.label}>{t('dog.observationsOptional')}</Text>
                    <TextInput
                      value={obsNotes} onChangeText={setObsNotes} multiline
                      placeholder={t('dog.heatNotesPlaceholder')}
                      placeholderTextColor={C.trackTextMut}
                      style={[s.input, s.multiline]}
                    />

                    <View style={{ height: 16 }} />
                    <AnyvoButton label={t('heat.addObservation')} icon="checkmark" onPress={saveObs} loading={false} />
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: C.trackBg },
  flex:      { flex: 1 },
  center:    { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 32 },
  err:       { fontSize: 15, color: C.trackTextSec, textAlign: 'center', marginBottom: 12 },
  link:      { fontSize: 14, color: C.trackPrimary, fontWeight: '700' },
  bar:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  iconBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' },
  barTitle:  { flex: 1, fontSize: 16, color: C.trackText, fontWeight: '800', textAlign: 'center' },
  scroll:    { padding: 16, gap: 12 },

  // Status Banner
  banner:       { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 8 },
  bannerActive: { borderColor: 'rgba(244,114,182,0.35)', backgroundColor: PINK_DIM },
  bannerRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bannerDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: C.trackTextMut },
  bannerDotActive: { backgroundColor: PINK },
  bannerTitle:  { fontSize: 14, color: C.trackTextSec, fontWeight: '700' },
  bannerTitleActive: { color: PINK, fontWeight: '800' },
  bannerDate:   { fontSize: 18, color: C.trackText, fontWeight: '900' },
  bannerPhase:  { alignSelf: 'flex-start', borderRadius: 8, backgroundColor: 'rgba(244,114,182,0.18)', color: '#F9A8D4', fontSize: 12, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 4 },
  bannerStats:  { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, paddingVertical: 10 },
  bannerStat:   { flex: 1, alignItems: 'center' },
  bannerStatV:  { fontSize: 15, color: C.trackText, fontWeight: '800' },
  bannerStatL:  { fontSize: 9.5, color: C.trackTextMut, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 2 },
  bannerStatDiv: { width: 1, alignSelf: 'stretch', backgroundColor: C.trackBorder },

  // Actions
  actions:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, paddingHorizontal: 14, paddingVertical: 11 },
  actionTxt:   { fontSize: 13, color: C.trackText, fontWeight: '700' },

  // Edit
  editCard:     { borderRadius: 18, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, padding: 16, gap: 4 },
  editActions:  { flexDirection: 'row', gap: 8, marginTop: 8 },
  editCancel:   { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center', paddingVertical: 13 },
  editCancelTxt:{ fontSize: 14, color: C.trackTextSec, fontWeight: '700' },

  // Timeline
  timeline:     { gap: 0 },
  sectionLabel: { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 8 },
  tlItem:       { flexDirection: 'row', minHeight: 60 },
  tlItemLast:   {},
  tlDot:        { width: 14, height: 14, borderRadius: 7, marginTop: 4, marginRight: 12, zIndex: 1 },
  tlDotStart:   { backgroundColor: PINK },
  tlDotEnd:     { backgroundColor: C.trackTextMut },
  tlDotPhase:   { backgroundColor: PINK },
  tlDotObs:     { backgroundColor: C.trackPrimary },
  tlLine:       { position: 'absolute', left: 6, top: 18, bottom: -2, width: 2, backgroundColor: C.trackBorder },
  tlContent:    { flex: 1, paddingBottom: 16 },
  tlRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tlDate:       { fontSize: 12, color: C.trackTextMut, fontWeight: '600' },
  tlTitle:      { fontSize: 15, color: C.trackText, fontWeight: '800', marginTop: 2 },
  tlValue:      { fontSize: 14, color: C.trackPrimary, fontWeight: '700', marginTop: 2 },
  tlSub:        { fontSize: 12, color: C.trackTextSec, marginTop: 2 },
  tlNote:       { marginTop: 7, borderLeftWidth: 2, borderLeftColor: 'rgba(244,114,182,0.55)', paddingLeft: 8 },
  tlNoteLabel:  { fontSize: 9.5, color: C.trackTextMut, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  tlPhaseActions: { flexDirection: 'row', gap: 4 },
  tlAction:     { padding: 4 },

  // Delete
  deleteBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,59,48,0.25)', backgroundColor: 'rgba(255,59,48,0.08)', paddingVertical: 13, marginTop: 8 },
  deleteTxt:  { fontSize: 14, color: C.trackDanger, fontWeight: '700' },

  // Form elements
  label:      { fontSize: 11, color: C.trackTextMut, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 12, marginBottom: 2 },
  input:      { backgroundColor: C.trackCard, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: C.trackText },
  multiline:  { minHeight: 90, textAlignVertical: 'top' },
  chips:      { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:       { backgroundColor: C.trackCard, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 13, paddingVertical: 9 },
  chipOn:     { backgroundColor: PINK, borderColor: PINK },
  chipTxt:    { fontSize: 13, color: C.trackTextSec, fontWeight: '700' },
  chipTxtOn:  { color: '#2a0a1c', fontWeight: '800' },

  // Modal (full-screen overlay for phase/obs forms)
  modal:      { ...StyleSheet.absoluteFillObject, backgroundColor: C.trackBg, zIndex: 100 },
  modalInner: { flex: 1 },
  modalScroll:{ padding: 16, gap: 4 },
  modalBar:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  modalTitle: { fontSize: 16, color: C.trackText, fontWeight: '800' },
});
