-- Close the exact window; keep all evidence and test records. No deletion.
begin;
update public.training_live_qa_window_20261021 set expires_at=least(expires_at,clock_timestamp()) where singleton;
revoke execute on function public.training_live_qa_20261021(text,text,jsonb) from authenticated;
notify pgrst,'reload schema';
commit;
