begin;
set local role service_role;
select public.submit_pending_suggestion('{"requestId":"22222222-2222-4222-8222-222222222222","kind":"menu_correction","placeUrl":"https://example.com/local-test","text":"LOCAL TEST ONLY menu correction","evidenceUrl":"https://example.com/local-evidence"}', repeat('a',64), repeat('b',64));
do $$ begin
  if public.submit_pending_suggestion('{"requestId":"22222222-2222-4222-8222-222222222222"}',repeat('a',64),repeat('b',64)) <> 'duplicate' then raise exception 'Replay failed'; end if;
  if (select status from suggestion_admin.pending where id='22222222-2222-4222-8222-222222222222') <> 'pending' then raise exception 'Not pending'; end if;
  if public.review_pending_suggestion('22222222-2222-4222-8222-222222222222',true,'LOCAL TEST verified evidence only') <> 'reviewed' then raise exception 'Review failed'; end if;
  if not exists(select 1 from suggestion_admin.worklist where suggestion_id='22222222-2222-4222-8222-222222222222') then raise exception 'Missing worklist'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from suggestion_admin.pending; raise exception 'Anon read permitted'; exception when insufficient_privilege then null; end;
  begin perform public.submit_pending_suggestion('{}', repeat('a',64),repeat('b',64)); raise exception 'Anon RPC permitted'; exception when insufficient_privilege then null; end;
  begin perform public.review_pending_suggestion('22222222-2222-4222-8222-222222222222',true,'Unauthorized test review'); raise exception 'Anon review permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from suggestion_admin.worklist; raise exception 'Authenticated worklist read permitted'; exception when insufficient_privilege then null; end;
  begin perform public.submit_pending_suggestion('{}', repeat('a',64),repeat('b',64)); raise exception 'Authenticated RPC permitted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
select 'SUGGESTION_RLS_REVIEW_PASS' as result;
