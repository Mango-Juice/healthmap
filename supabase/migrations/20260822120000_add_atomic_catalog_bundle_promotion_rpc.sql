alter table catalog_admin.import_batches
  add column schema_version text,
  add column transport_hash text;

alter table catalog_admin.import_batches
  add constraint import_batches_schema_version_check check (
    schema_version is null or char_length(btrim(schema_version)) between 1 and 40
  ),
  add constraint import_batches_transport_hash_check check (
    transport_hash is null or transport_hash ~ '^[a-f0-9]{64}$'
  );

grant usage on schema extensions to service_role;
grant execute on function extensions.digest(bytea, text) to service_role;

create or replace function public.promote_catalog_bundle(
  schema_version text,
  catalog_version text,
  batch_id uuid,
  manifest_hash text,
  place_count integer,
  menu_count integer,
  places_jsonl text,
  menus_jsonl text,
  approvals jsonb,
  rechecks jsonb,
  source_license text,
  reviewer text,
  approved_at timestamptz,
  dry_run boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actual_hash text;
  internal_hash text;
  promotion jsonb;
  existing_batch catalog_admin.import_batches%rowtype;
begin
  if schema_version <> '1.0.0'
    or catalog_version is null or char_length(btrim(catalog_version)) not between 1 and 120
    or manifest_hash !~ '^[a-f0-9]{64}$'
    or place_count < 100 or menu_count < place_count
    or jsonb_typeof(approvals) <> 'array' or jsonb_typeof(rechecks) <> 'array'
    or char_length(btrim(source_license)) = 0 or char_length(btrim(reviewer)) = 0
    or approved_at is null then
    raise exception using message = 'invalid promotion manifest metadata';
  end if;

  actual_hash := encode(
    extensions.digest(convert_to(places_jsonl || menus_jsonl, 'UTF8'), 'sha256'), 'hex'
  );
  if actual_hash <> manifest_hash then
    raise exception using message = 'transport manifest hash mismatch';
  end if;

  select * into existing_batch
  from catalog_admin.import_batches where id = batch_id;
  if found and existing_batch.status = 'promoted' then
    if existing_batch.schema_version = schema_version
      and existing_batch.catalog_version = catalog_version
      and existing_batch.transport_hash = manifest_hash
      and existing_batch.manifest_place_count = place_count
      and existing_batch.manifest_menu_count = menu_count then
      return jsonb_build_object(
        'counts', jsonb_build_object('places', place_count, 'menus', menu_count),
        'hash', manifest_hash, 'version', catalog_version,
        'status', case when dry_run then 'validated' else 'promoted' end, 'dryRun', dry_run
      );
    end if;
    raise exception using message = 'promoted transport manifest mismatch';
  end if;

  begin
    if found then
      delete from catalog_admin.import_batches where id = batch_id;
    end if;

    insert into catalog_admin.import_batches (
      id, catalog_version, data_mode, manifest_place_count, manifest_menu_count,
      manifest_hash, source_license, reviewer, human_approved_by, human_approved_at,
      sample_population_count, sample_reviewed_count, schema_version, transport_hash
    ) values (
      batch_id, catalog_version, 'production', place_count, menu_count,
      repeat('0', 64), source_license, reviewer, reviewer, approved_at,
      place_count, ceiling(place_count::numeric / 5)::integer, schema_version, manifest_hash
    );

    insert into catalog_admin.staged_places (
      batch_id, id, slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, data_mode, raw_provenance, source_hash
    )
    select batch_id, (row->>'id')::uuid, row->>'slug', row->>'name', row->>'address',
      (row->>'latitude')::double precision, (row->>'longitude')::double precision,
      row->>'naverPlaceUrl', (row->>'primaryTag')::public.health_tag,
      array(select jsonb_array_elements_text(row->'healthTags'))::public.health_tag[],
      row->>'dataMode', jsonb_build_object(
        'schemaVersion', schema_version, 'catalogVersion', catalog_version
      ), manifest_hash
    from (
      select line::jsonb as row
      from regexp_split_to_table(trim(trailing E'\n' from places_jsonl), E'\n') as line
      where char_length(line) > 0
    ) as records
    where (select array_agg(key order by key) from jsonb_object_keys(row) as key) = array[
      'address', 'dataMode', 'healthTags', 'id', 'latitude', 'longitude', 'name',
      'naverPlaceUrl', 'primaryTag', 'published', 'slug'
    ]
      and row->>'dataMode' = 'production'
      and (row->>'published')::boolean is true;

    insert into catalog_admin.staged_menus (
      batch_id, id, place_id, name, health_tags, evidence_url, verification_method,
      verified_at, valid_until, display_order, data_mode, raw_provenance, source_hash
    )
    select batch_id, (row->>'id')::uuid, (row->>'placeId')::uuid, row->>'name',
      array(select jsonb_array_elements_text(row->'healthTags'))::public.health_tag[],
      row->>'evidenceUrl', (row->>'verificationMethod')::public.verification_method,
      (row->>'verifiedAt')::date, (row->>'validUntil')::date,
      (row->>'displayOrder')::integer, row->>'dataMode', jsonb_build_object(
        'schemaVersion', schema_version, 'catalogVersion', catalog_version
      ), manifest_hash
    from (
      select line::jsonb as row
      from regexp_split_to_table(trim(trailing E'\n' from menus_jsonl), E'\n') as line
      where char_length(line) > 0
    ) as records
    where (select array_agg(key order by key) from jsonb_object_keys(row) as key) = array[
      'dataMode', 'displayOrder', 'evidenceUrl', 'healthTags', 'id', 'name', 'placeId',
      'published', 'validUntil', 'verificationMethod', 'verifiedAt'
    ]
      and row->>'dataMode' = 'production'
      and (row->>'published')::boolean is true;

    if (select count(*) from catalog_admin.staged_places as place
        where place.batch_id = promote_catalog_bundle.batch_id)
        <> place_count
      or (select count(*) from catalog_admin.staged_menus as menu
        where menu.batch_id = promote_catalog_bundle.batch_id)
        <> menu_count then
      raise exception using message = 'strict transport records or counts are invalid';
    end if;

    insert into catalog_admin.place_approvals (
      batch_id, place_id, reviewer, reviewed_at, decision,
      reviewed_evidence_reference, reviewed_evidence_hash
    )
    select batch_id, (record->>'placeId')::uuid, record->>'reviewer',
      (record->>'reviewedAt')::timestamptz, record->>'decision',
      record->>'evidenceReference', record->>'evidenceHash'
    from jsonb_array_elements(approvals) as record
    where (select array_agg(key order by key) from jsonb_object_keys(record) as key) = array[
      'decision', 'evidenceHash', 'evidenceReference', 'placeId', 'reviewedAt', 'reviewer'
    ];

    insert into catalog_admin.place_rechecks (
      batch_id, place_id, selection_rank, selection_key, reviewer, reviewed_at, decision,
      reviewed_evidence_reference, reviewed_evidence_hash
    )
    select batch_id, (record->>'placeId')::uuid, (record->>'selectionRank')::integer,
      record->>'selectionKey', record->>'reviewer',
      (record->>'reviewedAt')::timestamptz, record->>'decision',
      record->>'evidenceReference', record->>'evidenceHash'
    from jsonb_array_elements(rechecks) as record
    where (select array_agg(key order by key) from jsonb_object_keys(record) as key) = array[
      'decision', 'evidenceHash', 'evidenceReference', 'placeId', 'reviewedAt', 'reviewer',
      'selectionKey', 'selectionRank'
    ];

    internal_hash := catalog_admin.compute_batch_manifest_hash(batch_id);
    update catalog_admin.import_batches set manifest_hash = internal_hash where id = batch_id;
    promotion := catalog_admin.promote_catalog_batch(
      batch_id, catalog_version, internal_hash, place_count, menu_count
    );

    if dry_run then
      raise exception using errcode = 'HMDRY', message = 'dry_run_validation_complete';
    end if;
  exception when sqlstate 'HMDRY' then
    promotion := jsonb_build_object('status', 'validated');
  end;

  return jsonb_build_object(
    'counts', jsonb_build_object('places', place_count, 'menus', menu_count),
    'hash', manifest_hash, 'version', catalog_version,
    'status', promotion->>'status', 'dryRun', dry_run
  );
end;
$$;

revoke all on function public.promote_catalog_bundle(
  text, text, uuid, text, integer, integer, text, text, jsonb, jsonb,
  text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function public.promote_catalog_bundle(
  text, text, uuid, text, integer, integer, text, text, jsonb, jsonb,
  text, text, timestamptz, boolean
) to service_role;
