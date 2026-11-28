import { StyleSheet } from 'react-native';
import { C } from '@/constants/colors';

export const ks = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.bg },
  header:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 14 },
  back:     { width: 38, height: 38, borderRadius: 12, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  title:    { fontSize: 24, color: C.white, fontWeight: '900', letterSpacing: -0.5 },
  subtitle: { fontSize: 12.5, color: C.muted, marginTop: 2 },
  content:  { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 50 },
  section:  { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 22, marginBottom: 12, marginLeft: 2 },
  card:     { borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 15 },
  row:      { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon:     { width: 40, height: 40, borderRadius: 12, backgroundColor: C.accentDim, alignItems: 'center', justifyContent: 'center' },
  h:        { fontSize: 15, color: C.white, fontWeight: '700' },
  p:        { fontSize: 13, color: C.textMuted, lineHeight: 19 },
  small:    { fontSize: 12, color: C.muted, marginTop: 2 },
  btn:      { marginTop: 12, borderRadius: 12, backgroundColor: C.accent, paddingVertical: 11, alignItems: 'center' },
  btnTxt:   { fontSize: 14, fontWeight: '800', color: C.accentText },
  ghost:    { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: C.borderLight, paddingVertical: 11, alignItems: 'center' },
  ghostTxt: { fontSize: 14, fontWeight: '700', color: C.white },
  bar:      { height: 6, borderRadius: 3, backgroundColor: C.cardAlt, overflow: 'hidden', marginTop: 8 },
  barFill:  { height: 6, borderRadius: 3, backgroundColor: C.accent },
  notice:   { fontSize: 11.5, color: C.muted, lineHeight: 17, marginTop: 14 },
  link:     { color: C.accent, fontWeight: '700' },
});
