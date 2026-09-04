-- Preserve genuine legacy classifications; v2 stores reviewed facts without inferred tags.
create function catalog_admin.valid_v2_details(details jsonb, is_menu boolean)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare facts jsonb; media jsonb; item jsonb;
begin
  if jsonb_typeof(details) is distinct from 'object' then return false; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(details) key)
    is distinct from (case when is_menu then array['branchApplicability','brandId','brandVariant','facts']
      else array['brandId','brandVariant','media','phone'] end) then return false; end if;
  if exists (select 1 from jsonb_each(details) e where e.key in ('brandId','brandVariant','phone')
    and e.value <> 'null'::jsonb and (jsonb_typeof(e.value) <> 'string' or char_length(btrim(e.value #>> '{}')) = 0))
    then return false; end if;
  if is_menu then
    if details->>'branchApplicability' not in ('branch_confirmed','brand_common_unverified')
      or details->>'branchApplicability' is null
      or (details->>'branchApplicability' = 'brand_common_unverified' and details->'brandId' = 'null'::jsonb) then return false; end if;
    facts := details->'facts';
    if jsonb_typeof(facts) is distinct from 'object' then return false; end if;
    if (select array_agg(key order by key) from jsonb_object_keys(facts) key)
      is distinct from array['base_is_option','cooking','dietary','form','ingredients','ordering_note','rice_base','scope','selection_reasons']
      then return false; end if;
    if (facts->>'scope' in ('meal','snack','dessert','drink','unknown')) is not true
      or (facts->>'form' in ('salad_poke','rice','noodles','soup','sandwich','main_dish','unknown')) is not true
      or (facts->>'rice_base' in ('brown_rice','mixed_grain','barley','unknown')) is not true
      or (facts->>'dietary' in ('source_vegan_label','vegan_option','unknown')) is not true
      or jsonb_typeof(facts->'base_is_option') is distinct from 'boolean'
      or (facts->'ordering_note' <> 'null'::jsonb and (jsonb_typeof(facts->'ordering_note') <> 'string'
        or char_length(btrim(facts->>'ordering_note')) = 0))
      or jsonb_typeof(facts->'ingredients') is distinct from 'array'
      or jsonb_typeof(facts->'cooking') is distinct from 'array'
      or jsonb_typeof(facts->'selection_reasons') is distinct from 'array' then return false; end if;
    if exists (select 1 from jsonb_array_elements(facts->'ingredients') v where v not in ('"chicken"'::jsonb,'"fish"'::jsonb,'"tofu_soy"'::jsonb))
      or exists (select 1 from jsonb_array_elements(facts->'cooking') v where v not in ('"grilled"'::jsonb,'"steamed"'::jsonb,'"roasted"'::jsonb)) then return false; end if;
    if jsonb_array_length(facts->'selection_reasons') = 0 then return false; end if;
    for item in select value from jsonb_array_elements(facts->'selection_reasons') loop
      if jsonb_typeof(item) is distinct from 'object' then return false; end if;
      if (select array_agg(key order by key) from jsonb_object_keys(item) key) is distinct from array['basis','kind','text']
        or (item->>'kind' in ('salad_poke','whole_grain','dietary_meal','ingredient_cooking')) is not true
        or (item->>'basis' in ('menu_name','description')) is not true
        or jsonb_typeof(item->'text') is distinct from 'string' or char_length(btrim(item->>'text')) = 0 then return false; end if;
    end loop;
  else
    if jsonb_typeof(details->'media') is distinct from 'array' then return false; end if;
    for media in select value from jsonb_array_elements(details->'media') loop
      if jsonb_typeof(media) is distinct from 'object' then return false; end if;
      if (select array_agg(key order by key) from jsonb_object_keys(media) key) is distinct from array['alt','scope','sourceUrl','url','usageApproved']
        or jsonb_typeof(media->'alt') is distinct from 'string' or char_length(btrim(media->>'alt')) = 0
        or (media->>'scope' in ('place','brand')) is not true or media->'usageApproved' is distinct from 'true'::jsonb
        then return false; end if;
      if exists (select 1 from jsonb_each(media) e where e.key in ('url','sourceUrl') and
        (jsonb_typeof(e.value) <> 'string' or e.value #>> '{}' !~ '^https://[^[:space:]/]+[^[:space:]]*$'
        or e.value #>> '{}' !~ '^https://(www[.])?(salady[.]com|slowcali[.]co[.]kr)/[^#[:space:]]*$'
        or strpos(e.value #>> '{}', chr(92)) > 0
        or (e.key = 'url' and split_part(e.value #>> '{}', '?', 1) !~* '[.](avif|gif|jpe?g|png|webp)$'))) then return false; end if;
    end loop;
  end if;
  return true;
end;
$$;
revoke all on function catalog_admin.valid_v2_details(jsonb, boolean) from public, anon, authenticated;
grant execute on function catalog_admin.valid_v2_details(jsonb, boolean) to service_role;

alter table public.places add column schema_version text not null default '1.0.0', add column v2_details jsonb;
alter table public.places alter column health_tags drop not null;
alter table public.places alter column primary_tag drop not null;
alter table public.places add constraint places_versioned_details_check check (
  (schema_version = '1.0.0' and v2_details is null and health_tags is not null and cardinality(health_tags) > 0 and array_position(health_tags, null) is null and primary_tag is not null and primary_tag = any(health_tags))
  or (schema_version = '2.0.0' and health_tags is null and primary_tag is null and v2_details is not null and catalog_admin.valid_v2_details(v2_details, false))
);

alter table public.menus add column schema_version text not null default '1.0.0', add column v2_details jsonb;
alter table public.menus alter column health_tags drop not null;
alter table public.menus add constraint menus_versioned_details_check check (
  (schema_version = '1.0.0' and v2_details is null and health_tags is not null and cardinality(health_tags) > 0 and array_position(health_tags, null) is null )
  or (schema_version = '2.0.0' and health_tags is null  and v2_details is not null and catalog_admin.valid_v2_details(v2_details, true))
);

alter table catalog_admin.staged_places add column schema_version text not null default '1.0.0', add column v2_details jsonb;
alter table catalog_admin.staged_places alter column health_tags drop not null;
alter table catalog_admin.staged_places alter column primary_tag drop not null;
alter table catalog_admin.staged_places add constraint staged_places_versioned_details_check check (
  (schema_version = '1.0.0' and v2_details is null and health_tags is not null and cardinality(health_tags) > 0 and array_position(health_tags, null) is null and primary_tag is not null and primary_tag = any(health_tags))
  or (schema_version = '2.0.0' and health_tags is null and primary_tag is null and v2_details is not null and catalog_admin.valid_v2_details(v2_details, false))
);

alter table catalog_admin.staged_menus add column schema_version text not null default '1.0.0', add column v2_details jsonb;
alter table catalog_admin.staged_menus alter column health_tags drop not null;
alter table catalog_admin.staged_menus add constraint staged_menus_versioned_details_check check (
  (schema_version = '1.0.0' and v2_details is null and health_tags is not null and cardinality(health_tags) > 0 and array_position(health_tags, null) is null )
  or (schema_version = '2.0.0' and health_tags is null  and v2_details is not null and catalog_admin.valid_v2_details(v2_details, true))
);
alter table public.places drop constraint places_latitude_display_bounds_check, drop constraint places_longitude_display_bounds_check;
alter table public.places add constraint places_latitude_display_bounds_check check (latitude between -90 and 90), add constraint places_longitude_display_bounds_check check (longitude between -180 and 180);

create function catalog_admin.valid_public_naver_url(value text) returns boolean language sql immutable
security invoker set search_path = '' as $$
 select (value ~ '^https://(map[.]naver[.]com/(p|v5)/entry/place/[1-9][0-9]*/?|(m[.]place|pcmap[.]place)[.]naver[.]com/(restaurant|place)/[1-9][0-9]*(/(home|menu|photo|review|information))?/?)([?][^#[:space:]]*)?$'
 or value ~ '^https://map[.]naver[.]com/p/search/([A-Za-z0-9_.!~*''()-]|%[0-9A-Fa-f]{2})+$')
 and strpos(value,chr(92)) = 0;
$$;
revoke all on function catalog_admin.valid_public_naver_url(text) from public,anon,authenticated;
grant execute on function catalog_admin.valid_public_naver_url(text) to service_role;
alter table public.places drop constraint places_naver_place_url_check;
alter table public.places add constraint places_naver_place_url_check check (
 (schema_version = '2.0.0' and catalog_admin.valid_public_naver_url(naver_place_url)) or
 (schema_version = '1.0.0' and naver_place_url ~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$')
);
alter table catalog_admin.staged_places add constraint staged_places_v2_shape_check check (
 schema_version <> '2.0.0' or (latitude between -90 and 90 and longitude between -180 and 180
 and char_length(btrim(name)) > 0 and char_length(btrim(address)) > 0
 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 1 and 80
 and catalog_admin.valid_public_naver_url(naver_place_url) and data_mode = 'production')
);
alter table catalog_admin.staged_menus add constraint staged_menus_v2_shape_check check (
 schema_version <> '2.0.0' or (data_mode = 'production' and char_length(btrim(name)) > 0 and display_order >= 0)
);


create function catalog_admin.naver_search_matches(value text, place_name text, place_address text)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
declare decoded_query text;
begin
 if value not like 'https://map.naver.com/p/search/%' then return true; end if;
 select convert_from(decode(string_agg(case when left(token[1],1) = '%'
  then substring(token[1] from 2) else encode(convert_to(token[1],'UTF8'),'hex') end,''),'hex'),'UTF8')
 into decoded_query from regexp_matches(substring(value from char_length('https://map.naver.com/p/search/') + 1),'(%[0-9A-Fa-f]{2}|[^%])','g') token;
 return decoded_query = place_name || ' ' || place_address and decoded_query !~ '[[:cntrl:]]'
  and decoded_query = btrim(decoded_query);
exception when others then return false;
end; $$;
revoke all on function catalog_admin.naver_search_matches(text,text,text) from public,anon,authenticated;
grant execute on function catalog_admin.naver_search_matches(text,text,text) to service_role;
alter table public.places add constraint places_v2_search_identity_check check (
 schema_version <> '2.0.0' or catalog_admin.naver_search_matches(naver_place_url,name,address)
);
alter table catalog_admin.staged_places add constraint staged_places_v2_search_identity_check check (
 schema_version <> '2.0.0' or catalog_admin.naver_search_matches(naver_place_url,name,address)
);

alter table public.catalog_state add column schema_version text not null default '1.0.0' check (schema_version in ('1.0.0','2.0.0'));
alter table catalog_admin.import_batches add column review_approval_sha256 text check (review_approval_sha256 ~ '^[a-f0-9]{64}$');
create or replace function catalog_admin.promote_catalog_batch(
  p_batch_id uuid,
  p_catalog_version text,
  p_manifest_hash text,
  p_place_count integer,
  p_menu_count integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch catalog_admin.import_batches%rowtype;
  actual_place_count integer;
  actual_menu_count integer;
  actual_hash text;
begin
  select * into strict batch
  from catalog_admin.import_batches
  where id = p_batch_id
  for update;

  if batch.status = 'promoted' then
    if batch.catalog_version = p_catalog_version
      and batch.manifest_hash = p_manifest_hash
      and batch.manifest_place_count = p_place_count
      and batch.manifest_menu_count = p_menu_count
      and exists (
        select 1 from catalog_admin.catalog_versions as version
        where version.catalog_version = batch.catalog_version
          and version.data_mode = batch.data_mode
          and version.manifest_place_count = batch.manifest_place_count
          and version.manifest_menu_count = batch.manifest_menu_count
          and version.manifest_hash = batch.manifest_hash
      )
      and (select count(*) from catalog_admin.catalog_place_memberships
        where catalog_version = batch.catalog_version) = batch.manifest_place_count
      and (select count(*) from catalog_admin.catalog_menu_memberships
        where catalog_version = batch.catalog_version) = batch.manifest_menu_count then
      return jsonb_build_object('catalogVersion', batch.catalog_version, 'status', 'promoted');
    end if;
    raise exception using message = 'promoted batch manifest mismatch';
  end if;

  select count(*) into actual_place_count from catalog_admin.staged_places where batch_id = batch.id;
  select count(*) into actual_menu_count from catalog_admin.staged_menus where batch_id = batch.id;
  actual_hash := catalog_admin.compute_batch_manifest_hash(batch.id);

  if actual_place_count < 100 or p_place_count < 100 then
    raise exception using message = 'at least one hundred verified places are required';
  end if;

  if batch.data_mode <> 'production'
    or batch.catalog_version <> p_catalog_version
    or batch.manifest_hash <> p_manifest_hash
    or batch.manifest_place_count <> p_place_count
    or batch.manifest_menu_count <> p_menu_count
    or actual_place_count <> p_place_count
    or actual_menu_count <> p_menu_count
    or actual_hash <> p_manifest_hash then
    raise exception using message = 'catalog manifest mismatch';
  end if;

  if exists (select 1 from catalog_admin.staged_places where batch_id = batch.id and schema_version <> coalesce(batch.schema_version, '1.0.0'))
    or exists (select 1 from catalog_admin.staged_menus where batch_id = batch.id and schema_version <> coalesce(batch.schema_version, '1.0.0')) then
    raise exception 'mixed catalog schema versions';
  end if;

  if exists (
    select 1 from catalog_admin.staged_places where batch_id = batch.id
    group by id having count(*) > 1
  ) or exists (
    select 1 from catalog_admin.staged_menus where batch_id = batch.id
    group by id having count(*) > 1
  ) or exists (
    select 1 from catalog_admin.staged_places where batch_id = batch.id
    group by slug having count(*) > 1
  ) then
    raise exception using message = 'duplicate catalog IDs or slugs';
  end if;

  if exists (
    select 1
    from catalog_admin.staged_places as staged
    join public.places as current on current.slug = staged.slug and current.id <> staged.id
    where staged.batch_id = batch.id
  ) then
    raise exception using message = 'catalog slug conflicts with an existing place';
  end if;

  if exists (
    select 1 from catalog_admin.staged_places as place
    where place.batch_id = batch.id and (
      place.data_mode <> 'production'
      or place.latitude not between -90 and 90
      or place.longitude not between -180 and 180
      or place.slug <> lower(place.slug)
      or place.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or cardinality(place.health_tags) = 0
      or array_position(place.health_tags, null) is not null
      or not (place.primary_tag = any(place.health_tags))
      or (place.schema_version = '1.0.0' and place.naver_place_url !~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$')
      or strpos(split_part(split_part(place.naver_place_url, '://', 2), '/', 1), '@') > 0
    )
  ) then
    raise exception using message = 'invalid staged place';
  end if;

  if exists (
    select 1 from catalog_admin.staged_menus as menu
    where menu.batch_id = batch.id and (
      menu.data_mode <> 'production'
      or menu.display_order < 0
      or cardinality(menu.health_tags) = 0
      or array_position(menu.health_tags, null) is not null
      or menu.valid_until <= menu.verified_at
      or menu.valid_until < current_date
      or menu.verified_at > current_date
      or (
        menu.verification_method = 'direct_confirmation'
        and menu.valid_until > menu.verified_at + 90
      )
      or (
        menu.verification_method in ('official_menu', 'merchant_submission', 'government_exact')
        and menu.valid_until > menu.verified_at + 180
      )
      or (
        menu.verification_method in ('official_menu', 'merchant_submission', 'government_exact')
        and (
          menu.evidence_url is null
          or menu.evidence_url !~ '^https://[^[:space:]]+$'
          or menu.evidence_url ~ '^https://example[.]invalid/'
          or strpos(split_part(split_part(menu.evidence_url, '://', 2), '/', 1), '@') > 0
        )
      )
      or (menu.verification_method = 'direct_confirmation' and menu.evidence_url is not null)
    )
  ) then
    raise exception using message = 'invalid staged menu';
  end if;

  if exists (
    select 1 from catalog_admin.staged_menus as menu
    left join catalog_admin.staged_places as place
      on place.batch_id = menu.batch_id and place.id = menu.place_id
    where menu.batch_id = batch.id and place.id is null
  ) or exists (
    select 1 from catalog_admin.staged_places as place
    left join catalog_admin.staged_menus as menu
      on menu.batch_id = place.batch_id and menu.place_id = place.id
    where place.batch_id = batch.id and menu.id is null
  ) then
    raise exception using message = 'orphan menu or place without a menu';
  end if;

  if exists (
    select 1 from catalog_admin.staged_places as place
    where place.batch_id = batch.id and place.schema_version = '1.0.0' and (
      (select array_agg(distinct tag order by tag)
       from catalog_admin.staged_menus as menu, unnest(menu.health_tags) as tag
       where menu.batch_id = place.batch_id and menu.place_id = place.id)
      is distinct from
      (select array_agg(distinct tag order by tag) from unnest(place.health_tags) as tag)
      or not exists (
        select 1 from catalog_admin.staged_menus as menu
        where menu.batch_id = place.batch_id and menu.place_id = place.id
          and place.primary_tag = any(menu.health_tags)
      )
    )
  ) then
    raise exception using message = 'place tags must exactly represent current menus';
  end if;

  if batch.sample_population_count <> actual_place_count
    or batch.sample_reviewed_count <> ceiling(actual_place_count::numeric / 5)::integer then
    raise exception using message = 'deterministic twenty percent place sample is required';
  end if;

  if (select count(*) from catalog_admin.place_approvals where batch_id = batch.id)
      <> actual_place_count
    or exists (
      select 1 from catalog_admin.staged_places as place
      left join catalog_admin.place_approvals as approval
        on approval.batch_id = place.batch_id and approval.place_id = place.id
      where place.batch_id = batch.id
        and (approval.place_id is null or approval.decision <> 'approved')
    ) then
    raise exception using message = 'every staged place requires private human approval';
  end if;

  if (select count(*) from catalog_admin.place_rechecks where batch_id = batch.id)
      <> batch.sample_reviewed_count
    or exists (
      with expected as (
        select ranked.id, ranked.selection_rank, ranked.selection_key
        from (
          select place.id,
            row_number() over (order by encode(
              extensions.digest(convert_to(batch.catalog_version || ':' || place.id::text, 'UTF8'), 'sha256'),
              'hex'
            ), place.id) as selection_rank,
            encode(
              extensions.digest(convert_to(batch.catalog_version || ':' || place.id::text, 'UTF8'), 'sha256'),
              'hex'
            ) as selection_key
          from catalog_admin.staged_places as place
          where place.batch_id = batch.id
          order by place.id
        ) as ranked
        where ranked.selection_rank <= batch.sample_reviewed_count
      )
      select 1 from expected
      left join catalog_admin.place_rechecks as recheck
        on recheck.batch_id = batch.id and recheck.place_id = expected.id
      left join catalog_admin.place_approvals as approval
        on approval.batch_id = batch.id and approval.place_id = expected.id
      where recheck.place_id is null
        or recheck.selection_rank <> expected.selection_rank
        or recheck.selection_key <> expected.selection_key
        or recheck.decision <> 'approved'
        or recheck.reviewer = approval.reviewer
    ) then
    raise exception using message = 'independent deterministic place rechecks are incomplete or failed';
  end if;

  insert into public.places (
    id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, published, data_mode, schema_version, v2_details
  )
  select id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, true, data_mode, schema_version, v2_details
  from catalog_admin.staged_places where batch_id = batch.id
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, address = excluded.address,
    latitude = excluded.latitude, longitude = excluded.longitude,
    naver_place_url = excluded.naver_place_url, primary_tag = excluded.primary_tag,
    health_tags = excluded.health_tags, published = true, data_mode = excluded.data_mode,
    schema_version = excluded.schema_version, v2_details = excluded.v2_details;

  insert into public.menus (
    id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, published, data_mode, schema_version, v2_details
  )
  select id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, true, data_mode, schema_version, v2_details
  from catalog_admin.staged_menus where batch_id = batch.id
  on conflict (id) do update set
    place_id = excluded.place_id, name = excluded.name, health_tags = excluded.health_tags,
    evidence_url = excluded.evidence_url, verification_method = excluded.verification_method,
    verified_at = excluded.verified_at, valid_until = excluded.valid_until,
    display_order = excluded.display_order, published = true, data_mode = excluded.data_mode,
    schema_version = excluded.schema_version, v2_details = excluded.v2_details;

  insert into catalog_admin.catalog_versions (
    catalog_version, data_mode, manifest_place_count, manifest_menu_count,
    manifest_hash, promoted_at
  ) values (
    batch.catalog_version, batch.data_mode, actual_place_count, actual_menu_count,
    actual_hash, now()
  );

  insert into catalog_admin.catalog_place_memberships (catalog_version, place_id)
  select batch.catalog_version, place.id
  from catalog_admin.staged_places as place
  where place.batch_id = batch.id;

  insert into catalog_admin.catalog_menu_memberships (catalog_version, menu_id)
  select batch.catalog_version, menu.id
  from catalog_admin.staged_menus as menu
  where menu.batch_id = batch.id;

  if (select count(*) from catalog_admin.catalog_place_memberships
      where catalog_version = batch.catalog_version) <> actual_place_count
    or (select count(*) from catalog_admin.catalog_menu_memberships
      where catalog_version = batch.catalog_version) <> actual_menu_count then
    raise exception using message = 'catalog membership mismatch';
  end if;

  update public.catalog_state set
    catalog_version = batch.catalog_version, data_mode = batch.data_mode, promoted_at = now(),
    schema_version = coalesce(batch.schema_version, '1.0.0')
  where singleton;
  update catalog_admin.import_batches set status = 'promoted', promoted_at = now()
  where id = batch.id;

  return jsonb_build_object('catalogVersion', batch.catalog_version, 'status', 'promoted');
end;
$$;

create or replace function catalog_admin.promote_catalog_bundle(
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
  if schema_version is null or schema_version not in ('1.0.0', '2.0.0')
    or catalog_version is null or char_length(btrim(catalog_version)) not between 1 and 120
    or manifest_hash is null or manifest_hash !~ '^[a-f0-9]{64}$'
    or place_count is null or menu_count is null or dry_run is null or places_jsonl is null or menus_jsonl is null
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
      primary_tag, health_tags, data_mode, raw_provenance, source_hash, schema_version, v2_details
    )
    select batch_id, (row->>'id')::uuid, row->>'slug', row->>'name', row->>'address',
      (row->>'latitude')::double precision, (row->>'longitude')::double precision,
      row->>'naverPlaceUrl', (row->>'primaryTag')::public.health_tag,
      case when schema_version = '1.0.0' then array(select jsonb_array_elements_text(row->'healthTags'))::public.health_tag[] else null end,
      row->>'dataMode', jsonb_build_object(
        'schemaVersion', schema_version, 'catalogVersion', catalog_version
      ), manifest_hash, schema_version,
      case when schema_version = '2.0.0' then jsonb_build_object('phone', row->'phone', 'brandId', row->'brandId', 'brandVariant', row->'brandVariant', 'media', row->'media') else null end
    from (
      select line::jsonb as row
      from regexp_split_to_table(trim(trailing E'\n' from places_jsonl), E'\n') as line
      where char_length(line) > 0
    ) as records
    where (select array_agg(key order by key) from jsonb_object_keys(row) as key) = case when schema_version = '2.0.0' then array['address','brandId','brandVariant','dataMode','id','latitude','longitude','media','name','naverPlaceUrl','phone','published','schemaVersion','slug'] else array[
      'address', 'dataMode', 'healthTags', 'id', 'latitude', 'longitude', 'name',
      'naverPlaceUrl', 'primaryTag', 'published', 'slug'
    ] end
      and (schema_version = '1.0.0' or row->>'schemaVersion' = schema_version)
      and row->>'dataMode' = 'production'
      and row->'published' = 'true'::jsonb
      and not exists (select 1 from jsonb_each(row) f where f.key in ('id','placeId','name','slug','address','naverPlaceUrl','verificationMethod','verifiedAt','validUntil') and jsonb_typeof(f.value) <> 'string')
      and not exists (select 1 from jsonb_each(row) f where f.key in ('latitude','longitude','displayOrder') and jsonb_typeof(f.value) <> 'number');

    insert into catalog_admin.staged_menus (
      batch_id, id, place_id, name, health_tags, evidence_url, verification_method,
      verified_at, valid_until, display_order, data_mode, raw_provenance, source_hash, schema_version, v2_details
    )
    select batch_id, (row->>'id')::uuid, (row->>'placeId')::uuid, row->>'name',
      case when schema_version = '1.0.0' then array(select jsonb_array_elements_text(row->'healthTags'))::public.health_tag[] else null end,
      row->>'evidenceUrl', (row->>'verificationMethod')::public.verification_method,
      (row->>'verifiedAt')::date, (row->>'validUntil')::date,
      (row->>'displayOrder')::integer, row->>'dataMode', jsonb_build_object(
        'schemaVersion', schema_version, 'catalogVersion', catalog_version
      ), manifest_hash, schema_version,
      case when schema_version = '2.0.0' then jsonb_build_object('facts', row->'facts', 'branchApplicability', row->'branchApplicability', 'brandId', row->'brandId', 'brandVariant', row->'brandVariant') else null end
    from (
      select line::jsonb as row
      from regexp_split_to_table(trim(trailing E'\n' from menus_jsonl), E'\n') as line
      where char_length(line) > 0
    ) as records
    where (select array_agg(key order by key) from jsonb_object_keys(row) as key) = case when schema_version = '2.0.0' then array['branchApplicability','brandId','brandVariant','dataMode','displayOrder','evidenceUrl','facts','id','name','placeId','published','schemaVersion','validUntil','verificationMethod','verifiedAt'] else array[
      'dataMode', 'displayOrder', 'evidenceUrl', 'healthTags', 'id', 'name', 'placeId',
      'published', 'validUntil', 'verificationMethod', 'verifiedAt'
    ] end
      and (schema_version = '1.0.0' or row->>'schemaVersion' = schema_version)
      and row->>'dataMode' = 'production'
      and row->'published' = 'true'::jsonb
      and not exists (select 1 from jsonb_each(row) f where f.key in ('id','placeId','name','slug','address','naverPlaceUrl','verificationMethod','verifiedAt','validUntil') and jsonb_typeof(f.value) <> 'string')
      and not exists (select 1 from jsonb_each(row) f where f.key in ('latitude','longitude','displayOrder') and jsonb_typeof(f.value) <> 'number');

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

grant catalog_reader to postgres;
create or replace function catalog_api.read_current_catalog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'catalogVersion', state.catalog_version,
    'dataMode', state.data_mode,
    'places', coalesce((
      select jsonb_agg((jsonb_build_object(
        'id', place.id, 'slug', place.slug, 'name', place.name,
        'address', place.address, 'latitude', place.latitude, 'longitude', place.longitude,
        'naverPlaceUrl', place.naver_place_url, 'primaryTag', place.primary_tag,
        'healthTags', place.health_tags, 'published', place.published,
        'dataMode', place.data_mode
      ) - case when place.schema_version = '2.0.0' then array['primaryTag','healthTags'] else array[]::text[] end || case when place.schema_version = '2.0.0' then place.v2_details || jsonb_build_object('schemaVersion','2.0.0') else '{}'::jsonb end) order by place.id)
      from catalog_admin.catalog_place_memberships as membership
      join public.places as place on place.id = membership.place_id
      where membership.catalog_version = state.catalog_version
        and place.published and place.data_mode = 'production'
        and exists (
          select 1
          from catalog_admin.catalog_menu_memberships as menu_membership
          join public.menus as current_menu on current_menu.id = menu_membership.menu_id
          where menu_membership.catalog_version = state.catalog_version
            and current_menu.place_id = place.id
            and current_menu.published and current_menu.data_mode = 'production'
            and current_menu.verified_at <= current_date and current_menu.valid_until >= current_date
        )
    ), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg((jsonb_build_object(
        'id', menu.id, 'placeId', menu.place_id, 'name', menu.name,
        'healthTags', menu.health_tags, 'evidenceUrl', menu.evidence_url,
        'verificationMethod', menu.verification_method,
        'verifiedAt', to_char(menu.verified_at, 'YYYY-MM-DD'),
        'validUntil', to_char(menu.valid_until, 'YYYY-MM-DD'),
        'displayOrder', menu.display_order, 'published', menu.published,
        'dataMode', menu.data_mode
      ) - case when menu.schema_version = '2.0.0' then array['healthTags'] else array[]::text[] end || case when menu.schema_version = '2.0.0' then menu.v2_details || jsonb_build_object('schemaVersion','2.0.0') else '{}'::jsonb end) order by menu.place_id, menu.display_order, menu.id)
      from catalog_admin.catalog_menu_memberships as membership
      join public.menus as menu on menu.id = membership.menu_id
      join catalog_admin.catalog_place_memberships as place_membership
        on place_membership.catalog_version = membership.catalog_version
        and place_membership.place_id = menu.place_id
      where membership.catalog_version = state.catalog_version
        and menu.published and menu.data_mode = 'production'
        and menu.verified_at <= current_date and menu.valid_until >= current_date
    ), '[]'::jsonb)
  ) || case when state.schema_version = '2.0.0' then jsonb_build_object('schemaVersion','2.0.0') else '{}'::jsonb end
  from public.catalog_state as state
  where state.singleton;
$$;


revoke catalog_reader from postgres;

-- Keep the existing ordered primary/recheck and replay validation on both transport versions.
alter function public.promote_catalog_bundle(text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,text,text,timestamptz,boolean) rename to promote_catalog_bundle_checked;
alter function public.promote_catalog_bundle_checked(text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,text,text,timestamptz,boolean) set schema catalog_admin;
create or replace function catalog_admin.promote_catalog_bundle_checked(
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
  where batch.id = promote_catalog_bundle_checked.batch_id;

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
    where approval.batch_id = promote_catalog_bundle_checked.batch_id;

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
    where recheck.batch_id = promote_catalog_bundle_checked.batch_id;

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


create function public.promote_catalog_bundle(
 schema_version text, catalog_version text, batch_id uuid, manifest_hash text, place_count integer,
 menu_count integer, places_jsonl text, menus_jsonl text, approvals jsonb, rechecks jsonb,
 source_license text, reviewer text, approved_at timestamptz, dry_run boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
 if schema_version is distinct from '1.0.0' then raise exception 'v2 requires complete approval artifact binding'; end if;
 return catalog_admin.promote_catalog_bundle_checked(schema_version,catalog_version,batch_id,manifest_hash,
 place_count,menu_count,places_jsonl,menus_jsonl,approvals,rechecks,source_license,reviewer,approved_at,dry_run);
end; $$;
revoke all on function public.promote_catalog_bundle(text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.promote_catalog_bundle(text,text,uuid,text,integer,integer,text,text,jsonb,jsonb,text,text,timestamptz,boolean) to service_role;

create function public.promote_catalog_bundle(
 schema_version text, catalog_version text, batch_id uuid, manifest_hash text, place_count integer,
 menu_count integer, places_jsonl text, menus_jsonl text, review_approval_json text,
 review_approval_sha256 text, approvals jsonb, rechecks jsonb, source_license text,
 reviewer text, approved_at timestamptz, dry_run boolean
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare artifact jsonb; decisions jsonb; incoming jsonb; previous_hash text; result jsonb; field text;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(batch_id::text,0));
 if review_approval_json is null or review_approval_sha256 is null
  or review_approval_sha256 !~ '^[a-f0-9]{64}$'
  or encode(extensions.digest(convert_to(review_approval_json,'UTF8'),'sha256'),'hex') <> review_approval_sha256
  then raise exception 'complete approval artifact hash mismatch'; end if;
 artifact := review_approval_json::jsonb;
 if schema_version = '2.0.0' and (
  artifact->>'public_places_sha256' is distinct from encode(extensions.digest(convert_to(places_jsonl,'UTF8'),'sha256'),'hex')
  or artifact->>'public_menus_sha256' is distinct from encode(extensions.digest(convert_to(menus_jsonl,'UTF8'),'sha256'),'hex'))
  then raise exception 'approval artifact public transport binding mismatch'; end if;
 if jsonb_typeof(artifact) is distinct from 'object' then raise exception 'invalid approval artifact'; end if;
 if (select array_agg(key order by key) from jsonb_object_keys(artifact - 'public_places_sha256' - 'public_menus_sha256') key) is distinct from
  array['approved_health_tags','batch_id','catalog_version','independent_results','independent_reviewer','independent_sample_ids','menus_sha256','places_sha256','primary_decisions','reviewed_at','reviewer','source_sha256s']
  or artifact->>'batch_id' is distinct from batch_id::text
  or artifact->>'catalog_version' is distinct from catalog_version
  or artifact->>'reviewer' is distinct from reviewer
  or (artifact->>'reviewed_at')::timestamptz is distinct from approved_at
  or artifact->>'places_sha256' is null or artifact->>'places_sha256' !~ '^[a-f0-9]{64}$'
  or artifact->>'menus_sha256' is null or artifact->>'menus_sha256' !~ '^[a-f0-9]{64}$'
  or jsonb_typeof(artifact->'source_sha256s') is distinct from 'array'
  or (schema_version = '2.0.0' and artifact->'approved_health_tags' is distinct from '[]'::jsonb)
  then raise exception 'approval artifact identity mismatch'; end if;
 if exists (select 1 from jsonb_array_elements_text(artifact->'source_sha256s') hash where hash !~ '^[a-f0-9]{64}$')
  then raise exception 'approval source hashes invalid'; end if;
 foreach field in array array['primary_decisions','independent_results'] loop
  if jsonb_typeof(artifact->field) is distinct from 'array' then raise exception 'approval decisions missing'; end if;
  if exists (select 1 from jsonb_array_elements(artifact->field) d where jsonb_typeof(d) <> 'object'
   or (select array_agg(key order by key) from jsonb_object_keys(d) key) is distinct from
      array['binding','evidence_reference','evidence_sha256','passed','place_id','reviewed_at','reviewer']
   or jsonb_typeof(d->'binding') is distinct from 'object'
   or (select array_agg(key order by key) from jsonb_object_keys(d->'binding') key) is distinct from
      array['approved_health_tags','menus_sha256','place_sha256','source_sha256s']
   or d->'passed' is distinct from 'true'::jsonb
   or d->'binding'->>'place_sha256' is null or d->'binding'->>'place_sha256' !~ '^[a-f0-9]{64}$'
   or d->'binding'->>'menus_sha256' is null or d->'binding'->>'menus_sha256' !~ '^[a-f0-9]{64}$'
   or jsonb_typeof(d->'binding'->'source_sha256s') is distinct from 'array'
   or (schema_version = '2.0.0' and d->'binding'->'approved_health_tags' is distinct from '[]'::jsonb))
   then raise exception 'approval decision binding invalid'; end if;
  select jsonb_agg(jsonb_build_object('placeId',(d->>'place_id')::uuid,'reviewer',d->>'reviewer',
   'reviewedAt',(d->>'reviewed_at')::timestamptz,'decision','approved','evidenceReference',d->>'evidence_reference',
   'evidenceHash',d->>'evidence_sha256') order by (d->>'place_id')::uuid) into decisions
   from jsonb_array_elements(artifact->field) d;
  select jsonb_agg(jsonb_build_object('placeId',(d->>'placeId')::uuid,'reviewer',d->>'reviewer',
   'reviewedAt',(d->>'reviewedAt')::timestamptz,'decision',d->>'decision','evidenceReference',d->>'evidenceReference',
   'evidenceHash',d->>'evidenceHash') order by (d->>'placeId')::uuid) into incoming
   from jsonb_array_elements(case when field = 'primary_decisions' then approvals else rechecks end) d;
  if decisions is distinct from incoming then raise exception 'approval artifact decisions differ from RPC decisions'; end if;
 end loop;
 if artifact->'independent_sample_ids' is distinct from
  (select jsonb_agg(d->'placeId' order by (d->>'selectionRank')::integer) from jsonb_array_elements(rechecks) d)
  or exists (select 1 from jsonb_array_elements(artifact->'independent_results') r
   left join jsonb_array_elements(artifact->'primary_decisions') p on p->>'place_id' = r->>'place_id'
   where r->>'reviewer' is distinct from artifact->>'independent_reviewer'
    or r->'binding' is distinct from p->'binding')
  then raise exception 'independent artifact binding mismatch'; end if;
 select b.review_approval_sha256 into previous_hash from catalog_admin.import_batches b where b.id = batch_id and b.status = 'promoted';
 if found and previous_hash is distinct from review_approval_sha256 then raise exception 'approval artifact replay mismatch'; end if;
 result := catalog_admin.promote_catalog_bundle_checked(schema_version,catalog_version,batch_id,manifest_hash,
  place_count,menu_count,places_jsonl,menus_jsonl,approvals,rechecks,source_license,reviewer,approved_at,dry_run);
 if not dry_run then update catalog_admin.import_batches b set review_approval_sha256 = promote_catalog_bundle.review_approval_sha256 where b.id = batch_id; end if;
 return result;
end; $$;
revoke all on function public.promote_catalog_bundle(text,text,uuid,text,integer,integer,text,text,text,text,jsonb,jsonb,text,text,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.promote_catalog_bundle(text,text,uuid,text,integer,integer,text,text,text,text,jsonb,jsonb,text,text,timestamptz,boolean) to service_role;
