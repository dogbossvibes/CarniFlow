import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { DateField } from '@/components/ui/DateField';
import { useToast } from '@/components/ui/Toast';
import { formatDate as localizedDate } from '@/i18n/format';
import { useT, translate as healthT, type TranslationKey } from '@/i18n';
import { useSession } from '@/lib/session-context';
import { getDogById } from '@/services/dogs';
import { connectAnyvoPerson, searchAnyvoPeople, type AnyvoPersonResult } from '@/services/connectionService';
import { createHealthAccessGrant, healthGrantStatus, HEALTH_PRESET_PERMISSIONS, loadHealthAccessGrants, loadHealthGrantConnections, revokeHealthAccessGrant, updateHealthAccessGrant, type HealthAccessGrantInput, type HealthGrantConnection } from '@/services/healthService';
import { HEALTH_PERMISSIONS, type HealthAccessGrant, type HealthPermission, type HealthRolePreset } from '@/types/health';

const PRESETS: { key: HealthRolePreset; label: TranslationKey; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'vet', label: "dog.vet", icon: 'medkit-outline' },
  { key: 'trainer', label: "membership.trainer", icon: 'barbell-outline' },
  { key: 'family', label: "health.uxFamily", icon: 'people-outline' },
  { key: 'custom', label: "health.uxCustom", icon: 'options-outline' },
];

const PERMISSION_LABELS: Record<HealthPermission, TranslationKey> = {
  can_view_health_summary: "health.uxSummaryPermission", can_view_weight: "health.recordWeight", can_view_vaccinations: "health.uxVaccinations",
  can_view_parasite_treatments: "health.recordParasites", can_view_medications: "health.uxMedications", can_view_diagnoses: "health.recordConditions",
  can_view_allergies: "health.uxAllergiesPermission", can_view_vet_visits: "health.uxVetAppointments", can_view_vet_reports: "health.uxVetReports",
  can_view_lab_results: "health.uxLabResults", can_view_health_documents: "health.uxHealthDocuments", can_view_emergency_info: "health.recordEmergencyTitle",
  can_edit_health: "health.uxEditPermission", can_add_vet_notes: "health.uxVetNotesPermission",
};

const READ_PERMISSIONS = HEALTH_PERMISSIONS.filter(permission => permission.startsWith('can_view_'));
const EMPTY_PERMISSIONS = (): Record<HealthPermission, boolean> => Object.fromEntries(HEALTH_PERMISSIONS.map(permission => [permission, false])) as Record<HealthPermission, boolean>;

export default function DogHealthSharingRoute() {
  const router = useRouter();
  const { id: dogId } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();
  const { t } = useT();
  const { showToast, toast } = useToast();
  const [dogName, setDogName] = useState('');
  const [grants, setGrants] = useState<HealthAccessGrant[]>([]);
  const [connections, setConnections] = useState<HealthGrantConnection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<HealthGrantConnection | null>(null);
  const [preset, setPreset] = useState<HealthRolePreset>('trainer');
  const [permissions, setPermissions] = useState<Record<HealthPermission, boolean>>(() => EMPTY_PERMISSIONS());
  const [startsAt, setStartsAt] = useState(new Date());
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [editing, setEditing] = useState<HealthAccessGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const loadGeneration = useRef(0);
  useEffect(() => () => { loadGeneration.current += 1; }, []);
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState(false);
  // Generische ANYVO-Personen-Suche (Health Sharing braucht KEINEN Trainer —
  // Customer Release Phase 9): eigenständig von app/trainer/index.tsx, nutzt
  // searchAnyvoPeople/connectAnyvoPerson statt der Trainer-Code-RPC.
  const [personSearchOpen, setPersonSearchOpen] = useState(false);
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<AnyvoPersonResult[]>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [personConnectingId, setPersonConnectingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!dogId || !user) return;
    const generation = ++loadGeneration.current;
    setLoading(true); setLoadError(false);
    try {
    const [dogResult, grantResult, connectionResult] = await Promise.all([getDogById(dogId), loadHealthAccessGrants(dogId), loadHealthGrantConnections()]);
    if (generation !== loadGeneration.current) return;
    if (dogResult.error || grantResult.error || connectionResult.error) throw new Error('load');
    const dog = dogResult.data;
    const isOwner = !!dog && dog.owner_id === user.id;
    setOwner(isOwner);
    if (dog) setDogName(dog.name);
    if (isOwner) {
      setGrants(grantResult.data);
      setConnections(connectionResult.data);
    }
    } catch { if (generation === loadGeneration.current) setLoadError(true); }
    finally { if (generation === loadGeneration.current) setLoading(false); }
  }, [dogId, user]);

  useFocusEffect(useCallback(() => { reload(); }, [reload]));

  const connectionName = useMemo(() => new Map(connections.map(connection => [connection.counterpartId, connection.counterpartName || connection.counterpartUsername || healthT("chat.connectionFallback")])), [connections]);
  const resetEditor = () => { setEditing(null); setSelectedConnection(null); setPreset('trainer'); applyPreset('trainer'); setStartsAt(new Date()); setExpiresAt(null); };
  const applyPreset = (value: HealthRolePreset) => { setPreset(value); const next = EMPTY_PERMISSIONS(); for (const permission of value === 'custom' ? [] : HEALTH_PRESET_PERMISSIONS[value]) next[permission] = true; setPermissions(next); };
  const editGrant = (grant: HealthAccessGrant) => { setEditing(grant); setSelectedConnection(connections.find(connection => connection.counterpartId === grant.grantee_user_id) ?? null); setPreset(grant.role_preset); setPermissions(Object.fromEntries(HEALTH_PERMISSIONS.map(permission => [permission, grant[permission]])) as Record<HealthPermission, boolean>); setStartsAt(new Date(grant.starts_at)); setExpiresAt(grant.expires_at ? new Date(grant.expires_at) : null); };
  const readPermissionCount = READ_PERMISSIONS.filter(permission => permissions[permission]).length;
  const selectAll = () => setPermissions(current => ({ ...current, ...Object.fromEntries(READ_PERMISSIONS.map(permission => [permission, true])) }));
  const clearAll = () => setPermissions(current => ({ ...current, ...Object.fromEntries(READ_PERMISSIONS.map(permission => [permission, false])) }));
  const openConnectionFlow = () => setPersonSearchOpen(true);
  const dateIso = (date: Date) => date.toISOString();

  useEffect(() => {
    if (!personSearchOpen) return;
    const q = personQuery.trim();
    if (!q) { setPersonResults([]); setPersonSearching(false); return; }
    setPersonSearching(true);
    let cancelled = false;
    const timer = setTimeout(() => {
      searchAnyvoPeople(q).then(r => { if (!cancelled) { setPersonResults(r); setPersonSearching(false); } }).catch(() => { if (!cancelled) setPersonSearching(false); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [personQuery, personSearchOpen]);

  const connectPerson = async (person: AnyvoPersonResult) => {
    if (!user) return;
    setPersonConnectingId(person.id);
    const result = await connectAnyvoPerson(user.id, person.id);
    setPersonConnectingId(null);
    if (result.error) { showToast(result.error); return; }
    setPersonSearchOpen(false); setPersonQuery(''); setPersonResults([]);
    await reload();
    const fresh = await loadHealthGrantConnections();
    const match = fresh.data.find(c => c.counterpartId === person.id);
    if (match) setSelectedConnection(match);
  };
  const save = async () => {
    if (!dogId || !selectedConnection || saving) return;
    setSaving(true);
    const input: HealthAccessGrantInput = { connection_id: selectedConnection.id, grantee_user_id: selectedConnection.counterpartId, role_preset: preset, starts_at: dateIso(startsAt), expires_at: expiresAt ? dateIso(expiresAt) : null, ...permissions };
    const result = editing ? await updateHealthAccessGrant(editing.id, input) : await createHealthAccessGrant(dogId, input);
    setSaving(false);
    if (result.error) { showToast(healthT("health.uxShareSaveFailed")); return; }
    showToast(editing ? healthT("health.uxShareUpdated") : healthT("health.uxShareCreated")); resetEditor(); await reload();
  };
  const revoke = (grant: HealthAccessGrant) => Alert.alert(healthT("health.uxShareRevokeTitle"), t('health.uxShareRevokeBody', { name: connectionName.get(grant.grantee_user_id) ?? t('health.uxThisPerson') }), [{ text: healthT("health.shareCancel"), style: 'cancel' }, { text: healthT("health.shareRevoked"), style: 'destructive', onPress: async () => { const result = await revokeHealthAccessGrant(grant.id); if (result.error) showToast(healthT("health.uxShareRevokeFailed")); else { showToast(healthT("health.uxShareRevoked")); await reload(); } } }]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;
  if (loadError) return <View style={s.center}><Text style={s.error}>{t('health.uxLoadFailed')}</Text><AnyvoButton label={t('health.uxRetry')} onPress={reload} /><AnyvoButton label={t('common.back')} variant="secondary" onPress={() => router.back()} /></View>;
  if (!owner) return <View style={s.center}><Text style={s.error}>{t('health.shareOwnerOnly')}</Text><AnyvoButton label={t('common.back')} variant="secondary" onPress={() => router.back()} /></View>;
  return <View style={s.root}><SafeAreaView edges={['top']} style={s.flex}><View style={s.header}><TouchableOpacity style={s.iconButton} onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('common.back')}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity><View style={s.headerText}><Text style={s.headerTitle}>{t('health.shareTitle')}</Text><Text style={s.headerDog}>{dogName}</Text></View><View style={s.iconButton} /></View><ScrollView contentContainerStyle={s.scroll}><AnyvoCard><Text style={s.readOnlyHint}>{t('sharing.ownerLocationHint')}</Text></AnyvoCard><AnyvoCard><Text style={s.section}>{t('health.shareNew')}</Text>{connections.length ? <><View style={s.peopleHeader}><Text style={s.label}>{t('health.sharePerson')}</Text><TouchableOpacity onPress={openConnectionFlow} accessibilityRole="button" accessibilityLabel={t('health.shareConnectPerson')}><Text style={s.permissionAction}>{t('health.shareConnectPerson')}</Text></TouchableOpacity></View><View style={s.peopleList}>{connections.map(connection => { const name = connection.counterpartName || connection.counterpartUsername || t('health.shareConnectionFallback'); return <TouchableOpacity key={connection.id} style={[s.personRow, selectedConnection?.id === connection.id && s.personRowActive]} onPress={() => setSelectedConnection(connection)} accessibilityRole="radio" accessibilityState={{ checked: selectedConnection?.id === connection.id }} accessibilityLabel={name} activeOpacity={0.82}><View style={s.personAvatar}><Text style={s.personAvatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><View style={s.personText}><Text style={s.personName} numberOfLines={1}>{name}</Text>{connection.counterpartUsername && connection.counterpartName ? <Text style={s.personMeta} numberOfLines={1}>@{connection.counterpartUsername}</Text> : <Text style={s.personMeta}>{t('health.shareAcceptedConnection')}</Text>}</View><Ionicons name={selectedConnection?.id === connection.id ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={selectedConnection?.id === connection.id ? C.trackPrimary : C.trackTextMut} /></TouchableOpacity>; })}</View>{selectedConnection ? <><Text style={s.readOnlyHint}>{t('health.shareReadOnly')}</Text><Text style={s.label}>{t('health.sharePreset')}</Text><View style={s.presetGrid}>{PRESETS.map(item => <TouchableOpacity key={item.key} style={[s.preset, preset === item.key && s.presetActive]} onPress={() => applyPreset(item.key)} accessibilityRole="radio" accessibilityState={{ checked: preset === item.key }} accessibilityLabel={t(item.label)}><Ionicons name={item.icon} size={18} color={preset === item.key ? C.accentText : C.trackPrimary} /><Text style={s.presetText}>{t(item.label)}</Text></TouchableOpacity>)}</View><View style={s.permissionHeader}><Text style={s.label}>{t('health.sharePermissions')}</Text><View style={s.permissionActions}><TouchableOpacity onPress={selectAll}><Text style={s.permissionAction}>{t('health.shareSelectAll')}</Text></TouchableOpacity><TouchableOpacity onPress={clearAll}><Text style={s.permissionAction}>{t('health.shareClear')}</Text></TouchableOpacity></View></View>{READ_PERMISSIONS.map(permission => <View key={permission} style={s.permission}><Text style={s.permissionText}>{t(PERMISSION_LABELS[permission])}</Text><Switch accessibilityLabel={t(PERMISSION_LABELS[permission])} value={permissions[permission]} onValueChange={value => setPermissions(current => ({ ...current, [permission]: value }))} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>)}<DateField label={t('health.shareStart')} value={startsAt} onChange={setStartsAt} /><DateField label={t('health.shareEnd')} value={expiresAt} onChange={setExpiresAt} onClear={() => setExpiresAt(null)} minimumDate={startsAt} /><AnyvoCard><Text style={s.readOnlyHint}>{t('health.uxSharePreview', { name: selectedConnection.counterpartName || selectedConnection.counterpartUsername || t('health.shareConnectionFallback') })}</Text>{READ_PERMISSIONS.filter(permission => permissions[permission]).map(permission => <Text key={permission} style={s.muted}>{t(PERMISSION_LABELS[permission])}</Text>)}<Text style={s.muted}>{expiresAt ? t('health.uxShareUntil', { date: localizedDate(expiresAt) }) : t('health.uxShareUnlimited')}</Text></AnyvoCard><View style={s.actions}><AnyvoButton label={editing ? t('health.shareUpdate') : t('health.shareCreate')} icon="checkmark" onPress={save} loading={saving} disabled={!readPermissionCount} />{editing ? <AnyvoButton label={t('health.shareCancel')} variant="secondary" onPress={resetEditor} /> : null}</View></> : <Text style={s.empty}>{t('health.shareSelectPerson')}</Text>}</> : <View style={s.emptyState}><View style={s.emptyIcon}><Ionicons name="person-add-outline" size={24} color={C.trackPrimary} /></View><Text style={s.emptyTitle}>{t('health.shareNoConnectionsTitle')}</Text><Text style={s.empty}>{t('health.shareNoConnectionsBody')}</Text><AnyvoButton label={t('health.shareConnectPerson')} icon="add" onPress={openConnectionFlow} /></View>}</AnyvoCard><Text style={s.section}>{t('health.shareExisting')}</Text>{grants.length ? grants.map(grant => <GrantCard key={grant.id} grant={grant} name={connectionName.get(grant.grantee_user_id) ?? t('health.shareConnectionFallback')} onEdit={() => editGrant(grant)} onRevoke={() => revoke(grant)} />) : <AnyvoCard><Text style={s.empty}>{t('health.shareNoGrants')}</Text></AnyvoCard>}</ScrollView></SafeAreaView>{toast}
    <Modal visible={personSearchOpen} transparent animationType="slide" onRequestClose={() => setPersonSearchOpen(false)}>
      <KeyboardAvoidingView style={s.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={() => setPersonSearchOpen(false)}><View style={s.backdrop} /></TouchableWithoutFeedback>
        <View style={s.sheet}>
          <SafeAreaView edges={['bottom']}>
            <View style={s.griff} />
            <Text style={s.sheetTitle}>{t('health.shareConnectPerson')}</Text>
            <Text style={s.sheetSub}>{t('health.shareSearchSub')}</Text>
            <View style={s.searchRow}>
              <TextInput style={[s.searchInput, s.flex]} placeholder={t('health.shareSearchPlaceholder')} placeholderTextColor={C.trackTextMut}
                value={personQuery} onChangeText={setPersonQuery} autoCorrect={false} autoFocus />
              {personSearching ? <ActivityIndicator size="small" color={C.trackPrimary} style={s.searchSpinner} /> : null}
            </View>
            <ScrollView style={s.searchResults} keyboardShouldPersistTaps="handled">
              {personResults.length === 0 && personQuery.trim().length >= 2 && !personSearching
                ? <Text style={s.empty}>{t('health.shareSearchNoResults')}</Text> : null}
              {personResults.map(person => (
                <TouchableOpacity key={person.id} style={s.personRow} activeOpacity={0.85}
                  onPress={() => connectPerson(person)} disabled={personConnectingId === person.id}>
                  <View style={s.personAvatar}><Text style={s.personAvatarText}>{(person.fullName?.[0] ?? person.username?.[0] ?? '?').toUpperCase()}</Text></View>
                  <View style={s.personText}>
                    <Text style={s.personName} numberOfLines={1}>{person.fullName ?? person.username ?? t('health.shareConnectionFallback')}</Text>
                    {person.username ? <Text style={s.personMeta} numberOfLines={1}>@{person.username}</Text> : null}
                  </View>
                  {personConnectingId === person.id ? <ActivityIndicator size="small" color={C.trackPrimary} /> : <Ionicons name="add-circle-outline" size={22} color={C.trackPrimary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const ROLE_LABELS: Record<HealthRolePreset, TranslationKey> = {
  vet: 'health.recordVet', trainer: 'doghub.tab.trainer', family: 'health.uxFamily', caregiver: 'health.uxFamily', guest: 'health.uxGuest', custom: 'health.uxCustom',
};

function GrantCard({ grant, name, onEdit, onRevoke }: { grant: HealthAccessGrant; name: string; onEdit: () => void; onRevoke: () => void }) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const status = healthGrantStatus(grant);
  const permissions = READ_PERMISSIONS.filter(permission => grant[permission]);
  const summary = permissions.slice(0, 3).map(permission => t(PERMISSION_LABELS[permission])).join(' · ');
  const statusText = status === 'future' ? `${t('health.shareFuture')} ${localizedDate(new Date(grant.starts_at))}` : t(status === 'active' ? 'health.shareActive' : status === 'expired' ? 'health.shareExpired' : 'health.shareRevoked');
  return <AnyvoCard><View style={s.grantHeader}><View style={s.flex}><Text style={s.grantName}>{name}</Text><Text style={s.muted}>{t(ROLE_LABELS[grant.role_preset])} · {statusText}</Text><Text style={s.muted}>{summary || t('health.uxNoReadPermissions')}</Text></View><Ionicons name={status === 'active' ? 'checkmark-circle-outline' : 'time-outline'} size={22} color={status === 'active' ? C.trackPrimary : C.trackWarning} /></View>
    <Text style={s.muted}>{grant.expires_at ? t('health.uxShareUntil', { date: localizedDate(new Date(grant.expires_at)) }) : t('health.uxShareUnlimited')}</Text>
    <TouchableOpacity style={s.permissionListButton} onPress={() => setExpanded(value => !value)} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={t('health.uxPermissionList')}><Text style={s.permissionAction}>{t('health.uxPermissionList')} ({permissions.length})</Text></TouchableOpacity>
    {expanded ? permissions.map(permission => <Text key={permission} style={s.muted}>{t(PERMISSION_LABELS[permission])}</Text>) : null}
    <View style={s.grantActions}><AnyvoButton label={t('health.shareEdit')} variant="secondary" onPress={onEdit} /><AnyvoButton label={t('health.shareRevoke')} variant="secondary" onPress={onRevoke} /></View>
  </AnyvoCard>;
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, error: { color: C.trackTextSec, fontSize: 15, textAlign: 'center' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }, iconButton: { width: 48, height: 48, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' }, headerText: { flex: 1, alignItems: 'center' }, headerTitle: { color: C.trackText, fontWeight: '900', fontSize: 16 }, headerDog: { color: C.trackTextSec, fontSize: 12, marginTop: 2 }, scroll: { padding: 16, gap: 14 }, section: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }, label: { color: C.trackTextMut, fontSize: 12, fontWeight: '800', marginTop: 8, marginBottom: 7 }, peopleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, peopleList: { gap: 8 }, personRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard }, personRowActive: { borderColor: C.trackPrimary, backgroundColor: C.accentDim }, personAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: C.trackCardAlt }, personAvatarText: { color: C.trackPrimary, fontSize: 15, fontWeight: '900' }, personText: { flex: 1 }, personName: { color: C.trackText, fontSize: 14, fontWeight: '800' }, personMeta: { color: C.trackTextSec, fontSize: 11, marginTop: 2 }, readOnlyHint: { color: C.trackTextSec, fontSize: 12, lineHeight: 18, marginTop: 14 }, emptyState: { gap: 10 }, emptyIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: C.trackText, fontSize: 17, fontWeight: '900' }, permissionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }, permissionActions: { flexDirection: 'row', gap: 12, paddingBottom: 7 }, permissionAction: { color: C.trackPrimary, fontSize: 11, fontWeight: '800' }, presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preset: { flexGrow: 1, minWidth: '46%', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, gap: 7 }, presetActive: { backgroundColor: C.accentDim, borderColor: C.trackPrimary }, presetText: { color: C.trackText, fontWeight: '800', fontSize: 12 }, permission: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, minHeight: 48, borderBottomWidth: 1, borderBottomColor: C.trackBorder }, permissionText: { flex: 1, color: C.trackText, fontSize: 13 }, actions: { gap: 8, marginTop: 12 }, empty: { color: C.trackTextSec, lineHeight: 20 }, grantHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, grantName: { color: C.trackText, fontSize: 16, fontWeight: '900' }, muted: { color: C.trackTextSec, fontSize: 12, marginTop: 4 }, grantActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: { backgroundColor: C.trackCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.trackBorder, paddingHorizontal: 20, paddingBottom: 8, paddingTop: 12, maxHeight: '80%' },
  griff: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.trackBorder, alignSelf: 'center', marginBottom: 12 },
  permissionListButton: { minHeight: 48, justifyContent: 'center' },
  sheetTitle: { fontSize: 18, color: C.trackText, fontWeight: '800', marginBottom: 4 }, sheetSub: { fontSize: 13, color: C.trackTextSec, marginBottom: 14 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  searchInput: { flex: 1, backgroundColor: C.trackCardAlt, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, color: C.trackText, fontSize: 15, fontWeight: '500', paddingHorizontal: 14, paddingVertical: 12 },
  searchSpinner: { marginLeft: -34 },
  searchResults: { maxHeight: 360, gap: 8 },
});
