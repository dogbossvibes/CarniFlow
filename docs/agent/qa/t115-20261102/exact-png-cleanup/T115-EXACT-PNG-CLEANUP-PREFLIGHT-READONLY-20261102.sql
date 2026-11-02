-- T115 2026-11-02 exact synthetic PNG cleanup preflight; SELECT only.
select now() at time zone 'utc' as checked_at_utc,
       (select count(*) from public.dog_documents
        where id = '4cf382c6-b315-4dfb-b175-eb6b3ebcfa52'::uuid) as exact_document_row_count,
       (select count(*) from storage.objects
        where bucket_id = 'dog-documents'
          and name = '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png') as exact_storage_object_count,
       (select metadata->>'size' from storage.objects
        where bucket_id = 'dog-documents'
          and name = '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png') as exact_size_bytes,
       (select metadata->>'mimetype' from storage.objects
        where bucket_id = 'dog-documents'
          and name = '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png') as exact_mimetype;
