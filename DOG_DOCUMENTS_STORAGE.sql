-- DOG_DOCUMENTS_STORAGE.sql  ·  VORSCHLAG zur Freigabe — NICHT automatisch ausgeführt.
-- Privater Storage-Bucket + RLS-Policies für Hunde-Dokumente (gehört zu
-- public.dog_documents.file_url). In Supabase → SQL-Editor ausführen (nach Review).
--
-- PFAD-KONVENTION (wichtig für die Policies):  <owner_id>/<dog_id>/<dateiname>
--   → die ERSTE Ordnerebene ist immer die User-ID des Besitzers. Die App muss
--     beim Upload exakt diesen Pfad verwenden.
--
-- Zugriff: Besitzer voll (lesen/hochladen/ersetzen/löschen); verbundene Trainer
--   (public.connections, status='accepted') NUR lesen — analog zu DOG_HUB_SETUP.sql.

-- ── Bucket (privat) ──────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dog-documents', 'dog-documents', false,
  10485760,                                                    -- 10 MB (anpassbar)
  array['application/pdf','image/jpeg','image/png','image/heic','image/webp']
)
on conflict (id) do nothing;

-- ── Policies auf storage.objects (RLS ist von Supabase bereits aktiv) ─────────

-- Lesen/Download: Besitzer ODER verbundene Trainer:in.
drop policy if exists dog_docs_read on storage.objects;
create policy dog_docs_read on storage.objects for select to authenticated
using (
  bucket_id = 'dog-documents'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1 from public.connections c
      where c.owner_user_id = ((storage.foldername(name))[1])::uuid
        and c.connected_user_id = auth.uid()
        and c.status = 'accepted'
    )
  )
);

-- Hochladen: nur der Besitzer (erste Ordnerebene = eigene User-ID).
drop policy if exists dog_docs_insert on storage.objects;
create policy dog_docs_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Ersetzen/Verschieben: nur der Besitzer.
drop policy if exists dog_docs_update on storage.objects;
create policy dog_docs_update on storage.objects for update to authenticated
using (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Löschen: nur der Besitzer.
drop policy if exists dog_docs_delete on storage.objects;
create policy dog_docs_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'dog-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);
