import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import { refLabel } from '@/features/knowledge/ask';
import { SOURCES } from '@/features/knowledge/content/library';
import type { KnowledgeRef } from '@/features/knowledge/types';
import { ks } from './styles';

/** Fundstellen einer Karte plus Link zum offiziellen Wortlaut. */
export function SourceRefs({ refs, showLink = true, onLinkError }: { refs: readonly KnowledgeRef[]; showLink?: boolean; onLinkError?: () => void }) {
  const { t } = useT();
  const urls = [...new Set(refs.map(r => SOURCES[r.source]?.url).filter((u): u is string => !!u))];
  return (
    <View style={{ marginTop: 10, gap: 4 }} testID="knowledge-refs">
      <Text style={[ks.small, { fontWeight: '700' }]}>{t('knowledge.source.label')}</Text>
      {refs.map(r => (
        <Text key={`${r.source}:${r.section}`} style={[ks.small, { color: C.textMuted }]}>{refLabel(r)}</Text>
      ))}
      {showLink ? urls.map(u => (
        <TouchableOpacity
          key={u}
          onPress={() => { Linking.openURL(u).catch(() => onLinkError?.()); }}
          style={[ks.row, { gap: 6, marginTop: 4 }]}
          accessibilityRole="link"
          testID="knowledge-official-link"
        >
          <Ionicons name="open-outline" size={14} color={C.accent} />
          <Text style={[ks.small, ks.link, { marginTop: 0 }]}>{t('knowledge.source.official')}</Text>
        </TouchableOpacity>
      )) : null}
    </View>
  );
}
