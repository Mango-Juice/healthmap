begin;

do $$
declare
  target_batch constant uuid := '36000000-0000-4000-8000-000000000001';
  target_version constant text := 'task7-approval-replay-v1';
  reviewed_at constant timestamptz := '2026-08-22T00:00:00Z';
  places_text text;
  menus_text text;
  transport_hash text;
  approvals jsonb;
  rechecks jsonb;
  tampered_approvals jsonb;
  tampered_rechecks jsonb;
  baseline jsonb;
  promoted_snapshot jsonb;
  stored_approvals jsonb;
  stored_rechecks jsonb;
  result jsonb;
  probe jsonb;
  role_name text;
  call_reviewer text;
  call_approved_at timestamptz;
  rejected boolean;
begin
  if (
    select count(*)
    from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'promote_catalog_bundle'
  ) <> 2
    or not exists (
      select 1
      from pg_catalog.pg_proc as procedure
      where procedure.oid = 'public.promote_catalog_bundle(
        text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,
        text,text,timestamptz,boolean
      )'::regprocedure
        and procedure.proargnames = array[
          'schema_version', 'catalog_version', 'batch_id', 'manifest_hash', 'place_count',
          'menu_count', 'places_jsonl', 'menus_jsonl', 'approvals', 'rechecks',
          'source_license', 'reviewer', 'approved_at', 'dry_run'
        ]
    )
    or exists (
      select 1 from information_schema.columns
      where table_schema = 'catalog_admin' and table_name = 'import_batches'
        and column_name in ('review_approval_hash', 'review_approval_json')
    ) then
    raise exception using message = 'public promotion RPC signature or no-new-egress contract changed';
  end if;

  select public.get_public_catalog() into baseline;
  select string_agg(payload || E'\n', '' order by series) into places_text
  from (
    select series, jsonb_build_object(
      'id', '36000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'slug', 'approval-place-' || series,
      'name', 'Approval place ' || series,
      'address', 'Approval address ' || series,
      'latitude', 37.5,
      'longitude', 127.03,
      'naverPlaceUrl', 'https://map.naver.com/p/place/' || series,
      'primaryTag', 'balanced',
      'healthTags', jsonb_build_array('balanced'),
      'published', true,
      'dataMode', 'production'
    )::text as payload
    from generate_series(1, 100) as series
  ) as rows;
  select string_agg(payload || E'\n', '' order by series) into menus_text
  from (
    select series, jsonb_build_object(
      'id', '46000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'placeId', '36000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'name', 'Approval menu ' || series,
      'healthTags', jsonb_build_array('balanced'),
      'evidenceUrl', null,
      'verificationMethod', 'direct_confirmation',
      'verifiedAt', '2026-08-22',
      'validUntil', '2026-11-20',
      'displayOrder', 0,
      'published', true,
      'dataMode', 'production'
    )::text as payload
    from generate_series(1, 100) as series
  ) as rows;
  transport_hash := encode(
    extensions.digest(convert_to(places_text || menus_text, 'UTF8'), 'sha256'), 'hex'
  );

  select jsonb_agg(jsonb_build_object(
    'placeId', '36000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
    'reviewer', 'task7-primary-reviewer',
    'reviewedAt', reviewed_at,
    'decision', 'approved',
    'evidenceReference', 'review://primary/' || series,
    'evidenceHash', repeat('a', 64)
  ) order by series) into approvals
  from generate_series(1, 100) as series;

  select jsonb_agg(jsonb_build_object(
    'placeId', ranked.id,
    'selectionRank', ranked.selection_rank,
    'selectionKey', ranked.selection_key,
    'reviewer', 'task7-independent-reviewer',
    'reviewedAt', reviewed_at,
    'decision', 'approved',
    'evidenceReference', 'review://independent/' || ranked.id,
    'evidenceHash', repeat('e', 64)
  ) order by ranked.selection_rank) into rechecks
  from (
    select id, row_number() over (order by selection_key, id)::integer as selection_rank,
      selection_key
    from (
      select ('36000000-0000-4000-8001-' || lpad(series::text, 12, '0'))::uuid as id,
        encode(extensions.digest(convert_to(
          target_version || ':' ||
          ('36000000-0000-4000-8001-' || lpad(series::text, 12, '0')),
          'UTF8'
        ), 'sha256'), 'hex') as selection_key
      from generate_series(1, 100) as series
    ) as candidates
  ) as ranked where ranked.selection_rank <= 20;

  foreach role_name in array array['anon', 'authenticated']::text[] loop
    rejected := false;
    begin
      execute format('set local role %I', role_name);
      perform public.promote_catalog_bundle(
        '1.0.0', target_version, target_batch, transport_hash, 100, 100,
        places_text, menus_text, approvals, rechecks,
        'reviewed-policy:2026-08-21', 'task7-primary-reviewer', reviewed_at, false
      );
    exception when insufficient_privilege then
      rejected := true;
    end;
    reset role;
    if not rejected then
      raise exception using message = 'non-service role executed promotion RPC';
    end if;
  end loop;

  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('target', 'approval', 'field', 'placeId',
      'value', '36000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'approval', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'approval', 'field', 'reviewedAt',
      'value', '2099-01-01T00:00:00Z'),
    jsonb_build_object('target', 'approval', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'approval', 'field', 'evidenceReference', 'value', ''),
    jsonb_build_object('target', 'approval', 'field', 'evidenceHash', 'value', 'invalid'),
    jsonb_build_object('target', 'recheck', 'field', 'placeId',
      'value', '36000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'recheck', 'field', 'selectionRank', 'value', 99),
    jsonb_build_object('target', 'recheck', 'field', 'selectionKey', 'value', repeat('0', 64)),
    jsonb_build_object('target', 'recheck', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'recheck', 'field', 'reviewedAt',
      'value', '2099-01-01T00:00:00Z'),
    jsonb_build_object('target', 'recheck', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceReference', 'value', ''),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceHash', 'value', 'invalid'),
    jsonb_build_object('target', 'topLevel', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'topLevel', 'field', 'approvedAt',
      'value', '2026-08-23T00:00:00Z')
  )) loop
    tampered_approvals := approvals;
    tampered_rechecks := rechecks;
    call_reviewer := 'task7-primary-reviewer';
    call_approved_at := reviewed_at;
    if probe->>'target' = 'approval' then
      tampered_approvals := jsonb_set(
        approvals, array['0', probe->>'field'], probe->'value', false
      );
    elsif probe->>'target' = 'recheck' then
      tampered_rechecks := jsonb_set(
        rechecks, array['0', probe->>'field'], probe->'value', false
      );
    elsif probe->>'field' = 'reviewer' then
      call_reviewer := probe->>'value';
    else
      call_approved_at := (probe->>'value')::timestamptz;
    end if;

    rejected := false;
    begin
      set local role service_role;
      perform public.promote_catalog_bundle(
        '1.0.0', target_version, target_batch, transport_hash, 100, 100,
        places_text, menus_text, tampered_approvals, tampered_rechecks,
        'reviewed-policy:2026-08-21', call_reviewer, call_approved_at, false
      );
    exception when others then
      rejected := true;
    end;
    reset role;
    if not rejected
      or public.get_public_catalog() is distinct from baseline
      or exists (select 1 from catalog_admin.import_batches where id = target_batch) then
      raise exception using message = 'tampered first write was accepted or mutated state: '
        || (probe->>'target') || '.' || (probe->>'field');
    end if;
  end loop;

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-primary-reviewer', reviewed_at, false
  );
  reset role;
  if result->>'status' <> 'promoted' then
    raise exception using message = 'valid first apply was not promoted';
  end if;

  select public.get_public_catalog() into promoted_snapshot;
  select jsonb_agg(to_jsonb(approval) order by approval.place_id) into stored_approvals
  from catalog_admin.place_approvals as approval where approval.batch_id = target_batch;
  select jsonb_agg(to_jsonb(recheck) order by recheck.selection_rank) into stored_rechecks
  from catalog_admin.place_rechecks as recheck where recheck.batch_id = target_batch;

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-primary-reviewer', reviewed_at, false
  );
  reset role;
  if result->>'status' <> 'promoted' then
    raise exception using message = 'exact approval replay was not idempotent';
  end if;

  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('target', 'approval', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'approval', 'field', 'reviewedAt',
      'value', '2026-08-23T00:00:00Z'),
    jsonb_build_object('target', 'approval', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'approval', 'field', 'evidenceReference',
      'value', 'review://changed'),
    jsonb_build_object('target', 'approval', 'field', 'evidenceHash',
      'value', repeat('b', 64)),
    jsonb_build_object('target', 'approval', 'field', 'placeId',
      'value', '36000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'recheck', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'recheck', 'field', 'reviewedAt',
      'value', '2026-08-23T00:00:00Z'),
    jsonb_build_object('target', 'recheck', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceReference',
      'value', 'review://changed'),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceHash',
      'value', repeat('f', 64)),
    jsonb_build_object('target', 'recheck', 'field', 'placeId',
      'value', '36000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'recheck', 'field', 'selectionRank', 'value', 99),
    jsonb_build_object('target', 'recheck', 'field', 'selectionKey',
      'value', repeat('0', 64))
  )) loop
    tampered_approvals := approvals;
    tampered_rechecks := rechecks;
    if probe->>'target' = 'approval' then
      tampered_approvals := jsonb_set(
        approvals, array['0', probe->>'field'], probe->'value', false
      );
    else
      tampered_rechecks := jsonb_set(
        rechecks, array['0', probe->>'field'], probe->'value', false
      );
    end if;

    rejected := false;
    begin
      set local role service_role;
      perform public.promote_catalog_bundle(
        '1.0.0', target_version, target_batch, transport_hash, 100, 100,
        places_text, menus_text, tampered_approvals, tampered_rechecks,
        'reviewed-policy:2026-08-21', 'task7-primary-reviewer', reviewed_at, false
      );
    exception when others then
      rejected := true;
    end;
    reset role;
    if not rejected
      or public.get_public_catalog() is distinct from promoted_snapshot
      or (select jsonb_agg(to_jsonb(approval) order by approval.place_id)
        from catalog_admin.place_approvals as approval
        where approval.batch_id = target_batch) is distinct from stored_approvals
      or (select jsonb_agg(to_jsonb(recheck) order by recheck.selection_rank)
        from catalog_admin.place_rechecks as recheck
        where recheck.batch_id = target_batch) is distinct from stored_rechecks then
      raise exception using message = 'tampered approval replay was accepted or mutated state: '
        || (probe->>'target') || '.' || (probe->>'field');
    end if;
  end loop;

  if public.get_public_catalog() is distinct from promoted_snapshot
    or baseline is null then
    raise exception using message = 'approval replay matrix did not preserve catalog state';
  end if;
end;
$$;

select json_build_object(
  'first_write_tamper_matrix', '16_rejected_without_mutation',
  'first_apply', 'promoted',
  'exact_replay', 'idempotent',
  'tamper_matrix', '14_rejected_without_mutation',
  'anon_execute', 'denied',
  'authenticated_execute', 'denied'
);

rollback;
