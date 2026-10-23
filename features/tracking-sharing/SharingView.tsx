import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { SharingItem, SharingTab } from './model';
import './i18n';
export interface SharingViewProps {
  tab: SharingTab; contactsOpen: boolean; incoming: SharingItem[]; outgoing: SharingItem[];
  actionable: number; loading: boolean; failed: boolean; complete: boolean; limited: boolean;
  signedIn: boolean; groupsEnabled: boolean; contacts: { userId: string; displayName: string | null }[];
  onBack(): void; onContacts(): void; onTab(tab: SharingTab): void; onRefresh(): void;
  onAction(action: 'transfer' | 'distraction' | 'groups' | 'file'): void; onItem(item: SharingItem): void;
  contactSearch?: ReactNode;
  moduleHeader?: ReactNode;
  context?: ReactNode;
}
type IconName = React.ComponentProps<typeof Feather>['name'];
const Icon = ({ name, size = 20 }: { name: IconName; size?: number }) => <Feather name={name} size={size} color={palette.mint} accessible={false} importantForAccessibility="no-hide-descendants" />;
export function SharingView(p: SharingViewProps) {
  const { t, i18n } = useTranslation('trackSharing');
  const [visible, setVisible] = useState(50);
  useEffect(() => { setVisible(50); }, [p.tab, p.contactsOpen]);
  const { fontScale, width } = useWindowDimensions();
  const largeText = fontScale >= 1.5 || width <= 360 && fontScale >= 1.2;
  const locale = i18n.resolvedLanguage === 'gsw' ? 'de-CH' : i18n.resolvedLanguage ?? 'de-CH';
  const title = p.contactsOpen ? 'contacts' : p.tab === 'overview' ? 'title' : p.tab === 'inbox' ? 'inboxTitle' : 'sent';
  const subtitle = p.contactsOpen ? 'contactsSubtitle' : p.tab === 'overview' ? 'subtitle' : p.tab === 'inbox' ? 'inboxSubtitle' : 'sentSubtitle';
  function item(row: SharingItem) {
    const contact = row.contactId ? p.contacts.find(c => c.userId === row.contactId)?.displayName ?? t('contact') : null;
    return <Pressable key={row.id} testID={`sharing-item-${row.id}`} accessibilityRole="button" onPress={() => p.onItem(row)} style={s.task}>
      <View style={s.taskIcon}><Icon name={row.kind === 'return' ? 'corner-down-left' : row.kind === 'transfer' ? 'navigation' : 'git-branch'} size={24} /></View>
      <View style={s.copy}><Text style={s.tag}>{t(row.kind === 'transfer' ? 'trackTag' : row.kind === 'return' ? 'returnTag' : 'requestTag')}</Text>
        <Text style={s.taskTitle}>{row.title ?? t(row.titleKey ?? 'receivedTrack')}</Text>
        <Text style={s.detail}>{contact ? `${contact} · ` : ''}{t(row.statusKey)} · {new Date(row.createdAtMs).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</Text>
      </View><Icon name="chevron-right" size={15} />
    </Pressable>;
  }
  const file = <Pressable testID="sharing-file" accessibilityRole="button" onPress={() => p.onAction('file')} style={s.file}><Icon name="download" size={17} /><Text style={[s.detail, s.copy]}>{t('file')}</Text><Icon name="chevron-right" size={15} /></Pressable>;
  const list = p.tab === 'sent' ? p.outgoing : p.incoming;
  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
    {p.moduleHeader}
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustKeyboardInsets>
      <View style={s.top}><Pressable accessibilityRole="button" onPress={p.onBack} style={s.back}><Icon name="chevron-left" size={19} /><Text style={s.backText}>{t(p.tab === 'overview' && !p.contactsOpen ? 'back' : 'overview')}</Text></Pressable>
        <Pressable testID="sharing-contacts" accessibilityRole="button" accessibilityLabel={t('contacts')} onPress={p.onContacts} style={s.contactButton}><Icon name="users" size={19} /></Pressable></View>
      <Text accessibilityRole="header" style={s.title}>{p.moduleHeader && p.tab === 'overview' && !p.contactsOpen ? 'Gemeinsam' : t(title)}</Text><Text style={s.subtitle}>{t(subtitle)}</Text>
      {!p.contactsOpen && p.tab === 'overview' && p.context}
      {!p.contactsOpen && <View accessibilityRole="tablist" style={[s.tabs, largeText && s.largeTabs]}>{(['overview', 'inbox', 'sent'] as const).map(tab => <Pressable key={tab} testID={`sharing-tab-${tab}`} accessibilityRole="tab" accessibilityState={{ selected: p.tab === tab }} onPress={() => p.onTab(tab)} style={[s.tab, largeText && s.largeTab, p.tab === tab && s.activeTab]}>
        <Text style={[s.tabText, p.tab === tab && s.activeText]}>{t(tab)}</Text>{tab === 'inbox' && p.complete && p.actionable > 0 && <Text accessibilityLabel={t('openCount', { count: p.actionable })} style={s.badge}>{p.actionable}{p.limited ? '+' : ''}</Text>}
      </Pressable>)}</View>}
      {!p.signedIn && <Text accessibilityRole="alert" style={s.error}>{t('account')}</Text>}
      {p.loading && <View style={s.feedback}><ActivityIndicator color={palette.mint} accessibilityLabel={t('loading')} /><Text style={s.detail}>{t('loading')}</Text></View>}
      {p.failed && <View style={s.feedback}><Text accessibilityRole="alert" style={s.error}>{t('failure')}</Text><Pressable accessibilityRole="button" onPress={p.onRefresh} style={s.retry}><Text style={s.link}>{t('refresh')}</Text></Pressable></View>}
      {p.contactsOpen ? <View style={s.stack}>
        {p.contacts.map(contact => <View key={contact.userId} style={s.person}><View style={s.taskIcon}><Icon name="user-check" /></View><View style={s.copy}><Text style={s.rowTitle}>{contact.displayName ?? t('contact')}</Text><Text style={s.detail}>{t('connected')}</Text></View></View>)}
        {p.complete && !p.contacts.length && <Text style={s.detail}>{t('emptyContacts')}</Text>}{p.contactSearch}<Text style={s.detail}>{t('consent')}</Text>
      </View> : <>
        {p.tab === 'overview' ? <>
          <Text style={s.sectionLabel}>{t('actionHeading')}</Text><View style={s.actions}>{([
            ['transfer', 'transferDetail', 'send'], ['distraction', 'distractionDetail', 'git-branch'], ['groups', 'groupsDetail', 'users'],
          ] as const).map(([action, detail, icon], index) => {
            const disabled = action === 'groups' && !p.groupsEnabled;
            return <Pressable key={action} testID={`sharing-action-${action}`} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={() => p.onAction(action)} style={[s.action, index > 0 && s.divider, disabled && s.disabled]}>
              <View style={s.actionIcon}><Icon name={icon} size={21} /></View><View style={s.copy}><Text style={s.rowTitle}>{t(action)}</Text><Text style={s.detail}>{t(disabled ? 'groupsPending' : detail)}</Text></View><Icon name="chevron-right" size={15} />
            </Pressable>;
          })}</View>
          <View style={s.section}><View testID="sharing-section-heading" style={[s.sectionHead, largeText && s.largeSectionHead]}><Text accessibilityRole="header" style={s.heading}>{t('forYou')}</Text><Pressable accessibilityRole="button" onPress={() => p.onTab('inbox')} style={s.all}><Text style={s.link}>{t('all')}</Text></Pressable></View>
            {p.incoming.slice(0, 1).map(item)}{p.complete && !p.incoming.length && <Text style={s.detail}>{t('emptyInbox')}</Text>}
          </View>
        </> : <View style={s.stack}>{list.slice(0, visible).map(item)}{list.length > visible && <Pressable testID="sharing-more" accessibilityRole="button" onPress={() => setVisible(n => n + 50)} style={s.retry}><Text style={s.link}>{t('more')}</Text></Pressable>}{p.complete && !list.length && <View style={s.empty}><Icon name={p.tab === 'inbox' ? 'inbox' : 'send'} size={28} /><Text style={s.detail}>{t(p.tab === 'inbox' ? 'emptyInbox' : 'emptySent')}</Text></View>}
          {p.tab === 'inbox' && <Text style={s.detail}>{t('groupInboxHint')}</Text>}
        </View>}
        {p.limited && <Text style={s.detail}>{t('limited')}</Text>}{file}
        {!p.loading && !p.failed && <Pressable accessibilityRole="button" onPress={p.onRefresh} style={s.refresh}><Text style={s.detail}>{t('refresh')}</Text></Pressable>}
      </>}
    </ScrollView>
  </SafeAreaView>;
}
export const palette = { bg: '#080b0c', surface: '#131819', line: '#293133', text: '#f5f7f7', muted: '#a6b2b3', mint: '#02dbc0', ink: '#042d29', icon: '#0e302c' };
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.bg }, content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 48, maxWidth: 600, width: '100%', alignSelf: 'center' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 5, paddingRight: 12 }, backText: { color: palette.muted, fontSize: 14 },
  contactButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface, justifyContent: 'center', alignItems: 'center' },
  title: { marginTop: 19, marginBottom: 9, maxWidth: 330, fontSize: 29, lineHeight: 35, letterSpacing: -0.9, fontWeight: '700', color: palette.text }, subtitle: { fontSize: 14, lineHeight: 22, color: palette.muted, marginBottom: 23 },
  largeTabs: { flexDirection: 'column', gap: 0 }, largeTab: { width: '100%' }, tabs: { flexDirection: 'row', gap: 19, borderBottomWidth: 1, borderColor: palette.line, marginBottom: 23 }, tab: { minHeight: 48, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, flexShrink: 1, flexWrap: 'wrap', borderBottomWidth: 3, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: palette.mint }, tabText: { color: palette.muted, fontSize: 14, fontWeight: '600', flexShrink: 1 }, activeText: { color: palette.text }, badge: { fontSize: 11, fontWeight: '700', borderRadius: 7, paddingHorizontal: 5, paddingVertical: 2, color: palette.ink, backgroundColor: palette.mint },
  sectionLabel: { fontSize: 11, lineHeight: 17, letterSpacing: 1.8, fontWeight: '600', color: palette.muted, marginBottom: 12 }, actions: { borderWidth: 1, borderColor: palette.line, borderRadius: 20, paddingHorizontal: 14, backgroundColor: palette.surface }, action: { minHeight: 94, paddingVertical: 21, flexDirection: 'row', alignItems: 'center', gap: 13 }, divider: { borderTopWidth: 1, borderTopColor: palette.line },
  actionIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: palette.icon, justifyContent: 'center', alignItems: 'center' }, copy: { flex: 1, minWidth: 0 }, rowTitle: { color: palette.text, fontSize: 16, lineHeight: 22, fontWeight: '600', marginBottom: 5 }, detail: { color: palette.muted, fontSize: 12, lineHeight: 19 },
  section: { marginTop: 27 }, largeSectionHead: { flexDirection: 'column', alignItems: 'flex-start', gap: 0 }, sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }, heading: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: palette.text, flexShrink: 1, minWidth: 0, maxWidth: '100%' }, all: { minHeight: 44, justifyContent: 'center', paddingLeft: 8 }, link: { color: palette.mint, fontSize: 13 },
  task: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 15, minHeight: 88, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface }, taskIcon: { width: 46, height: 46, borderRadius: 12, backgroundColor: palette.icon, justifyContent: 'center', alignItems: 'center' }, tag: { fontSize: 10, lineHeight: 15, letterSpacing: 1, fontWeight: '600', color: palette.mint }, taskTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: palette.text, marginVertical: 5 },
  stack: { gap: 12 }, file: { marginTop: 22, paddingVertical: 15, minHeight: 52, borderTopWidth: 1, borderColor: palette.line, flexDirection: 'row', alignItems: 'center', gap: 10 }, feedback: { marginBottom: 16, gap: 8 }, error: { color: '#ffb4a9', fontSize: 14, lineHeight: 22 }, retry: { minHeight: 44, justifyContent: 'center' }, empty: { borderWidth: 1, borderColor: palette.line, borderRadius: 20, padding: 24, gap: 14, alignItems: 'center' }, person: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: palette.line }, disabled: { opacity: 0.45 }, refresh: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
