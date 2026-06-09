import { supabase } from '@/lib/supabase';
import { listConnections } from '@/services/connectionService';
import type { ChatConversation, ChatMessage, ChatMessageType } from '@/types/chat';

function previewOf(type: ChatMessageType, content: string | null): string {
  switch (type) {
    case 'voice': return '🎙️ Sprachnachricht';
    case 'image': return '🖼️ Bild';
    case 'video': return '🎥 Video';
    default:      return content ?? '';
  }
}

// Chat zu einer Connection holen oder anlegen (unique connection_id).
export async function getOrCreateChat(connectionId: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from('connection_chats').select('id').eq('connection_id', connectionId).maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from('connection_chats').insert({ connection_id: connectionId }).select('id').single();
  if (error) {
    // Race: parallel angelegt → erneut lesen.
    const { data: again } = await supabase
      .from('connection_chats').select('id').eq('connection_id', connectionId).maybeSingle();
    return (again?.id as string) ?? null;
  }
  return data?.id as string;
}

export async function getMessages(chatId: string): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('connection_messages').select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: true });
  return (data as ChatMessage[]) ?? [];
}

export async function sendMessage(args: {
  chatId: string; senderId: string; recipientId: string; senderName: string;
  type: ChatMessageType; content: string;
}): Promise<{ data: ChatMessage | null; error: string | null }> {
  const { data, error } = await supabase
    .from('connection_messages')
    .insert({ chat_id: args.chatId, sender_id: args.senderId, message_type: args.type, content: args.content })
    .select('*')
    .single();
  if (error || !data) return { data: null, error: error?.message ?? 'Senden fehlgeschlagen.' };

  // Empfänger per Push benachrichtigen (best-effort).
  supabase.functions.invoke('notify', {
    body: {
      user_ids: [args.recipientId],
      title:    `💬 ${args.senderName}`,
      body:     previewOf(args.type, args.content),
      data:     { type: 'message', chat_id: args.chatId },
    },
  }).catch(() => {});

  return { data: data as ChatMessage, error: null };
}

export async function markRead(chatId: string, meId: string): Promise<void> {
  await supabase
    .from('connection_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('chat_id', chatId)
    .neq('sender_id', meId)
    .is('read_at', null);
}

// Realtime: neue Nachrichten im Chat (eingehend, nicht von mir).
export function subscribeChat(chatId: string, meId: string, onInsert: (m: ChatMessage) => void) {
  const channel = supabase
    .channel(`chat:${chatId}`)
    .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'connection_messages', filter: `chat_id=eq.${chatId}` },
      payload => {
        const m = payload.new as ChatMessage;
        if (m.sender_id !== meId) onInsert(m);
      })
    .subscribe();
  return () => { supabase.removeChannel(channel); };
}

// ── Übersicht: akzeptierte Connections + letzte Nachricht ─────
export async function getConversations(meId: string): Promise<ChatConversation[]> {
  const conns = (await listConnections(meId)).filter(c => c.status === 'accepted');
  if (!conns.length) return [];

  const { data: chats } = await supabase
    .from('connection_chats').select('id, connection_id')
    .in('connection_id', conns.map(c => c.id));
  const chatByConn = new Map((chats ?? []).map(r => [r.connection_id as string, r.id as string]));
  const chatIds = (chats ?? []).map(r => r.id as string);

  const msgByChat = new Map<string, ChatMessage[]>();
  if (chatIds.length) {
    const { data: msgs } = await supabase
      .from('connection_messages').select('*')
      .in('chat_id', chatIds)
      .order('created_at', { ascending: false });
    for (const m of (msgs as ChatMessage[]) ?? []) {
      const arr = msgByChat.get(m.chat_id) ?? [];
      arr.push(m);
      msgByChat.set(m.chat_id, arr);
    }
  }

  return conns.map(c => {
    const chatId = chatByConn.get(c.id) ?? null;
    const msgs   = chatId ? (msgByChat.get(chatId) ?? []) : [];
    const last   = msgs[0] ?? null;
    const unread = msgs.filter(m => m.sender_id !== meId && !m.read_at).length;
    return {
      connectionId:  c.id,
      chatId,
      counterpartId: c.counterpartId,
      name:          c.counterpartName,
      lastPreview:   last ? previewOf(last.message_type, last.content) : null,
      lastAt:        last?.created_at ?? null,
      unread,
    };
  }).sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
}
