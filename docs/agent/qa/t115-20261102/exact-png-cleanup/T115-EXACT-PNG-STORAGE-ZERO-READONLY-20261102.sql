-- T115 2026-11-02 independent exact-path post-delete check; SELECT only.
select now() at time zone 'utc' as checked_at_utc,
       count(*) as exact_storage_object_count
from storage.objects
where bucket_id = 'dog-documents'
  and name = '68910959-e849-4860-b408-ebc234fec611/b4991851-e569-51fc-a0af-4e0172f2bc63/t115-health-4cf382c6-b315-4dfb-b175-eb6b3ebcfa52.png';
