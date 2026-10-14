import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { C } from '@/constants/colors';
import './i18n';
export function DistractionEntry({ parentId, dogId, beforeOpen }: { parentId?: string; dogId?: string | null; beforeOpen?(): void }) {
 const router = useRouter(), { t } = useTranslation('distractions');
 return <Pressable accessibilityRole="button" style={{ minHeight: 48, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: C.border }} onPress={() => { beforeOpen?.(); router.push({ pathname: '/track/verleitungen', params: parentId ? { id: parentId } : dogId ? { dogId } : {} } as never); }}><Text style={{ color: C.accent, fontSize: 16, fontWeight: '700' }}>{t(parentId ? 'entryForTrack' : 'entry')}</Text></Pressable>;
}
