import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { AnyvoButton } from '@/components/ui/AnyvoButton';
import { AnyvoCard } from '@/components/ui/AnyvoCard';
import { AnyvoChip } from '@/components/ui/AnyvoChip';
import { DateField } from '@/components/ui/DateField';
import { useToast } from '@/components/ui/Toast';
import { useT } from '@/i18n';
import { useSession } from '@/lib/session-context';
import { getDogById } from '@/services/dogs';
import { createHealthAccessGrant, healthGrantStatus, HEALTH_PRESET_PERMISSIONS, loadHealthAccessGrants, loadHealthGrantConnections, revokeHealthAccessGrant, updateHealthAccessGrant, type HealthAccessGrantInput, type HealthGrantConnection, type HealthGrantStatus } from '@/services/healthService';
import { HEALTH_PERMISSIONS, type HealthAccessGrant, type HealthPermission, type HealthRolePreset } from '@/types/health';

const PRESETS: { key: HealthRolePreset; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'vet', label: 'Tierarzt', icon: 'medkit-outline' },
  { key: 'trainer', label: 'Trainer', icon: 'barbell-outline' },
  { key: 'family', label: 'Familie / Betreuung', icon: 'people-outline' },
  { key: 'custom', label: 'Individuell', icon: 'options-outline' },
];

const PERMISSION_LABELS: Record<HealthPermission, string> = {
  can_view_health_summary: 'Übersicht / Basisdaten', can_view_weight: 'Gewicht', can_view_vaccinations: 'Impfungen',
  can_view_parasite_treatments: 'Parasiten', can_view_medications: 'Medikamente', can_view_diagnoses: 'Diagnosen',
  can_view_allergies: 'Allergien / Unverträglichkeiten', can_view_vet_visits: 'Tierarzttermine', can_view_vet_reports: 'Tierarztberichte',
  can_view_lab_results: 'Laborergebnisse', can_view_health_documents: 'Gesundheitsdokumente', can_view_emergency_info: 'Notfallinformationen',
  can_edit_health: 'Gesundheitsdaten bearbeiten', can_add_vet_notes: 'Tierarzt-Notizen hinzufügen',
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
  const [permissions, setPermissions] = useState<Record<HealthPermission, boolean>>(EMPTY_PERMISSIONS);
  const [startsAt, setStartsAt] = useState(new Date());
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [editing, setEditing] = useState<HealthAccessGrant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [owner, setOwner] = useState(false);

  const reload = useCallback(async () => {
    if (!dogId || !user) return;
    setLoading(true);
    const [dogResult, grantResult, connectionResult] = await Promise.all([getDogById(dogId), loadHealthAccessGrants(dogId), loadHealthGrantConnections()]);
    const dog = dogResult.data;
    const isOwner = !!dog && dog.owner_id === user.id;
    setOwner(isOwner);
    if (dog) setDogName(dog.name);
    if (isOwner) {
      setGrants(grantResult.data);
      setConnections(connectionResult.data);
    }
    setLoading(false);
  }, [dogId, user]);

  useEffect(() => { reload(); }, [reload]);

  const connectionName = useMemo(() => new Map(connections.map(connection => [connection.counterpartId, connection.counterpartName || connection.counterpartUsername || 'Verbindung'])), [connections]);
  const resetEditor = () => { setEditing(null); setSelectedConnection(null); setPreset('trainer'); setPermissions(EMPTY_PERMISSIONS()); setStartsAt(new Date()); setExpiresAt(null); };
  const applyPreset = (value: HealthRolePreset) => { setPreset(value); const next = EMPTY_PERMISSIONS(); for (const permission of value === 'custom' ? [] : HEALTH_PRESET_PERMISSIONS[value]) next[permission] = true; setPermissions(next); };
  const editGrant = (grant: HealthAccessGrant) => { setEditing(grant); setSelectedConnection(connections.find(connection => connection.counterpartId === grant.grantee_user_id) ?? null); setPreset(grant.role_preset); setPermissions(Object.fromEntries(HEALTH_PERMISSIONS.map(permission => [permission, grant[permission]])) as Record<HealthPermission, boolean>); setStartsAt(new Date(grant.starts_at)); setExpiresAt(grant.expires_at ? new Date(grant.expires_at) : null); };
  const dateIso = (date: Date) => date.toISOString();
  const save = async () => {
    if (!dogId || !selectedConnection || saving) return;
    setSaving(true);
    const input: HealthAccessGrantInput = { connection_id: selectedConnection.id, grantee_user_id: selectedConnection.counterpartId, role_preset: preset, starts_at: dateIso(startsAt), expires_at: expiresAt ? dateIso(expiresAt) : null, ...permissions };
    const result = editing ? await updateHealthAccessGrant(editing.id, input) : await createHealthAccessGrant(dogId, input);
    setSaving(false);
    if (result.error) { showToast('Freigabe konnte nicht gespeichert werden.'); return; }
    showToast(editing ? 'Freigabe aktualisiert' : 'Freigabe erstellt'); resetEditor(); await reload();
  };
  const revoke = (grant: HealthAccessGrant) => Alert.alert('Freigabe widerrufen?', `Die Gesundheitsdaten werden für ${connectionName.get(grant.grantee_user_id) ?? 'diese Person'} sofort gesperrt.`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Widerrufen', style: 'destructive', onPress: async () => { const result = await revokeHealthAccessGrant(grant.id); if (result.error) showToast('Freigabe konnte nicht widerrufen werden.'); else { showToast('Freigabe widerrufen'); await reload(); } } }]);

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={C.trackPrimary} /></View>;
  if (!owner) return <View style={s.center}><Text style={s.error}>{t('health.shareOwnerOnly')}</Text><AnyvoButton label="Zurück" variant="secondary" onPress={() => router.back()} /></View>;
  return <View style={s.root}><SafeAreaView edges={['top']} style={s.flex}><View style={s.header}><TouchableOpacity style={s.iconButton} onPress={() => router.back()}><Ionicons name="chevron-back" size={20} color={C.trackText} /></TouchableOpacity><View style={s.headerText}><Text style={s.headerTitle}>{t('health.shareTitle')}</Text><Text style={s.headerDog}>{dogName}</Text></View><View style={s.iconButton} /></View><ScrollView contentContainerStyle={s.scroll}><AnyvoCard><Text style={s.section}>{t('health.shareNew')}</Text>{connections.length ? <><Text style={s.label}>{t('health.sharePerson')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>{connections.map(connection => <AnyvoChip key={connection.id} label={connection.counterpartName || connection.counterpartUsername || 'Verbindung'} active={selectedConnection?.id === connection.id} onPress={() => setSelectedConnection(connection)} />)}</ScrollView><Text style={s.label}>{t('health.sharePreset')}</Text><View style={s.presetGrid}>{PRESETS.map(item => <TouchableOpacity key={item.key} style={[s.preset, preset === item.key && s.presetActive]} onPress={() => applyPreset(item.key)}><Ionicons name={item.icon} size={18} color={preset === item.key ? C.accentText : C.trackPrimary} /><Text style={s.presetText}>{item.key === 'vet' ? 'Tierarzt' : item.key === 'trainer' ? 'Trainer' : item.key === 'family' ? 'Familie / Betreuung' : 'Individuell'}</Text></TouchableOpacity>)}</View><Text style={s.label}>{t('health.sharePermissions')}</Text>{READ_PERMISSIONS.map(permission => <View key={permission} style={s.permission}><Text style={s.permissionText}>{PERMISSION_LABELS[permission]}</Text><Switch value={permissions[permission]} onValueChange={value => setPermissions(current => ({ ...current, [permission]: value }))} trackColor={{ false: C.trackCardAlt, true: C.trackPrimary }} thumbColor="#fff" /></View>)}<DateField label={t('health.shareStart')} value={startsAt} onChange={setStartsAt} /><DateField label={t('health.shareEnd')} value={expiresAt} onChange={setExpiresAt} onClear={() => setExpiresAt(null)} minimumDate={startsAt} /><View style={s.actions}><AnyvoButton label={editing ? t('health.shareUpdate') : t('health.shareCreate')} icon="checkmark" onPress={save} loading={saving} />{editing ? <AnyvoButton label={t('health.shareCancel')} variant="secondary" onPress={resetEditor} /> : null}</View></> : <Text style={s.empty}>{t('health.shareNoConnections')}</Text>}</AnyvoCard><Text style={s.section}>{t('health.shareExisting')}</Text>{grants.length ? grants.map(grant => <GrantCard key={grant.id} grant={grant} name={connectionName.get(grant.grantee_user_id) ?? 'Verbindung'} onEdit={() => editGrant(grant)} onRevoke={() => revoke(grant)} />) : <AnyvoCard><Text style={s.empty}>{t('health.shareNoGrants')}</Text></AnyvoCard>}</ScrollView></SafeAreaView>{toast}</View>;
}

function GrantCard({ grant, name, onEdit, onRevoke }: { grant: HealthAccessGrant; name: string; onEdit: () => void; onRevoke: () => void }) { const status = healthGrantStatus(grant); const summary = READ_PERMISSIONS.filter(permission => grant[permission]).map(permission => PERMISSION_LABELS[permission]).slice(0, 3).join(' · '); const statusText: Record<HealthGrantStatus, string> = { active: 'Aktiv', future: `Beginnt am ${new Date(grant.starts_at).toLocaleDateString('de-CH')}`, expired: 'Abgelaufen', revoked: 'Widerrufen' }; return <AnyvoCard><View style={s.grantHeader}><View style={{ flex: 1 }}><Text style={s.grantName}>{name}</Text><Text style={s.muted}>{grant.role_preset} · {statusText[status]}</Text><Text style={s.muted}>{summary || 'Keine Leseberechtigungen'}</Text></View><Ionicons name={status === 'active' ? 'checkmark-circle-outline' : 'time-outline'} size={22} color={status === 'active' ? C.trackPrimary : C.trackWarning} /></View>{grant.expires_at ? <Text style={s.muted}>Läuft ab am {new Date(grant.expires_at).toLocaleDateString('de-CH')}</Text> : null}<View style={s.grantActions}><AnyvoButton label="Bearbeiten" variant="secondary" onPress={onEdit} /><AnyvoButton label="Widerrufen" variant="secondary" onPress={onRevoke} /></View></AnyvoCard>; }

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: C.trackBg }, flex: { flex: 1 }, center: { flex: 1, backgroundColor: C.trackBg, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }, error: { color: C.trackTextSec, fontSize: 15, textAlign: 'center' }, header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 12 }, iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, alignItems: 'center', justifyContent: 'center' }, headerText: { flex: 1, alignItems: 'center' }, headerTitle: { color: C.trackText, fontWeight: '900', fontSize: 16 }, headerDog: { color: C.trackTextSec, fontSize: 12, marginTop: 2 }, scroll: { padding: 16, gap: 14 }, section: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 12 }, label: { color: C.trackTextMut, fontSize: 12, fontWeight: '800', marginTop: 8, marginBottom: 7 }, row: { gap: 8, paddingBottom: 4 }, presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, preset: { flexGrow: 1, minWidth: '46%', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, backgroundColor: C.trackCard, gap: 7 }, presetActive: { backgroundColor: C.accentDim, borderColor: C.trackPrimary }, presetText: { color: C.trackText, fontWeight: '800', fontSize: 12 }, permission: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.trackBorder }, permissionText: { flex: 1, color: C.trackText, fontSize: 13 }, actions: { gap: 8, marginTop: 12 }, empty: { color: C.trackTextSec, lineHeight: 20 }, grantHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, grantName: { color: C.trackText, fontSize: 16, fontWeight: '900' }, muted: { color: C.trackTextSec, fontSize: 12, marginTop: 4 }, grantActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
