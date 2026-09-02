begin;

do $$
declare
  target_batch uuid := '50000000-0000-4000-8000-000000000001';
  computed_hash text;
  error_message text;
  promotion_rejected boolean;
  rpc jsonb;
  baseline_rpc jsonb;
begin
  if not has_function_privilege('anon', 'public.get_public_catalog()', 'EXECUTE')
    or has_function_privilege(
      'anon',
      'catalog_admin.promote_catalog_batch(uuid,text,text,integer,integer)',
      'EXECUTE'
    )
    or has_schema_privilege('anon', 'catalog_admin', 'USAGE') then
    raise exception using message = 'catalog RPC or admin privilege boundary is incorrect';
  end if;

  begin
    set local role anon;
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published, data_mode
    ) values (
      'anon-write', 'denied', 'denied', 37.5000, 127.0328,
      'https://map.naver.com/p/entry/place/1', 'balanced',
      array['balanced']::public.health_tag[], false, 'production'
    );
    raise exception using message = 'anonymous catalog write unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  begin
    set local role anon;
    perform id from public.places limit 1;
    raise exception using message = 'anonymous direct place read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  begin
    set local role anon;
    perform id from public.menus limit 1;
    raise exception using message = 'anonymous direct menu read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  begin
    set local role anon;
    perform catalog_version from public.catalog_state;
    raise exception using message = 'anonymous direct state read unexpectedly succeeded';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  insert into public.places (
    id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, published, data_mode
  ) values
    ('30000000-0000-4000-8001-000000000001', 'current-retained', 'current', 'current',
     37.5000, 127.0328, 'https://map.naver.com/p/entry/place/current', 'balanced',
     array['balanced']::public.health_tag[], true, 'production'),
    ('30000000-0000-4000-8001-000000000002', 'expired-hidden', 'expired', 'expired',
     37.5000, 127.0328, 'https://map.naver.com/p/entry/place/expired', 'balanced',
     array['balanced']::public.health_tag[], true, 'production'),
    ('30000000-0000-4000-8001-000000000003', 'menu-less-hidden', 'empty', 'empty',
     37.5000, 127.0328, 'https://map.naver.com/p/entry/place/empty', 'balanced',
     array['balanced']::public.health_tag[], true, 'production');

  insert into public.menus (
    id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, published, data_mode
  ) values
    ('40000000-0000-4000-8001-000000000001', '30000000-0000-4000-8001-000000000001',
     'current menu', array['balanced']::public.health_tag[], null, 'direct_confirmation',
     current_date - 1, current_date + 89, 0, true, 'production'),
    ('40000000-0000-4000-8001-000000000002', '30000000-0000-4000-8001-000000000002',
     'expired menu', array['balanced']::public.health_tag[], null, 'direct_confirmation',
     current_date - 100, current_date - 10, 0, true, 'production');

  insert into catalog_admin.catalog_place_memberships (catalog_version, place_id)
  select 'legacy-20260821', id from public.places
  where id in (
    '30000000-0000-4000-8001-000000000001',
    '30000000-0000-4000-8001-000000000002',
    '30000000-0000-4000-8001-000000000003'
  );
  insert into catalog_admin.catalog_menu_memberships (catalog_version, menu_id)
  select 'legacy-20260821', id from public.menus
  where id in (
    '40000000-0000-4000-8001-000000000001',
    '40000000-0000-4000-8001-000000000002'
  );

  rpc := public.get_public_catalog();
  if jsonb_array_length(rpc->'places') <> 1
    or jsonb_array_length(rpc->'menus') <> 1
    or rpc->'places'->0->>'slug' <> 'current-retained'
    or rpc->'menus'->0->>'name' <> 'current menu' then
    raise exception using message = 'RPC exposed expired or menu-less catalog rows';
  end if;
  baseline_rpc := rpc;

  insert into catalog_admin.import_batches (
    id, catalog_version, data_mode, manifest_place_count, manifest_menu_count,
    manifest_hash, source_license, reviewer, sample_population_count, sample_reviewed_count
  ) values (
    target_batch, 'policy-v1', 'production', 100, 100, repeat('0', 64),
    'open-data', 'import-reviewer', 100, 20
  );

  insert into catalog_admin.staged_places (
    batch_id, id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, data_mode, raw_provenance, source_hash
  )
  select target_batch,
    ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    'policy-place-' || series, 'place ' || series, 'address ' || series,
    37.5000, 127.0328, 'https://map.naver.com/p/entry/place/' || series,
    'balanced', array['balanced']::public.health_tag[], 'production',
    jsonb_build_object('source', series), repeat('a', 64)
  from generate_series(1, 99) as series;

  insert into catalog_admin.staged_menus (
    batch_id, id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, data_mode, raw_provenance, source_hash
  )
  select target_batch,
    ('40000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    ('30000000-0000-4000-8000-' || lpad(series::text, 12, '0'))::uuid,
    'menu ' || series, array['balanced']::public.health_tag[], null, 'direct_confirmation',
    current_date - 1, current_date + 89, 0, 'production',
    jsonb_build_object('source', series), repeat('b', 64)
  from generate_series(1, 99) as series;

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', repeat('0', 64), 100, 100);
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'at least one hundred verified places are required'
    or exists (select 1 from public.catalog_state where catalog_version = 'policy-v1') then
    raise exception using message = 'sub-100 promotion was not rejected atomically';
  end if;

  insert into catalog_admin.staged_places (
    batch_id, id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, data_mode, raw_provenance, source_hash
  ) values (
    target_batch, '30000000-0000-4000-8000-000000000100', 'policy-place-100',
    'place 100', 'address 100', 37.5000, 127.0328,
    'https://map.naver.com/p/entry/place/100', 'balanced',
    array['balanced']::public.health_tag[], 'production', '{"source":100}', repeat('a', 64)
  );
  insert into catalog_admin.staged_menus (
    batch_id, id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, data_mode, raw_provenance, source_hash
  ) values (
    target_batch, '40000000-0000-4000-8000-000000000100',
    '30000000-0000-4000-8000-000000000100', 'menu 100',
    array['balanced']::public.health_tag[], null, 'direct_confirmation',
    current_date - 1, current_date + 89, 0, 'production', '{"source":100}', repeat('b', 64)
  );

  insert into catalog_admin.place_approvals (
    batch_id, place_id, reviewer, reviewed_at, decision,
    reviewed_evidence_reference, reviewed_evidence_hash
  )
  select target_batch, place.id, 'first-reviewer', now(), 'approved',
    'private-evidence:' || place.id, repeat('c', 64)
  from catalog_admin.staged_places as place where place.batch_id = target_batch;

  insert into catalog_admin.place_rechecks (
    batch_id, place_id, selection_rank, selection_key, reviewer, reviewed_at, decision,
    reviewed_evidence_reference, reviewed_evidence_hash
  )
  select target_batch, ranked.id, ranked.selection_rank, ranked.selection_key,
    'second-reviewer', now(), 'approved', 'independent-evidence:' || ranked.id, repeat('d', 64)
  from (
    select place.id,
      row_number() over (order by encode(
        extensions.digest(convert_to('policy-v1:' || place.id::text, 'UTF8'), 'sha256'), 'hex'
      ), place.id)::integer as selection_rank,
      encode(
        extensions.digest(convert_to('policy-v1:' || place.id::text, 'UTF8'), 'sha256'), 'hex'
      ) as selection_key
    from catalog_admin.staged_places as place where place.batch_id = target_batch
  ) as ranked
  where ranked.selection_rank <= 20;

  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(
      target_batch, 'policy-v1', repeat('f', 64), 100, 100
    );
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'catalog manifest mismatch'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'manifest mismatch was not rejected atomically';
  end if;

  update catalog_admin.staged_places set latitude = 0
  where batch_id = target_batch and id = '30000000-0000-4000-8000-000000000001';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'invalid staged place'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'malformed place was not rejected atomically';
  end if;
  update catalog_admin.staged_places set latitude = 37.5000
  where batch_id = target_batch and id = '30000000-0000-4000-8000-000000000001';

  update catalog_admin.staged_menus set display_order = -1
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'invalid staged menu'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'malformed menu was not rejected atomically';
  end if;
  update catalog_admin.staged_menus set display_order = 0
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';

  update catalog_admin.staged_places set id = '30000000-0000-4000-8000-000000000001'
  where batch_id = target_batch and row_id = (
    select max(row_id) from catalog_admin.staged_places where batch_id = target_batch
  );
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'duplicate catalog IDs or slugs'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'duplicate place ID was not rejected atomically';
  end if;
  update catalog_admin.staged_places set id = '30000000-0000-4000-8000-000000000100'
  where batch_id = target_batch and row_id = (
    select max(row_id) from catalog_admin.staged_places where batch_id = target_batch
  );

  update catalog_admin.staged_places set slug = 'policy-place-1'
  where batch_id = target_batch and id = '30000000-0000-4000-8000-000000000100';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'duplicate catalog IDs or slugs'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'duplicate place slug was not rejected atomically';
  end if;
  update catalog_admin.staged_places set slug = 'policy-place-100'
  where batch_id = target_batch and id = '30000000-0000-4000-8000-000000000100';

  update catalog_admin.staged_menus set place_id = '30000000-0000-4000-8999-000000000001'
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'orphan menu or place without a menu'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'orphan menu was not rejected atomically: ' || coalesce(error_message, 'none');
  end if;
  update catalog_admin.staged_menus set place_id = '30000000-0000-4000-8000-000000000001'
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';

  update catalog_admin.staged_menus set place_id = '30000000-0000-4000-8000-000000000001'
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000002';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'orphan menu or place without a menu'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'missing place menu was not rejected atomically';
  end if;
  update catalog_admin.staged_menus set place_id = '30000000-0000-4000-8000-000000000002'
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000002';

  update catalog_admin.staged_menus
  set verified_at = current_date - 100, valid_until = current_date - 10
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true; error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'invalid staged menu'
    or public.get_public_catalog() is distinct from baseline_rpc
    or exists (select 1 from catalog_admin.catalog_versions where catalog_version = 'policy-v1') then
    raise exception using message = 'expired evidence was not rejected atomically';
  end if;
  update catalog_admin.staged_menus
  set verified_at = current_date - 1, valid_until = current_date + 89
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000001';
  update catalog_admin.staged_menus set valid_until = current_date + 90
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000100';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'invalid staged menu'
    or exists (select 1 from public.catalog_state where catalog_version = 'policy-v1') then
    raise exception using message = 'overlong validity promotion was not rejected atomically';
  end if;

  update catalog_admin.staged_menus
  set valid_until = current_date + 89
  where batch_id = target_batch and id = '40000000-0000-4000-8000-000000000100';
  computed_hash := catalog_admin.compute_batch_manifest_hash(target_batch);
  update catalog_admin.import_batches set manifest_hash = computed_hash where id = target_batch;
  delete from catalog_admin.place_approvals
  where batch_id = target_batch and place_id = '30000000-0000-4000-8000-000000000100';

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected or error_message <> 'every staged place requires private human approval'
    or exists (select 1 from public.catalog_state where catalog_version = 'policy-v1') then
    raise exception using message = 'missing place approval was not rejected atomically';
  end if;

  insert into catalog_admin.place_approvals (
    batch_id, place_id, reviewer, reviewed_at, decision,
    reviewed_evidence_reference, reviewed_evidence_hash
  ) values (
    target_batch, '30000000-0000-4000-8000-000000000100', 'first-reviewer', now(),
    'approved', 'private-evidence:100', repeat('c', 64)
  );
  delete from catalog_admin.place_rechecks
  where batch_id = target_batch and selection_rank = 20;

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected
    or error_message <> 'independent deterministic place rechecks are incomplete or failed'
    or exists (select 1 from public.catalog_state where catalog_version = 'policy-v1') then
    raise exception using message = 'inadequate sample was not rejected atomically';
  end if;

  insert into catalog_admin.place_rechecks (
    batch_id, place_id, selection_rank, selection_key, reviewer, reviewed_at, decision,
    reviewed_evidence_reference, reviewed_evidence_hash
  )
  select target_batch, ranked.id, ranked.selection_rank, ranked.selection_key,
    'first-reviewer', now(), 'approved', 'non-independent:' || ranked.id, repeat('d', 64)
  from (
    select place.id,
      row_number() over (order by encode(
        extensions.digest(convert_to('policy-v1:' || place.id::text, 'UTF8'), 'sha256'), 'hex'
      ), place.id)::integer as selection_rank,
      encode(
        extensions.digest(convert_to('policy-v1:' || place.id::text, 'UTF8'), 'sha256'), 'hex'
      ) as selection_key
    from catalog_admin.staged_places as place where place.batch_id = target_batch
  ) as ranked
  where ranked.selection_rank = 20;

  promotion_rejected := false;
  begin
    perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  exception when others then
    promotion_rejected := true;
    error_message := sqlerrm;
  end;
  if not promotion_rejected
    or error_message <> 'independent deterministic place rechecks are incomplete or failed'
    or exists (select 1 from public.catalog_state where catalog_version = 'policy-v1') then
    raise exception using message = 'non-independent sample was not rejected atomically';
  end if;

  update catalog_admin.place_rechecks set reviewer = 'second-reviewer'
  where batch_id = target_batch and selection_rank = 20;

  perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);
  perform catalog_admin.promote_catalog_batch(target_batch, 'policy-v1', computed_hash, 100, 100);

  rpc := public.get_public_catalog();
  if not exists (select 1 from public.places where slug = 'current-retained')
    or jsonb_array_length(rpc->'places') <> 100
    or jsonb_array_length(rpc->'menus') <> 100
    or (select catalog_version from public.catalog_state where singleton) <> 'policy-v1'
    or (select manifest_place_count from catalog_admin.catalog_versions
      where catalog_version = 'policy-v1') <> 100
    or (select count(*) from catalog_admin.catalog_place_memberships
      where catalog_version = 'policy-v1') <> 100
    or (select count(*) from catalog_admin.catalog_menu_memberships
      where catalog_version = 'policy-v1') <> 100
    or (select count(*) from jsonb_object_keys(rpc)) <> 4 then
    raise exception using message = 'successful promotion, retention, idempotency, or RPC failed';
  end if;
end
$$;

select json_build_object(
  'rpc_expiry_filter', 'enforced',
  'minimum_places', 100,
  'validity_windows', '90/180',
  'place_approvals', 'complete',
  'independent_sample', 'deterministic_20_percent',
  'failed_promotions', 'atomic',
  'successful_promotion', 'idempotent',
  'absent_rows', 'retained',
  'version_membership', 'exact',
  'direct_table_access', 'denied',
  'rls_enabled', (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in (
      'public.places'::regclass,
      'public.menus'::regclass,
      'public.catalog_state'::regclass
    )
  )
) as contract_result;

rollback;
