alter function public.promote_catalog_bundle(
  text, text, uuid, text, integer, integer, text, text, jsonb, jsonb,
  text, text, timestamptz, boolean
) set schema catalog_admin;

revoke all on function catalog_admin.promote_catalog_bundle(
  text, text, uuid, text, integer, integer, text, text, jsonb, jsonb,
  text, text, timestamptz, boolean
) from public, anon, authenticated;
grant execute on function catalog_admin.promote_catalog_bundle(
  text, text, uuid, text, integer, integer, text, text, jsonb, jsonb,
  text, text, timestamptz, boolean
) to service_role;

create function public.promote_catalog_bundle(
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
  existing_status text;
  transport_place_ids jsonb;
  approval_place_ids jsonb;
  expected_recheck_selection jsonb;
  incoming_recheck_selection jsonb;
  incoming_approvals jsonb;
  incoming_rechecks jsonb;
  stored_approvals jsonb;
  stored_rechecks jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(batch_id::text, 0)
  );

  if jsonb_typeof(approvals) is distinct from 'array'
    or jsonb_typeof(rechecks) is distinct from 'array'
    or exists (
      select 1
      from jsonb_array_elements(approvals) as record
      where (select array_agg(key order by key) from jsonb_object_keys(record) as key)
        is distinct from array[
          'decision', 'evidenceHash', 'evidenceReference', 'placeId', 'reviewedAt', 'reviewer'
        ]
    )
    or exists (
      select 1
      from jsonb_array_elements(rechecks) as record
      where (select array_agg(key order by key) from jsonb_object_keys(record) as key)
        is distinct from array[
          'decision', 'evidenceHash', 'evidenceReference', 'placeId', 'reviewedAt',
          'reviewer', 'selectionKey', 'selectionRank'
        ]
    ) then
    raise exception using message = 'invalid promotion approval records';
  end if;

  select coalesce(jsonb_agg(to_jsonb((line::jsonb->>'id')::uuid) order by ordinal), '[]'::jsonb)
  into transport_place_ids
  from pg_catalog.regexp_split_to_table(
    trim(trailing E'\n' from places_jsonl), E'\n'
  ) with ordinality as lines(line, ordinal)
  where char_length(line) > 0;

  select coalesce(jsonb_agg(to_jsonb((record->>'placeId')::uuid) order by ordinal), '[]'::jsonb)
  into approval_place_ids
  from jsonb_array_elements(approvals) with ordinality as records(record, ordinal);

  if reviewer is null or char_length(btrim(reviewer)) = 0
    or approved_at is null or approved_at > pg_catalog.now()
    or jsonb_array_length(approvals) <> place_count
    or jsonb_array_length(transport_place_ids) <> place_count
    or approval_place_ids is distinct from transport_place_ids
    or exists (
      select 1 from jsonb_array_elements(approvals) as record
      where record->>'reviewer' is distinct from reviewer
        or (record->>'reviewedAt')::timestamptz is distinct from approved_at
        or (record->>'reviewedAt')::timestamptz > pg_catalog.now()
        or record->>'decision' is distinct from 'approved'
        or record->>'evidenceReference' is null
        or char_length(btrim(record->>'evidenceReference')) = 0
        or record->>'evidenceHash' is null
        or record->>'evidenceHash' !~ '^[a-f0-9]{64}$'
    ) then
    raise exception using message = 'primary promotion approvals are invalid';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placeId', ranked.id,
    'selectionRank', ranked.selection_rank,
    'selectionKey', ranked.selection_key
  ) order by ranked.selection_rank), '[]'::jsonb)
  into expected_recheck_selection
  from (
    select candidate.id,
      row_number() over (order by candidate.selection_key, candidate.id)::integer as selection_rank,
      candidate.selection_key
    from (
      select (line::jsonb->>'id')::uuid as id,
        encode(extensions.digest(convert_to(
          catalog_version || ':' || (line::jsonb->>'id')::uuid::text, 'UTF8'
        ), 'sha256'), 'hex') as selection_key
      from pg_catalog.regexp_split_to_table(
        trim(trailing E'\n' from places_jsonl), E'\n'
      ) as line
      where char_length(line) > 0
    ) as candidate
  ) as ranked
  where ranked.selection_rank <= ceiling(place_count::numeric / 5)::integer;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placeId', (record->>'placeId')::uuid,
    'selectionRank', (record->>'selectionRank')::integer,
    'selectionKey', record->>'selectionKey'
  ) order by ordinal), '[]'::jsonb)
  into incoming_recheck_selection
  from jsonb_array_elements(rechecks) with ordinality as records(record, ordinal);

  if jsonb_array_length(rechecks) <> ceiling(place_count::numeric / 5)::integer
    or incoming_recheck_selection is distinct from expected_recheck_selection
    or (select count(distinct record->>'reviewer') from jsonb_array_elements(rechecks) as record)
      <> 1
    or exists (
      select 1 from jsonb_array_elements(rechecks) as record
      where record->>'reviewer' is null
        or char_length(btrim(record->>'reviewer')) = 0
        or record->>'reviewer' = reviewer
        or (record->>'reviewedAt')::timestamptz is distinct from approved_at
        or (record->>'reviewedAt')::timestamptz > pg_catalog.now()
        or record->>'decision' is distinct from 'approved'
        or record->>'evidenceReference' is null
        or char_length(btrim(record->>'evidenceReference')) = 0
        or record->>'evidenceHash' is null
        or record->>'evidenceHash' !~ '^[a-f0-9]{64}$'
    ) then
    raise exception using message = 'independent promotion rechecks are invalid';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placeId', (record->>'placeId')::uuid,
    'reviewer', record->>'reviewer',
    'reviewedAt', (record->>'reviewedAt')::timestamptz,
    'decision', record->>'decision',
    'evidenceReference', record->>'evidenceReference',
    'evidenceHash', record->>'evidenceHash'
  ) order by (record->>'placeId')::uuid), '[]'::jsonb)
  into incoming_approvals
  from jsonb_array_elements(approvals) as record;

  select coalesce(jsonb_agg(jsonb_build_object(
    'placeId', (record->>'placeId')::uuid,
    'selectionRank', (record->>'selectionRank')::integer,
    'selectionKey', record->>'selectionKey',
    'reviewer', record->>'reviewer',
    'reviewedAt', (record->>'reviewedAt')::timestamptz,
    'decision', record->>'decision',
    'evidenceReference', record->>'evidenceReference',
    'evidenceHash', record->>'evidenceHash'
  ) order by (record->>'selectionRank')::integer, (record->>'placeId')::uuid), '[]'::jsonb)
  into incoming_rechecks
  from jsonb_array_elements(rechecks) as record;

  select batch.status into existing_status
  from catalog_admin.import_batches as batch
  where batch.id = promote_catalog_bundle.batch_id;

  if found and existing_status = 'promoted' then

    select coalesce(jsonb_agg(jsonb_build_object(
      'placeId', approval.place_id,
      'reviewer', approval.reviewer,
      'reviewedAt', approval.reviewed_at,
      'decision', approval.decision,
      'evidenceReference', approval.reviewed_evidence_reference,
      'evidenceHash', approval.reviewed_evidence_hash
    ) order by approval.place_id), '[]'::jsonb)
    into stored_approvals
    from catalog_admin.place_approvals as approval
    where approval.batch_id = promote_catalog_bundle.batch_id;

    select coalesce(jsonb_agg(jsonb_build_object(
      'placeId', recheck.place_id,
      'selectionRank', recheck.selection_rank,
      'selectionKey', recheck.selection_key,
      'reviewer', recheck.reviewer,
      'reviewedAt', recheck.reviewed_at,
      'decision', recheck.decision,
      'evidenceReference', recheck.reviewed_evidence_reference,
      'evidenceHash', recheck.reviewed_evidence_hash
    ) order by recheck.selection_rank, recheck.place_id), '[]'::jsonb)
    into stored_rechecks
    from catalog_admin.place_rechecks as recheck
    where recheck.batch_id = promote_catalog_bundle.batch_id;

    if incoming_approvals is distinct from stored_approvals
      or incoming_rechecks is distinct from stored_rechecks then
      raise exception using message = 'promoted approval replay mismatch';
    end if;
  end if;

  return catalog_admin.promote_catalog_bundle(
    schema_version, catalog_version, batch_id, manifest_hash, place_count, menu_count,
    places_jsonl, menus_jsonl, approvals, rechecks, source_license, reviewer, approved_at, dry_run
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
