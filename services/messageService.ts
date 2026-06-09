import { supabase } from '@/lib/supabase';
import { getMyClients, getMyTrainers } from '@/services/coachService';
import type { Conversation, Message } from '@/types/message';

// ── Thread mit einem bestimmten Gegenüber ────────────────────
export async function getThread(meId: string, otherId: string): Promise<Message[]> {
  const { data } = await supabase
    .from('messages').select('*')
    .or(`and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`)
    .order('created_at', { ascending: true });
  return (data as Message[]) ?? [];
}

export async function sendMessage(args: {
  senderId: string; recipientId: string; senderName: string;
  body?: string | null; audioUrl?: string | null; videoUrl?: string | null;
}): Promise<{ data: Message | null; error: string | null }> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      sender_id:    args.senderId,
      recipient_id: args.recipientId,
      body:         args.body ?? null,
      audio_url:    args.audioUrl ?? null,
      video_url:    args.videoUrl ?? null,
    })
    .select()
    .single();
  if (error || !data) return { data: null, error: error?.message ?? 'Senden fehlgeschlagen.' };

  // Empfänger per Push benachrichtigen (best-effort).
  const preview = args.videoUrl ? '🎥 Video-Feedback' : args.audioUrl ? '🎙️ Sprachnachricht' : (args.body ?? '');
  supabase.functions.invoke('notify', {
    body: {
      user_ids: [args.recipientId],
      title:    `💬 ${args.senderName}`,
      body:     preview,
      data:     { type: 'message', from: args.senderId },
    },
  }).catch(() => {});

  return { data: data as Message, error: null };
}

export async function markThreadRead(meId: string, otherId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', meId).eq('sender_id', otherId)
    .is('read_at', null);
}

// ── Übersicht: alle verbundenen Gegenüber + letzte Nachricht ─
export async function getConversations(meId: string): Promise<Conversation[]> {
  const [clients, trainers] = await Promise.all([getMyClients(meId), getMyTrainers(meId)]);

  const counterparts: { userId: string; name: string | null; role: 'trainer' | 'client' }[] = [
    ...clients.filter(c => c.status === 'active').map(c => ({ userId: c.clientId, name: c.name, role: 'client' as const })),
    ...trainers.filter(t => t.status === 'active').map(t => ({ userId: t.trainerId, name: t.name, role: 'trainer' as const })),
  ];
  // Duplikate (jemand ist beides) vermeiden.
  const seen = new Set<string>();
  const unique = counterparts.filter(c => (seen.has(c.userId) ? false : (seen.add(c.userId), true)));
  if (!unique.length) return [];

  const ids = unique.map(c => c.userId);
  const { data: msgs } = await supabase
    .from('messages').select('*')
    .or(`and(sender_id.eq.${meId},recipient_id.in.(${ids.join(',')})),and(recipient_id.eq.${meId},sender_id.in.(${ids.join(',')}))`)
    .order('created_at', { ascending: false });
  const all = (msgs as Message[]) ?? [];

  return unique.map(c => {
    const thread = all.filter(m => m.sender_id === c.userId || m.recipient_id === c.userId);
    const last   = thread[0] ?? null;
    const unread = thread.filter(m => m.recipient_id === meId && m.sender_id === c.userId && !m.read_at).length;
    return {
      userId:   c.userId,
      name:     c.name,
      role:     c.role,
      lastBody: last ? (last.body ?? (last.video_url ? '🎥 Video' : last.audio_url ? '🎙️ Sprachnachricht' : '')) : null,
      lastAt:   last?.created_at ?? null,
      unread,
    };
  }).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}

// ── Realtime: neue Nachrichten im Thread ─────────────────────
export function subscribeThread(meId: string, otherId: string, onInsert: (m: Message) => void) {
  const channel = supabase
    .channel(`messages:${meId}:${otherId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${meId}` },
      payload => {
        const m = payload.new as Message;
        if (m.sender_id === otherId) onInsert(m);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}
