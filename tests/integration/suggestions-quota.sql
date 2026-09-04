begin;
set local role service_role;
do $$
declare result text; i integer; payload jsonb;
begin
  if exists (select 1 from suggestion_admin.pending) then
    raise exception 'Quota contract requires an empty disposable database';
  end if;
  for i in 1..6 loop
    payload := jsonb_build_object('requestId', ('80000000-0000-4000-8000-' || lpad(i::text, 12, '0')),
      'kind', 'menu_correction', 'placeUrl', 'https://example.com/local-quota-test',
      'text', 'LOCAL TEST ONLY actor quota fixture ' || i,
      'evidenceUrl', 'https://example.com/local-evidence');
    result := public.submit_pending_suggestion(payload, repeat('a', 64), lpad(i::text, 64, '0'));
    if result <> (case when i <= 5 then 'queued' else 'limited' end) then
      raise exception 'Actor limit mismatch at %: %', i, result;
    end if;
  end loop;
  if (select count(*) from suggestion_admin.pending) <> 5 then
    raise exception 'Actor denied row persisted';
  end if;
  for i in 6..1001 loop
    payload := jsonb_build_object('requestId', ('90000000-0000-4000-8000-' || lpad(i::text, 12, '0')),
      'kind', 'place_add', 'placeUrl', 'https://example.com/local-global-quota-test',
      'text', 'LOCAL TEST ONLY global quota fixture ' || i,
      'evidenceUrl', 'https://example.com/local-evidence');
    result := public.submit_pending_suggestion(payload, lpad(i::text, 64, '0'), lpad(i::text, 64, '0'));
    if result <> (case when i <= 1000 then 'queued' else 'limited' end) then
      raise exception 'Global limit mismatch at %: %', i, result;
    end if;
  end loop;
  if (select count(*) from suggestion_admin.pending) <> 1000 then
    raise exception 'Global denied row persisted';
  end if;
  if (select count(*) from suggestion_admin.worklist) <> 0 then
    raise exception 'Quota fixture leaked to reviewed worklist';
  end if;
end $$;
reset role;
rollback;
select 'SUGGESTION_ACTOR_5_GLOBAL_1000_QUOTA_PASS' as result;
