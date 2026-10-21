-- Only on explicit rollback/stop instruction. Existing data is retained.
begin;
revoke execute on function public.training_group_live_v1(text,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
