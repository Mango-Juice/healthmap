begin;

do $$
declare
  target_batch constant uuid := '35000000-0000-4000-8000-000000000001';
  target_version constant text := 'task7-contract-v1';
  places_text text;
  menus_text text;
  transport_hash text;
  approvals jsonb;
  rechecks jsonb;
  result jsonb;
  baseline jsonb;
  promoted_snapshot jsonb;
  denied boolean := false;
  rejected boolean;
  probe jsonb;
  probe_hash text;
begin
  select public.get_public_catalog() into baseline;
  select string_agg(row_payload || E'\n', '' order by series) into places_text
  from (
    select series, jsonb_build_object(
      'id', '35000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'slug', 'task7-place-' || series,
      'name', 'Task 7 place ' || series,
      'address', 'Task 7 address ' || series,
      'latitude', 37.5,
      'longitude', 127.03,
      'naverPlaceUrl', 'https://map.naver.com/p/place/' || series,
      'primaryTag', 'balanced',
      'healthTags', jsonb_build_array('balanced'),
      'published', true,
      'dataMode', 'production'
    )::text as row_payload
    from generate_series(1, 100) as series
  ) as rows;
  select string_agg(row_payload || E'\n', '' order by series) into menus_text
  from (
    select series, jsonb_build_object(
      'id', '45000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'placeId', '35000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'name', 'Task 7 menu ' || series,
      'healthTags', jsonb_build_array('balanced'),
      'evidenceUrl', null,
      'verificationMethod', 'direct_confirmation',
      'verifiedAt', (current_date - 1)::text,
      'validUntil', (current_date + 89)::text,
      'displayOrder', 0,
      'published', true,
      'dataMode', 'production'
    )::text as row_payload
    from generate_series(1, 100) as series
  ) as rows;
  transport_hash := encode(
    extensions.digest(convert_to(places_text || menus_text, 'UTF8'), 'sha256'), 'hex'
  );
  select jsonb_agg(jsonb_build_object(
    'placeId', '35000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
    'reviewer', 'task7-reviewer',
    'reviewedAt', now(),
    'decision', 'approved',
    'evidenceReference', 'bundle-review:' || series,
    'evidenceHash', repeat('c', 64)
  ) order by series) into approvals
  from generate_series(1, 100) as series;
  select jsonb_agg(jsonb_build_object(
    'placeId', ranked.id,
    'selectionRank', ranked.selection_rank,
    'selectionKey', ranked.selection_key,
    'reviewer', 'task7-independent-reviewer',
    'reviewedAt', now(),
    'decision', 'approved',
    'evidenceReference', 'bundle-recheck:' || ranked.id,
    'evidenceHash', repeat('d', 64)
  ) order by ranked.selection_rank) into rechecks
  from (
    select id, row_number() over (order by selection_key, id)::integer as selection_rank,
      selection_key
    from (
      select ('35000000-0000-4000-8001-' || lpad(series::text, 12, '0'))::uuid as id,
        encode(extensions.digest(convert_to(
          target_version || ':' ||
          ('35000000-0000-4000-8001-' || lpad(series::text, 12, '0')),
          'UTF8'
        ), 'sha256'), 'hex') as selection_key
      from generate_series(1, 100) as series
    ) as candidates
  ) as ranked where ranked.selection_rank <= 20;

  set local role anon;
  begin
    perform public.promote_catalog_bundle(
      '1.0.0', target_version, target_batch, transport_hash, 100, 100,
      places_text, menus_text, approvals, rechecks,
      'reviewed-policy:2026-08-21', 'task7-reviewer', now(), true
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  reset role;
  if not denied then
    raise exception using message = 'anon promotion RPC execution was not denied';
  end if;

  for probe in select value from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name', 'hash', 'places', places_text, 'menus', menus_text,
      'placeCount', 100, 'menuCount', 100, 'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'count', 'places', places_text, 'menus', menus_text,
      'placeCount', 99, 'menuCount', 100, 'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'unknown_key', 'places', regexp_replace(
      places_text, '"address":', '"unknown":"x", "address":'
    ), 'menus', menus_text, 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'wrong_mode', 'places', replace(
      places_text, '"dataMode": "production"', '"dataMode": "mock"'
    ), 'menus', menus_text, 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'unpublished', 'places', replace(
      places_text, '"published": true', '"published": false'
    ), 'menus', menus_text, 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'duplicate', 'places', replace(
      places_text, '35000000-0000-4000-8001-000000000002',
      '35000000-0000-4000-8001-000000000001'
    ), 'menus', menus_text, 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'orphan', 'places', places_text, 'menus', replace(
      menus_text, '35000000-0000-4000-8001-000000000001',
      '35000000-0000-4000-8999-000000000001'
    ), 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'expired', 'places', places_text, 'menus', replace(
      menus_text, '"validUntil": "' || (current_date + 89)::text || '"',
      '"validUntil": "' || (current_date - 1)::text || '"'
    ), 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'partial', 'places', places_text, 'menus', regexp_replace(
      menus_text, '[^\n]+\n$', ''
    ), 'placeCount', 100, 'menuCount', 100,
      'approvals', approvals, 'rechecks', rechecks),
    jsonb_build_object('name', 'approval', 'places', places_text, 'menus', menus_text,
      'placeCount', 100, 'menuCount', 100, 'approvals', approvals - 0,
      'rechecks', rechecks),
    jsonb_build_object('name', 'recheck', 'places', places_text, 'menus', menus_text,
      'placeCount', 100, 'menuCount', 100, 'approvals', approvals,
      'rechecks', rechecks - 0)
  )) loop
    probe_hash := case when probe->>'name' = 'hash' then repeat('f', 64) else encode(
      extensions.digest(convert_to((probe->>'places') || (probe->>'menus'), 'UTF8'), 'sha256'),
      'hex'
    ) end;
    rejected := false;
    begin
      set local role service_role;
      perform public.promote_catalog_bundle(
        '1.0.0', target_version, target_batch, probe_hash,
        (probe->>'placeCount')::integer, (probe->>'menuCount')::integer,
        probe->>'places', probe->>'menus', probe->'approvals', probe->'rechecks',
        'reviewed-policy:2026-08-21', 'task7-reviewer', now(), false
      );
      reset role;
    exception when others then
      reset role;
      rejected := true;
    end;
    if not rejected or public.get_public_catalog() is distinct from baseline
      or exists (select 1 from catalog_admin.import_batches where id = target_batch) then
      raise exception using message = 'failure probe was accepted or mutated public state: '
        || probe->>'name';
    end if;
  end loop;

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-reviewer', now(), true
  );
  reset role;
  if result->>'status' <> 'validated' or (result->>'dryRun')::boolean is not true
    or public.get_public_catalog() is distinct from baseline
    or exists (select 1 from catalog_admin.import_batches where id = target_batch) then
    raise exception using message = 'dry-run mutated state or returned the wrong contract';
  end if;

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-reviewer', now(), false
  );
  reset role;
  if result->>'status' <> 'promoted' or (result->>'dryRun')::boolean is not false
    or (select catalog_version from public.catalog_state where singleton) <> target_version
    or (select count(*) from catalog_admin.catalog_place_memberships
      where catalog_version = target_version) <> 100
    or (select count(*) from catalog_admin.catalog_menu_memberships
      where catalog_version = target_version) <> 100 then
    raise exception using message = 'apply did not atomically publish exact membership';
  end if;
  promoted_snapshot := public.get_public_catalog();

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-reviewer', now(), true
  );
  reset role;
  if result->>'status' <> 'validated' or (result->>'dryRun')::boolean is not true
    or result->'counts' <> jsonb_build_object('places', 100, 'menus', 100)
    or result->>'hash' <> transport_hash or result->>'version' <> target_version
    or public.get_public_catalog() is distinct from promoted_snapshot then
    raise exception using message = 'post-promotion dry-run changed state or returned the wrong contract';
  end if;

  set local role service_role;
  result := public.promote_catalog_bundle(
    '1.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-reviewer', now(), false
  );
  if result->>'status' <> 'promoted' then
    raise exception using message = 'repeated apply was not idempotent';
  end if;
  reset role;
end
$$;

select json_build_object(
  'service_role_dry_run', 'non_mutating',
  'service_role_apply', 'atomic_100_100',
  'anon_execute', 'denied',
  'failure_probes', '11_preserved_snapshot',
  'post_promotion_dry_run', 'validated_non_mutating',
  'repeated_apply', 'idempotent'
);

rollback;
