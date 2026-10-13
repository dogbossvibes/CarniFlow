import { isReviewIntent } from '../services/objectReview/localIntent';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { C } from '@/constants/colors';
import { useT } from '@/i18n';
import type { TrackObjectReviewController } from '../hooks/useTrackObjectReview';
import { reviewCounts, reviewObjectLabel, type CorrectionStatus } from '../services/objectReview/model';
import { recordedObjectOutcome, type ReviewedObjectStatus } from '../utils/trackObjectReview';
import type { ReferenceObjectStatus } from '../utils/referenceObjectStatus';

const OPTIONS: CorrectionStatus[] = ['found', 'not_found', 'unobserved'];
export function TrackObjectCorrections({ controller: c }: { controller: TrackObjectReviewController }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, CorrectionStatus>>({});
  const [editingRevision, setEditingRevision] = useState(0);
  const [history, setHistory] = useState(false);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [targetRevision, setTargetRevision] = useState<number | null>(null);
  const intent = c.pending && isReviewIntent(c.pending.request) ? c.pending.request : null;
  const review = c.review;
  const currentContext = c.contextKey || review?.runId;
  const context = useRef(currentContext); context.current = currentContext;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setEditing(false); setDraft({}); setHistory(false); }, [currentContext]);
  useEffect(() => { if (c.pending) { setEditing(false); setDraft({}); } }, [c.pending]);
  useEffect(() => { setTargets({}); setTargetRevision(null); }, [currentContext, intent?.operationId]);
  if (!c.available) return null;
  const statusText = (status: ReviewedObjectStatus) => t(`track.review.${status}`);
  const button = (label: string, onPress: () => void, disabled = c.busy) => <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.action}>{label}</Text></Pressable>;
  const counts = review ? reviewCounts(review) : null;
  const error = c.error instanceof Error ? c.error.message : String(c.error ?? '');
  const missing = /REVIEW_UNAVAILABLE|REVIEW_NOT_INITIALIZED/.test(error);
  const unavailable = /PGRST202|42883|does not exist|Could not find the function/.test(error);
  const changes = review?.objects.flatMap(o => draft[o.objectId] && draft[o.objectId] !== o.effectiveStatus ? [{ objectId: o.objectId, status: draft[o.objectId] }] : []) ?? [];
  return <View style={s.card}>
    <Text accessibilityRole="header" style={s.title}>{t('track.review.title')}</Text>
    <Text style={s.hint}>{t('track.review.hint')}</Text>
    {c.busy && <ActivityIndicator color={C.trackPrimary} accessibilityLabel={t('track.review.title')} />}
    {!!error && !missing && <Text accessibilityLiveRegion="polite" style={s.notice}>{t(unavailable ? 'track.review.unavailable' : /REVIEW_REFERENCE_INCOMPLETE/.test(error) ? 'track.review.incomplete' : /REVIEW_OFFLINE/.test(error) ? 'track.review.offline' : 'track.review.error')}</Text>}
    {((!review && !c.pending) || !!intent) && !!c.localAutoObjects.length && <View style={s.pending}>
      <Text style={s.hint}>{t('track.review.coldHint')}</Text>
      {c.localAutoObjects.map(object => {
        const label = t('track.review.autoNumber', { number: object.index + 1 });
        const pending = !!intent?.changes.some(change => change.objectId === object.objectId);
        return <View key={object.objectId} style={s.object}>
          <Text style={s.text}>{label}{pending ? ` · ${t('track.review.dismissQueued')}` : ''}</Text>
          {!pending && button(t('track.review.dismissAuto', { number: object.index + 1 }), () => void c.queueAutoIntent(object.objectId))}
        </View>;
      })}
    </View>}
    {!!intent && <View style={s.pending}>
      <Text accessibilityLiveRegion="polite" style={s.notice}>{t('track.review.intentPending')}</Text>
      {review && <>
        <Text style={s.hint}>{t('track.review.mapHint')}</Text>
        {intent.changes.map(change => <View key={change.objectId} style={s.object}>
          <Text style={s.title}>{t('track.review.autoNumber', { number: intent.localAutoObjects.findIndex(o => o.objectId === change.objectId) + 1 })} → {statusText(change.status)}</Text>
          {review.objects.filter(o => o.effectiveStatus !== change.status).map(object => {
            const label = `${t('track.review.autoNumber', { number: intent.localAutoObjects.findIndex(o => o.objectId === change.objectId) + 1 })} → ${reviewObjectLabel(review, object.objectId)}`;
            return <Pressable key={object.objectId} accessibilityRole="radio" accessibilityLabel={label}
              accessibilityState={{ checked: targets[change.objectId] === object.objectId, disabled: c.busy }} disabled={c.busy}
              onPress={() => { setTargets(old => ({ ...old, [change.objectId]: object.objectId })); setTargetRevision(old => old ?? review.revision); }}
              style={[s.choice, targets[change.objectId] === object.objectId && s.selected]}><Text style={s.text}>{label}</Text></Pressable>;
          })}
        </View>)}
        {button(t('track.review.confirmIntent'), () => void c.resolveIntent(targets, targetRevision!),
          c.busy || targetRevision === null || Object.keys(targets).length !== intent.changes.length || new Set(Object.values(targets)).size !== intent.changes.length)}
        {button(t('track.review.cancel'), () => { setTargets({}); setTargetRevision(null); })}
        {button(t('track.review.accept'), () => Alert.alert(t('track.review.accept'), t('track.review.acceptHint'), [
          { text: t('track.review.cancel'), style: 'cancel' }, { text: t('track.review.accept'), onPress: () => void c.acceptCurrent() },
        ]))}
      </>}
    </View>}
    {!review ? <>
      <Text style={s.hint}>{t('track.review.initHint')}</Text>
      {button(t('track.review.initialize'), () => void c.initialize(), c.busy || unavailable)}
    </> : <>
      <Text style={s.title}>{t('track.review.counts', { found: counts!.found, total: counts!.total, unknown: counts!.uncertain })}</Text>
      {review.source === 'legacy_markers' && <Text style={s.hint}>{t('track.review.legacy')}</Text>}
      {review.revision > 0 && <Text style={s.hint}>{review.totalScore === null ? t('track.review.noScore') : t('track.review.score', { score: review.totalScore })}</Text>}
      {review.objects.map(object => {
        const original = ['found','not_found','unknown','unobserved'].includes(object.recordedStatus)
          ? object.recordedStatus as ReviewedObjectStatus : recordedObjectOutcome(object.recordedStatus as ReferenceObjectStatus) ?? 'unknown';
        return <View key={object.objectId} style={s.object}>
          <Text style={s.title}>{reviewObjectLabel(review, object.objectId)} · {statusText(object.effectiveStatus)}</Text>
          <Text style={s.hint}>{t('track.review.original', { status: object.recordedStatus === 'auto_dwell_found' ? t('track.autoDetected') : statusText(original) })}</Text>
          {editing && OPTIONS.map(status => <Pressable key={status} accessibilityRole="radio"
            accessibilityLabel={`${reviewObjectLabel(review, object.objectId)}: ${statusText(status)}`} accessibilityState={{ checked: (draft[object.objectId] ?? object.effectiveStatus) === status, disabled: c.busy }}
            disabled={c.busy} onPress={() => setDraft(d => ({ ...d, [object.objectId]: status }))}
            style={[s.choice, (draft[object.objectId] ?? object.effectiveStatus) === status && s.selected]}>
            <Text style={s.text}>{(draft[object.objectId] ?? object.effectiveStatus) === status ? '● ' : '○ '}{statusText(status)}</Text>
          </Pressable>)}
        </View>;
      })}
      {!!c.pending && !intent && <View style={s.pending}>
        <Text accessibilityLiveRegion="polite" style={s.notice}>{t(c.pending.state === 'conflict' ? 'track.review.conflict' : 'track.review.pending')}</Text>
        {c.pending.request.changes.map(change => <Text key={change.objectId} style={s.text}>{reviewObjectLabel(review, change.objectId)} → {statusText(change.status)}</Text>)}
        {c.pending.state === 'conflict' && button(t('track.review.accept'), () => Alert.alert(t('track.review.accept'), t('track.review.acceptHint'), [
          { text: t('track.review.cancel'), style: 'cancel' }, { text: t('track.review.accept'), onPress: () => void c.acceptCurrent() },
        ]))}
      </View>}
      {editing ? <>
        {button(t('track.review.save'), () => {
          const savedContext = currentContext;
          void c.save(changes, editingRevision).then(queued => {
            if (queued && mounted.current && context.current === savedContext) { setEditing(false); setDraft({}); }
          });
        }, c.busy || !changes.length || !!c.pending)}
        {button(t('track.review.cancel'), () => { setEditing(false); setDraft({}); })}
      </> : !c.pending && !!review.objects.length && button(t('track.review.edit'), () => { setDraft({}); setEditingRevision(review.revision); setEditing(true); })}
      {button(t('track.review.history'), () => setHistory(!history))}
      {history && <View style={s.history}>
        {!review.audit.length && <Text style={s.hint}>{t('track.review.emptyHistory')}</Text>}
        {review.auditTruncated && <Text style={s.notice}>{t('track.review.truncated')}</Text>}
        {review.audit.slice().reverse().map(event => <View key={event.operationId} style={s.object}>
          <Text style={s.hint}>{new Date(event.createdAt).toLocaleString()} · #{event.revision}</Text>
          {event.changes.map(change => <Text key={change.objectId} style={s.text}>{reviewObjectLabel(review, change.objectId)}: {statusText(event.beforeOutcomes[change.objectId])} → {statusText(change.status)}</Text>)}
        </View>)}
      </View>}
    </>}
    {button(t('track.review.refresh'), () => void c.refresh())}
  </View>;
}
const s = StyleSheet.create({
  card: { backgroundColor: C.trackCard, borderColor: C.trackBorder, borderWidth: 1, borderRadius: 20, padding: 16, gap: 12, marginBottom: 16 },
  title: { color: C.trackText, fontSize: 16, fontWeight: '700', lineHeight: 23 },
  text: { color: C.trackText, fontSize: 15, lineHeight: 22 },
  hint: { color: C.trackTextSec, fontSize: 14, lineHeight: 21 },
  notice: { color: C.trackWarning, fontSize: 14, lineHeight: 21 },
  object: { gap: 8, borderTopWidth: 1, borderColor: C.trackBorder, paddingTop: 12 },
  button: { minHeight: 48, padding: 12, justifyContent: 'center', borderRadius: 12, backgroundColor: C.trackCardAlt },
  action: { color: C.trackPrimary, fontSize: 15, lineHeight: 22, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  choice: { minHeight: 48, padding: 12, justifyContent: 'center', borderWidth: 1, borderColor: C.trackBorder, borderRadius: 12 },
  selected: { borderColor: C.trackPrimary },
  pending: { gap: 8 }, history: { gap: 12 },
});
