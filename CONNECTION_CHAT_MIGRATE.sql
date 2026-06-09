-- ANYVO — Migration messages → connection_messages (einmalig, idempotent)
-- NACH CONNECTION_CHAT_SETUP.sql ausführen. Re-Run unschädlich
-- (legacy_message_id verhindert Duplikate).

-- 1. Für jede Connection mit alten Nachrichten einen Chat sicherstellen.
insert into public.connection_chats (connection_id)
select distinct c.id
from public.messages m
join public.connections c
  on c.connection_type = 'trainer_client'
 and ((c.owner_user_id = m.sender_id and c.connected_user_id = m.recipient_id)
   or (c.owner_user_id = m.recipient_id and c.connected_user_id = m.sender_id))
on conflict (connection_id) do nothing;

-- 2. Nachrichten übertragen (Typ aus vorhandener URL ableiten).
insert into public.connection_messages (chat_id, sender_id, message_type, content, created_at, read_at, legacy_message_id)
select
  ch.id,
  m.sender_id,
  case when m.video_url is not null then 'video'
       when m.audio_url is not null then 'voice'
       else 'text' end,
  coalesce(m.video_url, m.audio_url, m.body),
  m.created_at,
  m.read_at,
  m.id
from public.messages m
join public.connections c
  on c.connection_type = 'trainer_client'
 and ((c.owner_user_id = m.sender_id and c.connected_user_id = m.recipient_id)
   or (c.owner_user_id = m.recipient_id and c.connected_user_id = m.sender_id))
join public.connection_chats ch on ch.connection_id = c.id
on conflict (legacy_message_id) do nothing;
