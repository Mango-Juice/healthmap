begin;

create function pg_temp.v2_promote(schema_version text,catalog_version text,batch_id uuid,manifest_hash text,
 place_count integer,menu_count integer,places_jsonl text,menus_jsonl text,approvals jsonb,rechecks jsonb,
 source_license text,reviewer text,approved_at timestamptz,dry_run boolean) returns jsonb
 language plpgsql security invoker set search_path = '' as $$
declare artifact text; primary_records jsonb; independent_records jsonb; binding jsonb;
begin
 binding := jsonb_build_object('place_sha256',repeat('a',64),'menus_sha256',repeat('b',64),
  'source_sha256s',jsonb_build_array(repeat('c',64)),'approved_health_tags',jsonb_build_array());
 select jsonb_agg(jsonb_build_object('place_id',d->'placeId','reviewer',d->'reviewer','reviewed_at',d->'reviewedAt',
  'passed',d->>'decision' = 'approved','evidence_reference',d->'evidenceReference','evidence_sha256',d->'evidenceHash','binding',binding)
  order by n) into primary_records from jsonb_array_elements(approvals) with ordinality r(d,n);
 select jsonb_agg(jsonb_build_object('place_id',d->'placeId','reviewer',d->'reviewer','reviewed_at',d->'reviewedAt',
  'passed',d->>'decision' = 'approved','evidence_reference',d->'evidenceReference','evidence_sha256',d->'evidenceHash','binding',binding)
  order by n) into independent_records from jsonb_array_elements(rechecks) with ordinality r(d,n);
 artifact := jsonb_build_object('batch_id',batch_id,'catalog_version',catalog_version,'reviewer',reviewer,
  'reviewed_at',approved_at,'independent_reviewer','task7-independent-reviewer','places_sha256',repeat('d',64),
  'menus_sha256',repeat('e',64),'public_places_sha256',encode(extensions.digest(convert_to(places_jsonl,'UTF8'),'sha256'),'hex'),
  'public_menus_sha256',encode(extensions.digest(convert_to(menus_jsonl,'UTF8'),'sha256'),'hex'),
  'source_sha256s',jsonb_build_array(repeat('c',64)),'approved_health_tags',jsonb_build_array(),
  'primary_decisions',primary_records,'independent_results',independent_records,
  'independent_sample_ids',(select jsonb_agg(d->'placeId' order by n) from jsonb_array_elements(rechecks) with ordinality r(d,n)))::text;
 if current_setting('healthmap.test_tamper',true) = 'public_hash' then
  artifact := jsonb_set(artifact::jsonb,'{public_places_sha256}',to_jsonb(repeat('f',64)))::text;
 end if;
 return public.promote_catalog_bundle(schema_version,catalog_version,batch_id,manifest_hash,place_count,menu_count,
  places_jsonl,menus_jsonl,artifact,case when current_setting('healthmap.test_tamper',true) = 'artifact_hash' then repeat('f',64) else encode(extensions.digest(convert_to(artifact,'UTF8'),'sha256'),'hex') end,
  approvals,rechecks,source_license,reviewer,approved_at,dry_run);
end; $$;
grant execute on function pg_temp.v2_promote(text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,text,text,timestamptz,boolean) to service_role,anon,authenticated;


do $$
declare
  target_batch constant uuid := '37000000-0000-4000-8000-000000000001';
  target_version constant text := 'task7-reviewed-v2';
  reviewed_at constant timestamptz := '2026-08-22T00:00:00Z';
  places_text text;
  valid_places text;
  valid_menus text;
  scenario text;
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
  if catalog_admin.naver_search_matches('https://map.naver.com/p/search/Wrong%20Place','Name','Address')
    or catalog_admin.naver_search_matches('https://map.naver.com/p/search/%FF','Name','Address')
    or not catalog_admin.naver_search_matches('https://map.naver.com/p/search/Name%20Address','Name','Address') then
    raise exception 'search identity or UTF-8 boundary mismatch';
  end if;
  select public.get_public_catalog() into baseline;
  select string_agg(payload || E'\n', '' order by series) into places_text
  from (
    select series, jsonb_build_object(
      'id', '37000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'slug', 'approval-place-' || series,
      'name', 'Approval place ' || series,
      'address', 'Approval address ' || series,
      'latitude', -33.86,
      'longitude', 151.2,
      'naverPlaceUrl', 'https://map.naver.com/p/entry/place/' || series,
      'schemaVersion','2.0.0','phone',null,'brandId',null,'brandVariant',null,'media',jsonb_build_array(),
      'published', true,
      'dataMode', 'production'
    )::text as payload
    from generate_series(1, 100) as series
  ) as rows;
  select string_agg(payload || E'\n', '' order by series) into menus_text
  from (
    select series, jsonb_build_object(
      'id', '47000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'placeId', '37000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
      'name', 'Approval menu ' || series,
      'schemaVersion','2.0.0','brandId',null,'brandVariant',null,'branchApplicability','branch_confirmed',
      'facts', jsonb_build_object('scope','meal','form','rice','ingredients',jsonb_build_array('chicken'), 'rice_base','brown_rice','base_is_option',false,'dietary','unknown','ordering_note',null,'cooking',jsonb_build_array('grilled'),'selection_reasons',jsonb_build_array(jsonb_build_object('kind','whole_grain','basis','menu_name','text','brown rice'))),
      'evidenceUrl', null,
      'verificationMethod', 'direct_confirmation',
      'verifiedAt', (current_date - 1)::text,
      'validUntil', (current_date + 89)::text,
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
    'placeId', '37000000-0000-4000-8001-' || lpad(series::text, 12, '0'),
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
      select ('37000000-0000-4000-8001-' || lpad(series::text, 12, '0'))::uuid as id,
        encode(extensions.digest(convert_to(
          target_version || ':' ||
          ('37000000-0000-4000-8001-' || lpad(series::text, 12, '0')),
          'UTF8'
        ), 'sha256'), 'hex') as selection_key
      from generate_series(1, 100) as series
    ) as candidates
  ) as ranked where ranked.selection_rank <= 20;

  foreach role_name in array array['anon', 'authenticated']::text[] loop
    rejected := false;
    begin
      execute format('set local role %I', role_name);
      perform pg_temp.v2_promote(
        '2.0.0', target_version, target_batch, transport_hash, 100, 100,
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
      'value', '37000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'approval', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'approval', 'field', 'reviewedAt',
      'value', '2099-01-01T00:00:00Z'),
    jsonb_build_object('target', 'approval', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'approval', 'field', 'evidenceReference', 'value', ''),
    jsonb_build_object('target', 'approval', 'field', 'evidenceHash', 'value', 'invalid'),
    jsonb_build_object('target', 'recheck', 'field', 'placeId',
      'value', '37000000-0000-4000-8001-000000000099'),
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
      perform pg_temp.v2_promote(
        '2.0.0', target_version, target_batch, transport_hash, 100, 100,
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


  valid_places := places_text; valid_menus := menus_text;
  foreach scenario in array array['candidate_status','empty_reasons','invalid_scope','brand_without_id','wrong_coordinates','naver_bad_search','media_unapproved','private_key','future_verified','orphan','public_hash','artifact_hash'] loop
    places_text := valid_places; menus_text := valid_menus;
    perform set_config('healthmap.test_tamper',scenario,true);
    case scenario
      when 'candidate_status' then menus_text := replace(menus_text,'"facts": {','"facts": {"status":"candidate",');
      when 'empty_reasons' then menus_text := regexp_replace(menus_text,'"selection_reasons": \[[^]]*\]','"selection_reasons": []','g');
      when 'invalid_scope' then menus_text := replace(menus_text,'"scope": "meal"','"scope": "medical"');
      when 'brand_without_id' then menus_text := replace(menus_text,'"branch_confirmed"','"brand_common_unverified"');
      when 'wrong_coordinates' then places_text := replace(places_text,'-33.86','91');
      when 'naver_bad_search' then places_text := replace(places_text,'/p/entry/place/','/p/search/?query=');
      when 'media_unapproved' then places_text := replace(places_text,'"media": []','"media": [{"url":"https://evil.example/menu.svg","sourceUrl":"https://evil.example/","alt":"menu","scope":"place","usageApproved":false}]');
      when 'private_key' then menus_text := replace(menus_text,'"facts": {','"facts": {"privateEvidence":"secret",');
      when 'future_verified' then menus_text := replace(menus_text,(current_date - 1)::text,(current_date + 1)::text);
      when 'orphan' then menus_text := replace(menus_text,'37000000-0000-4000-8001-000000000100','37000000-0000-4000-8001-000000009999');
      else null;
    end case;
    rejected := false;
    begin
      set local role service_role;
      perform pg_temp.v2_promote('2.0.0',target_version,target_batch,
        encode(extensions.digest(convert_to(places_text || menus_text,'UTF8'),'sha256'),'hex'),100,100,
        places_text,menus_text,approvals,rechecks,'reviewed-policy:2026-08-21','task7-primary-reviewer',reviewed_at,false);
    exception when others then rejected := true;
    end;
    reset role;
    if not rejected or public.get_public_catalog() is distinct from baseline
      or exists (select 1 from catalog_admin.import_batches where id = target_batch) then
      raise exception 'v2 negative case accepted or mutated state: %',scenario;
    end if;
    raise notice 'v2 rejection without mutation: %',scenario;
  end loop;
  perform set_config('healthmap.test_tamper','',true);
  places_text := valid_places; menus_text := valid_menus;
  rejected := false;
  begin
    set local role service_role;
    perform public.promote_catalog_bundle('2.0.0',target_version,target_batch,transport_hash,100,100,
      places_text,menus_text,approvals,rechecks,'reviewed-policy:2026-08-21','task7-primary-reviewer',reviewed_at,false);
  exception when others then rejected := true;
  end;
  reset role;
  if not rejected then raise exception 'v2 bypassed full approval binding via legacy RPC'; end if;

  set local role service_role;
  result := pg_temp.v2_promote('2.0.0',target_version,target_batch,transport_hash,100,100,
    places_text,menus_text,approvals,rechecks,'reviewed-policy:2026-08-21','task7-primary-reviewer',reviewed_at,true);
  reset role;
  if result->>'status' <> 'validated' or public.get_public_catalog() is distinct from baseline
    or exists (select 1 from catalog_admin.import_batches where id = target_batch) then raise exception 'dry run mutated state'; end if;
  set local role service_role;
  result := pg_temp.v2_promote(
    '2.0.0', target_version, target_batch, transport_hash, 100, 100,
    places_text, menus_text, approvals, rechecks,
    'reviewed-policy:2026-08-21', 'task7-primary-reviewer', reviewed_at, false
  );
  reset role;
  if result->>'status' <> 'promoted' then
    raise exception using message = 'valid first apply was not promoted';
  end if;

  select public.get_public_catalog() into promoted_snapshot;
  if promoted_snapshot->>'schemaVersion' <> '2.0.0' or jsonb_array_length(promoted_snapshot->'places') <> 100
    or jsonb_array_length(promoted_snapshot->'menus') <> 100
    or exists (select 1 from jsonb_array_elements(promoted_snapshot->'places') p where p ? 'healthTags' or p ? 'primaryTag')
    or exists (select 1 from jsonb_array_elements(promoted_snapshot->'menus') m where m ? 'healthTags' or m->'facts' ? 'status')
    then raise exception 'public v2 DTO mismatch'; end if;
  select jsonb_agg(to_jsonb(approval) order by approval.place_id) into stored_approvals
  from catalog_admin.place_approvals as approval where approval.batch_id = target_batch;
  select jsonb_agg(to_jsonb(recheck) order by recheck.selection_rank) into stored_rechecks
  from catalog_admin.place_rechecks as recheck where recheck.batch_id = target_batch;

  set local role service_role;
  result := pg_temp.v2_promote(
    '2.0.0', target_version, target_batch, transport_hash, 100, 100,
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
      'value', '37000000-0000-4000-8001-000000000099'),
    jsonb_build_object('target', 'recheck', 'field', 'reviewer', 'value', 'changed-reviewer'),
    jsonb_build_object('target', 'recheck', 'field', 'reviewedAt',
      'value', '2026-08-23T00:00:00Z'),
    jsonb_build_object('target', 'recheck', 'field', 'decision', 'value', 'rejected'),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceReference',
      'value', 'review://changed'),
    jsonb_build_object('target', 'recheck', 'field', 'evidenceHash',
      'value', repeat('f', 64)),
    jsonb_build_object('target', 'recheck', 'field', 'placeId',
      'value', '37000000-0000-4000-8001-000000000099'),
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
      perform pg_temp.v2_promote(
        '2.0.0', target_version, target_batch, transport_hash, 100, 100,
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
  'search_identity', 'enforced',
  'v2_fact_transport_matrix', '12_rejected_without_mutation',
  'dry_run', 'unchanged',
  'v2_missing_artifact', 'rejected',
  'first_write_tamper_matrix', '16_rejected_without_mutation',
  'first_apply', 'promoted',
  'exact_replay', 'idempotent',
  'tamper_matrix', '14_rejected_without_mutation',
  'anon_execute', 'denied',
  'authenticated_execute', 'denied'
);

rollback;
