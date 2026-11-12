import { StyleSheet } from 'react-native';
import { C } from '@/constants/colors';

export const contactStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.trackBg },
  flex: { flex: 1 },
  scroll: { padding: 16, gap: 14, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },
  section: { color: C.trackTextMut, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
  body: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 },
  hint: { color: C.trackTextMut, fontSize: 13, lineHeight: 19 },
  error: { color: C.trackTextSec, fontSize: 15, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8 },
  rowText: { flex: 1 },
  rowTitle: { color: C.trackText, fontSize: 15, fontWeight: '700' },
  rowSub: { color: C.trackTextSec, fontSize: 12, marginTop: 2, lineHeight: 17 },
  divider: { height: 1, backgroundColor: C.trackBorder },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.trackCardAlt, borderWidth: 1, borderColor: C.trackBorder, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.trackPrimary, fontWeight: '900', fontSize: 15 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  input: { minHeight: 48, backgroundColor: C.trackCardAlt, borderRadius: 14, borderWidth: 1, borderColor: C.trackBorder, color: C.trackText, fontSize: 16, fontWeight: '600', paddingHorizontal: 14 },
  textButton: { minHeight: 48, justifyContent: 'center' },
  textButtonLabel: { color: C.trackPrimary, fontSize: 14, fontWeight: '700' },
  dangerLabel: { color: C.trackDanger, fontSize: 14, fontWeight: '700' },
});

export function initial(name: string | null | undefined, username?: string | null): string {
  return (name?.trim()?.[0] ?? username?.trim()?.[0] ?? '?').toUpperCase();
}
