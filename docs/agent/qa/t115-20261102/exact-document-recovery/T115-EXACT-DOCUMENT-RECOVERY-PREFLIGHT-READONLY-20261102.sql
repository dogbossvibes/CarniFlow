-- T115 recovery gate for one synthetic document; SELECT only.
select now() at time zone 'utc' as checked_at_utc,
       (select count(*) from public.dog_documents
        where id = '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'::uuid) as exact_document_row_count,
       (select coalesce(bool_and(to_jsonb(d) @> jsonb_build_object(
          'id', '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52',
          'owner_id', '68910959-e849-4860-b408-ebc234fec611',
          'dog_id', 'b4991851-e569-51fc-a0af-4e0172f2bc63',
          'kind', 'gesundheit',
          'title', 'T115 synthetic QA only',
          'category', 'health',
          'subtype', 'other',
          'file_url', '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png'
        )), false) from public.dog_documents d
        where d.id = '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'::uuid) as exact_document_identity_ok,
       (select count(*) from storage.objects
        where bucket_id = 'dog-documents'
          and name = '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png') as exact_storage_object_count;
