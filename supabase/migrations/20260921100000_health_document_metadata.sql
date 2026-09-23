-- ANYVO Health Foundation: backward-compatible document metadata.
-- Legacy `kind` remains readable and writable. New code should use category/subtype.

alter table public.dog_documents
  add column if not exists category text,
  add column if not exists subtype text;

-- Preserve every legacy kind and also make the currently shipped UI values valid.
update public.dog_documents
set category = case kind
  when 'impfpass'     then 'health'
  when 'hd_ed'        then 'health'
  when 'stammbaum'    then 'breeding'
  when 'pruefung'     then 'sport'
  when 'gesundheit'   then 'health'
  when 'tierarzt'     then 'health'
  when 'zucht'        then 'breeding'
  when 'sport'        then 'sport'
  when 'versicherung' then 'insurance'
  else 'other'
end
where category is null;

update public.dog_documents
set subtype = case kind
  when 'impfpass'   then 'vaccination'
  when 'hd_ed'      then 'imaging'
  when 'stammbaum'  then 'pedigree'
  when 'pruefung'   then 'exam'
  when 'tierarzt'   then 'vet_report'
  when 'gesundheit' then 'other'
  else 'other'
end
where subtype is null;

-- The old inline CHECK was too narrow for values already emitted by the UI.
alter table public.dog_documents
  drop constraint if exists dog_documents_kind_check;

alter table public.dog_documents
  add constraint dog_documents_kind_legacy_compat_check
  check (kind in (
    'impfpass', 'stammbaum', 'hd_ed', 'pruefung', 'sonstiges',
    'gesundheit', 'zucht', 'sport', 'versicherung', 'tierarzt'
  ));

alter table public.dog_documents
  drop constraint if exists dog_documents_category_check,
  drop constraint if exists dog_documents_subtype_check;

alter table public.dog_documents
  add constraint dog_documents_category_check
  check (category in ('health', 'breeding', 'sport', 'insurance', 'other')),
  add constraint dog_documents_subtype_check
  check (
    category is null
    or subtype is null
    or (category = 'health' and subtype in ('vaccination', 'vet_report', 'lab', 'medication', 'imaging', 'other'))
    or (category = 'breeding' and subtype in ('pedigree', 'other'))
    or (category = 'sport' and subtype in ('exam', 'other'))
    or (category = 'insurance' and subtype = 'other')
    or (category = 'other' and subtype = 'other')
  );

create index if not exists dog_documents_dog_category_subtype_idx
  on public.dog_documents (dog_id, category, subtype);
