create extension if not exists pg_trgm with schema extensions;

do $$
declare
  reader_oid oid;
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'discovery_reader') then
    create role discovery_reader nologin noinherit nosuperuser nocreatedb nocreaterole
      noreplication nobypassrls;
  end if;
  select oid into reader_oid from pg_catalog.pg_roles where rolname = 'discovery_reader';
  if exists (
    select 1 from pg_catalog.pg_roles
    where oid = reader_oid and (rolcanlogin or rolinherit or rolsuper or rolcreatedb
      or rolcreaterole or rolreplication or rolbypassrls)
  ) or exists (
    select 1 from pg_catalog.pg_auth_members
    where member = reader_oid
  ) or exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
    where membership.roleid = reader_oid and not (
      member_role.rolname = current_user and membership.admin_option
      and not membership.inherit_option and not membership.set_option
    )
  ) then
    raise exception using errcode = '42501',
      message = 'preexisting discovery_reader is not an isolated least-privilege role';
  end if;
end
$$;

create schema discovery_admin;
revoke all on schema discovery_admin from public, anon, authenticated;

create table discovery_admin.releases (
  release_id text primary key check (char_length(release_id) between 1 and 160),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  projection_digest text not null check (projection_digest ~ '^[a-f0-9]{64}$'),
  source_record_count integer not null check (source_record_count >= 0),
  place_count integer not null check (place_count >= 0),
  menu_count integer not null check (menu_count >= 0),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table discovery_admin.source_records (
  release_id text not null,
  record_kind text not null check (record_kind in ('place', 'menu', 'store')),
  id uuid not null,
  source_path text not null check (char_length(source_path) between 1 and 400),
  source_order integer not null check (source_order >= 0),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  valid_from timestamptz,
  valid_until timestamptz,
  primary key (release_id, record_kind, id),
  unique (release_id, id),
  unique (release_id, record_kind, source_path, source_order),
  foreign key (release_id) references discovery_admin.releases (release_id),
  check (
    (record_kind = 'menu' and valid_from is not null and valid_until is not null
      and valid_from < valid_until)
    or (record_kind <> 'menu' and valid_from is null and valid_until is null)
  )
);

create table discovery_admin.places (
  release_id text not null,
  id uuid not null,
  slug text not null,
  name text not null,
  brand_id text,
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  region text not null,
  phone text,
  naver_place_url text,
  media jsonb not null default '[]'::jsonb check (jsonb_typeof(media) = 'array'),
  listing_kind text not null check (listing_kind in ('menu_evidence', 'store_only')),
  source_record_kind text generated always as (
    case when listing_kind = 'store_only' then 'store' else 'place' end
  ) stored,
  store_description text,
  official_store_url text,
  searchable_text text not null,
  source_order integer not null check (source_order >= 0),
  row_sha256 text not null check (row_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (release_id, id),
  unique (release_id, slug),
  foreign key (release_id) references discovery_admin.releases (release_id),
  foreign key (release_id, source_record_kind, id)
    references discovery_admin.source_records (release_id, record_kind, id),
  check (
    (listing_kind = 'menu_evidence' and store_description is null and official_store_url is null)
    or (listing_kind = 'store_only' and store_description is not null
      and official_store_url is not null)
  )
);

create table discovery_admin.menus (
  release_id text not null,
  id uuid not null,
  source_record_kind text generated always as ('menu') stored,
  place_id uuid not null,
  name text not null,
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  branch_applicability text not null
    check (branch_applicability in ('branch_confirmed', 'brand_common_unverified')),
  applicability_notice text,
  selection_eligible boolean not null,
  discovery_tags text[] not null default '{}',
  ingredients text[] not null default '{}',
  searchable_text text not null,
  source_order integer not null check (source_order >= 0),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  row_sha256 text not null check (row_sha256 ~ '^[a-f0-9]{64}$'),
  primary key (release_id, id),
  foreign key (release_id, place_id) references discovery_admin.places (release_id, id),
  foreign key (release_id, source_record_kind, id)
    references discovery_admin.source_records (release_id, record_kind, id),
  check (valid_from < valid_until),
  check (
    (branch_applicability = 'brand_common_unverified' and applicability_notice is not null)
    or (branch_applicability = 'branch_confirmed' and applicability_notice is null)
  )
);

create table discovery_admin.state (
  singleton boolean primary key default true check (singleton),
  release_id text not null unique references discovery_admin.releases (release_id),
  activated_at timestamptz not null default pg_catalog.clock_timestamp()
);

alter table discovery_admin.releases enable row level security;
alter table discovery_admin.source_records enable row level security;
alter table discovery_admin.places enable row level security;
alter table discovery_admin.menus enable row level security;
alter table discovery_admin.state enable row level security;
revoke all on all tables in schema discovery_admin from public, anon, authenticated;

create policy "discovery reader can read safe places"
  on discovery_admin.places for select to discovery_reader using (true);
create policy "discovery reader can read safe menus"
  on discovery_admin.menus for select to discovery_reader using (true);
create policy "discovery reader can read active state"
  on discovery_admin.state for select to discovery_reader using (singleton);

create index discovery_source_records_release_idx
  on discovery_admin.source_records (release_id, record_kind, id);
create index discovery_places_region_idx on discovery_admin.places (release_id, region, id);
create index discovery_places_coordinates_idx
  on discovery_admin.places (release_id, latitude, longitude, id);
create index discovery_places_search_trgm_idx
  on discovery_admin.places using gin (searchable_text extensions.gin_trgm_ops);
create index discovery_menus_place_idx
  on discovery_admin.menus (release_id, place_id, source_order, id);
create index discovery_menus_validity_idx
  on discovery_admin.menus (release_id, valid_from, valid_until, id);
create index discovery_menus_tags_idx on discovery_admin.menus using gin (discovery_tags);
create index discovery_menus_ingredients_idx on discovery_admin.menus using gin (ingredients);
create index discovery_menus_search_trgm_idx
  on discovery_admin.menus using gin (searchable_text extensions.gin_trgm_ops);

create function discovery_admin.reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'discovery release rows are immutable';
end
$$;

create trigger discovery_releases_immutable before update or delete on discovery_admin.releases
for each row execute function discovery_admin.reject_immutable_change();
create trigger discovery_sources_immutable before update or delete on discovery_admin.source_records
for each row execute function discovery_admin.reject_immutable_change();
create trigger discovery_places_immutable before update or delete on discovery_admin.places
for each row execute function discovery_admin.reject_immutable_change();
create trigger discovery_menus_immutable before update or delete on discovery_admin.menus
for each row execute function discovery_admin.reject_immutable_change();

create function discovery_admin.state_at(p_now timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
  with active as (
    select state.release_id
    from discovery_admin.state as state
    where state.singleton
  ), current_menus as (
    select menu.id
    from active
    join discovery_admin.menus as menu on menu.release_id = active.release_id
    where menu.valid_from <= p_now and menu.valid_until > p_now
  ), boundary as (
    select min(candidate) as next_boundary
    from active
    join discovery_admin.menus as menu on menu.release_id = active.release_id
    cross join lateral (
      values (case when menu.valid_from > p_now then menu.valid_from end),
        (case when menu.valid_until > p_now then menu.valid_until end)
    ) as boundaries(candidate)
    where candidate is not null
  )
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1',
    'releaseId', active.release_id,
    'eligibleEpoch', encode(extensions.digest(convert_to(
      active.release_id || ':' || coalesce((
        select string_agg(current_menus.id::text, ',' order by current_menus.id)
        from current_menus
      ), ''), 'UTF8'), 'sha256'), 'hex'),
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', case when boundary.next_boundary is null then null else
      to_char(boundary.next_boundary at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
  )
  from active cross join boundary
  union all
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1', 'releaseId', null,
    'eligibleEpoch', encode(extensions.digest(convert_to('empty', 'UTF8'), 'sha256'), 'hex'),
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', null
  )
  where not exists (select 1 from active)
  limit 1
$$;

create function discovery_admin.place_dto(p jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p->'id', 'slug', p->'slug', 'name', p->'name', 'brandId', p->'brand_id',
    'address', p->'address', 'latitude', p->'latitude', 'longitude', p->'longitude',
    'region', p->'region', 'phone', p->'phone', 'naverPlaceUrl', p->'naver_place_url',
    'media', p->'media', 'listingKind', p->'listing_kind',
    'storeDescription', p->'store_description', 'officialStoreUrl', p->'official_store_url'
  )
$$;

create function discovery_admin.menu_dto(m jsonb)
returns jsonb
language sql
immutable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m->'id', 'placeId', m->'place_id', 'name', m->'name', 'facts', m->'facts',
    'branchApplicability', m->'branch_applicability',
    'applicabilityNotice', m->'applicability_notice'
  )
$$;

create function discovery_admin.matching_at(
  p_release text,
  p_now timestamptz,
  p_query text,
  p_filter text,
  p_ingredient text,
  p_region text,
  p_has_bounds boolean,
  p_south double precision,
  p_north double precision,
  p_west double precision,
  p_east double precision
)
returns table (
  place jsonb,
  id uuid,
  latitude double precision,
  longitude double precision,
  region text,
  listing_kind text,
  matching_menu_ids uuid[],
  relevance integer
)
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
  with tokens as (
    select token from unnest(string_to_array(p_query, ' ')) as token where token <> ''
  ), eligible_menus as (
    select menu.release_id, menu.id, menu.place_id, menu.searchable_text
    from discovery_admin.menus as menu
    where menu.release_id = p_release and menu.selection_eligible
      and menu.valid_from <= p_now and menu.valid_until > p_now
      and (p_filter = 'all' or p_filter = any(menu.discovery_tags))
      and (p_ingredient = 'all' or p_ingredient = any(menu.ingredients))
      and not exists (select 1 from tokens where position(token in menu.searchable_text) = 0)
  ), menu_places as (
    select place.id, place.slug, place.name, place.brand_id, place.address,
      place.latitude, place.longitude, place.region, place.phone, place.naver_place_url,
      place.media, place.listing_kind, place.store_description, place.official_store_url,
      array_agg(menu.id order by menu.id) as menu_ids,
      case when p_query = '' then 0
        when place.searchable_text = p_query then 0
        when position(p_query in place.searchable_text) > 0 then 1
        when bool_or(position(p_query in menu.searchable_text) > 0) then 2 else 3 end as rank
    from discovery_admin.places as place
    join eligible_menus as menu on menu.release_id = place.release_id and menu.place_id = place.id
    where place.release_id = p_release and place.listing_kind = 'menu_evidence'
      and (p_region is null or place.region = p_region)
      and (not p_has_bounds or (place.latitude between p_south and p_north
        and place.longitude between p_west and p_east))
    group by place.release_id, place.id
  ), stores as (
    select place.id, place.slug, place.name, place.brand_id, place.address,
      place.latitude, place.longitude, place.region, place.phone, place.naver_place_url,
      place.media, place.listing_kind, place.store_description, place.official_store_url,
      '{}'::uuid[] as menu_ids,
      case when p_query = '' then 0 when place.searchable_text = p_query then 0
        when position(p_query in place.searchable_text) > 0 then 1 else 3 end as rank
    from discovery_admin.places as place
    where place.release_id = p_release and place.listing_kind = 'store_only'
      and p_filter in ('all','salad_poke') and p_ingredient = 'all'
      and (p_region is null or place.region = p_region)
      and (not p_has_bounds or (place.latitude between p_south and p_north
        and place.longitude between p_west and p_east))
      and not exists (select 1 from tokens where position(token in place.searchable_text) = 0)
  ), matches as (
    select * from menu_places union all select * from stores
  )
  select discovery_admin.place_dto(jsonb_build_object(
      'id', match.id, 'slug', match.slug, 'name', match.name, 'brand_id', match.brand_id,
      'address', match.address, 'latitude', match.latitude, 'longitude', match.longitude,
      'region', match.region, 'phone', match.phone, 'naver_place_url', match.naver_place_url,
      'media', match.media, 'listing_kind', match.listing_kind,
      'store_description', match.store_description, 'official_store_url', match.official_store_url
    )), match.id, match.latitude, match.longitude, match.region, match.listing_kind,
    match.menu_ids, match.rank
  from matches as match
$$;

create function discovery_admin.query_at(p_request jsonb, p_now timestamptz)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
declare
  v_state jsonb := discovery_admin.state_at(p_now);
  v_release text := v_state->>'releaseId';
  v_epoch text := v_state->>'eligibleEpoch';
  v_mode text := coalesce(p_request->>'mode', 'places');
  v_query text := coalesce(p_request->>'query', '');
  v_filter text := coalesce(p_request->>'filter', 'all');
  v_ingredient text := coalesce(p_request->>'ingredient', 'all');
  v_region text := p_request->>'region';
  v_limit integer;
  v_offset integer := 0;
  v_cursor jsonb;
  v_has_bounds boolean;
  v_south double precision;
  v_north double precision;
  v_west double precision;
  v_east double precision;
  v_origin_lat double precision;
  v_origin_lon double precision;
  v_sort_basis text;
  v_fingerprint text;
  v_data jsonb;
  v_total integer;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or (p_request - array['expectedRelease','expectedEpoch','mode','query','filter','ingredient',
      'region','south','north','west','east','limit','cursor']) <> '{}'::jsonb
    or not (p_request ? 'expectedRelease') or not (p_request ? 'expectedEpoch')
    or char_length(p_request->>'expectedEpoch') <> 64
    or char_length(v_query) > 200
    or v_query <> regexp_replace(lower(btrim(v_query)), '[[:space:]]+', ' ', 'g')
    or v_mode not in ('places', 'regions')
    or v_filter not in ('all','salad_poke','grilled_steamed','whole_grain','plant_based','rice')
    or v_ingredient not in ('all','chicken','fish','tofu_soy')
    or (v_region is not null and char_length(btrim(v_region)) not between 1 and 80)
    or (p_request ? 'cursor' and (jsonb_typeof(p_request->'cursor') <> 'string'
      or char_length(p_request->>'cursor') not between 1 and 1000
      or p_request->>'cursor' !~ '^[A-Za-z0-9_-]+$')) then
    raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
  end if;
  begin
    v_limit := coalesce((p_request->>'limit')::integer, 50);
    v_south := (p_request->>'south')::double precision;
    v_north := (p_request->>'north')::double precision;
    v_west := (p_request->>'west')::double precision;
    v_east := (p_request->>'east')::double precision;
  exception when others then
    raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
  end;
  v_has_bounds := p_request ?& array['south','north','west','east'];
  if v_limit not between 1 and 100
    or (v_has_bounds <> ((p_request ? 'south') or (p_request ? 'north')
      or (p_request ? 'west') or (p_request ? 'east')))
    or (v_has_bounds and (v_south < -90 or v_north > 90 or v_west < -180 or v_east > 180
      or v_south > v_north or v_west > v_east))
    or (v_mode = 'regions' and p_request ? 'cursor') then
    raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
  end if;
  if (p_request->'expectedRelease') is distinct from to_jsonb(v_release)
    or p_request->>'expectedEpoch' is distinct from v_epoch then
    raise exception using errcode = 'PT409', message = '{"error":"stale_state","retry":true}';
  end if;

  if v_release is null then
    v_data := case when v_mode = 'regions' then
      jsonb_build_object('catalogVersion','empty','total',0,'regions','[]'::jsonb)
    else jsonb_build_object('catalogVersion','empty','sortBasis','catalog_center',
      'sortOrigin',null,'total',0,'results','[]'::jsonb,'nextCursor',null) end;
    return v_state || jsonb_build_object('data', v_data);
  end if;

  if v_mode = 'regions' then
    select jsonb_build_object(
      'catalogVersion', v_release,
      'total', coalesce(sum(region_count), 0),
      'regions', coalesce(jsonb_agg(jsonb_build_object(
        'id', region, 'label', region, 'count', region_count,
        'bounds', jsonb_build_object(
          'southWest', jsonb_build_object('latitude', min_lat, 'longitude', min_lon),
          'northEast', jsonb_build_object('latitude', max_lat, 'longitude', max_lon)
        )
      ) order by region), '[]'::jsonb)
    ) into v_data
    from (
      select region, count(*) as region_count, min(latitude) as min_lat,
        min(longitude) as min_lon, max(latitude) as max_lat, max(longitude) as max_lon
      from discovery_admin.matching_at(v_release,p_now,v_query,v_filter,v_ingredient,v_region,
        v_has_bounds,v_south,v_north,v_west,v_east) group by region
    ) as groups;
    return v_state || jsonb_build_object('data', v_data);
  end if;

  select count(*), (min(latitude) + max(latitude)) / 2, (min(longitude) + max(longitude)) / 2
  into v_total, v_origin_lat, v_origin_lon
  from discovery_admin.matching_at(v_release,p_now,v_query,v_filter,v_ingredient,v_region,
    v_has_bounds,v_south,v_north,v_west,v_east);
  if v_has_bounds then
    v_sort_basis := 'map_center'; v_origin_lat := (v_south + v_north) / 2;
    v_origin_lon := (v_west + v_east) / 2;
  elsif v_region is not null then v_sort_basis := 'region_center';
  else v_sort_basis := 'catalog_center';
  end if;
  v_fingerprint := encode(extensions.digest(convert_to(jsonb_build_array(
    'ordering-v2', v_query, v_filter, v_ingredient, v_region,
    v_south, v_north, v_west, v_east, v_sort_basis, v_origin_lat, v_origin_lon,
    v_release, v_epoch
  )::text, 'UTF8'), 'sha256'), 'hex');
  if p_request ? 'cursor' then
    begin
      v_cursor := convert_from(decode(translate(p_request->>'cursor','-_','+/') ||
        repeat('=', (4 - char_length(p_request->>'cursor') % 4) % 4), 'base64'), 'UTF8')::jsonb;
      if jsonb_typeof(v_cursor) <> 'object'
        or (v_cursor - array['release','epoch','fingerprint','offset']) <> '{}'::jsonb
        or v_cursor->>'release' is distinct from v_release
        or v_cursor->>'epoch' is distinct from v_epoch
        or v_cursor->>'fingerprint' is distinct from v_fingerprint then
        raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
      end if;
      v_offset := (v_cursor->>'offset')::integer;
      if v_offset < 0 or v_offset > v_total then
        raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
      end if;
    exception
      when sqlstate 'PT409' then raise;
      when others then
        raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
    end;
  end if;

  with ranked as (
    select match.*,
      case when v_origin_lat is null then 0 else 2 * 6371000 * asin(sqrt(
        power(sin(radians(match.latitude - v_origin_lat) / 2), 2) +
        cos(radians(v_origin_lat)) * cos(radians(match.latitude)) *
        power(sin(radians(match.longitude - v_origin_lon) / 2), 2)
      )) end as distance
    from discovery_admin.matching_at(v_release,p_now,v_query,v_filter,v_ingredient,v_region,
      v_has_bounds,v_south,v_north,v_west,v_east) as match
  ), page as (
    select * from ranked order by relevance, distance, id offset v_offset limit v_limit
  )
  select jsonb_build_object(
    'catalogVersion', v_release, 'sortBasis', v_sort_basis,
    'sortOrigin', case when v_origin_lat is null then null else
      jsonb_build_object('latitude',v_origin_lat,'longitude',v_origin_lon) end,
    'total', v_total,
    'results', coalesce(jsonb_agg(jsonb_build_object(
      'place', page.place,
      'matchingMenuIds', to_jsonb(page.matching_menu_ids),
      'menus', case when page.listing_kind = 'store_only' then '[]'::jsonb else coalesce((
        select jsonb_agg(discovery_admin.menu_dto(jsonb_build_object(
          'id',menu.id,'place_id',menu.place_id,'name',menu.name,'facts',menu.facts,
          'branch_applicability',menu.branch_applicability,
          'applicability_notice',menu.applicability_notice
        )) order by menu.id)
        from discovery_admin.menus as menu
        where menu.release_id = v_release and menu.id = any(page.matching_menu_ids)
      ), '[]'::jsonb) end
    ) order by page.relevance, page.distance, page.id), '[]'::jsonb),
    'nextCursor', case when v_offset + v_limit >= v_total then null else
      rtrim(translate(replace(encode(convert_to(jsonb_build_object(
        'release',v_release,'epoch',v_epoch,'fingerprint',v_fingerprint,
        'offset',v_offset + v_limit)::text,'UTF8'),'base64'), E'\n', ''),'+/','-_'), '=') end
  ) into v_data from page;
  return v_state || jsonb_build_object('data', v_data);
end
$$;

create function discovery_admin.detail_at(p_request jsonb, p_now timestamptz)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
declare
  v_state jsonb := discovery_admin.state_at(p_now);
  v_release text := v_state->>'releaseId';
  v_id uuid;
  v_data jsonb;
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object'
    or (p_request - array['expectedRelease','expectedEpoch','id']) <> '{}'::jsonb
    or not (p_request ?& array['expectedRelease','expectedEpoch','id']) then
    raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
  end if;
  begin v_id := (p_request->>'id')::uuid;
  exception when others then
    raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
  end;
  if (p_request->'expectedRelease') is distinct from to_jsonb(v_release)
    or p_request->>'expectedEpoch' is distinct from v_state->>'eligibleEpoch' then
    raise exception using errcode = 'PT409', message = '{"error":"stale_state","retry":true}';
  end if;
  select jsonb_build_object(
    'catalogVersion', v_release,
    'place', discovery_admin.place_dto(jsonb_build_object(
      'id',place.id,'slug',place.slug,'name',place.name,'brand_id',place.brand_id,
      'address',place.address,'latitude',place.latitude,'longitude',place.longitude,
      'region',place.region,'phone',place.phone,'naver_place_url',place.naver_place_url,
      'media',place.media,'listing_kind',place.listing_kind,
      'store_description',place.store_description,'official_store_url',place.official_store_url
    )),
    'menus', case when place.listing_kind = 'store_only' then '[]'::jsonb else coalesce((
      select jsonb_agg(discovery_admin.menu_dto(jsonb_build_object(
        'id',menu.id,'place_id',menu.place_id,'name',menu.name,'facts',menu.facts,
        'branch_applicability',menu.branch_applicability,
        'applicability_notice',menu.applicability_notice
      )) order by menu.source_order, menu.id)
      from discovery_admin.menus as menu
      where menu.release_id = v_release and menu.place_id = place.id
        and menu.selection_eligible and menu.valid_from <= p_now and menu.valid_until > p_now
    ), '[]'::jsonb) end
  ) into v_data
  from discovery_admin.places as place
  where place.release_id = v_release and place.id = v_id
    and (place.listing_kind = 'store_only' or exists (
      select 1 from discovery_admin.menus as menu
      where menu.release_id = v_release and menu.place_id = place.id
        and menu.selection_eligible and menu.valid_from <= p_now and menu.valid_until > p_now
    ));
  return v_state || jsonb_build_object('data', v_data);
end
$$;

create function public.get_discovery_state()
returns jsonb
language sql
volatile
security definer
set search_path = ''
set statement_timeout = '1500ms'
as $$ select discovery_admin.state_at(pg_catalog.clock_timestamp()) $$;

create function public.query_discovery(p_request jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
set statement_timeout = '1500ms'
as $$ select discovery_admin.query_at(p_request, pg_catalog.clock_timestamp()) $$;

create function public.get_discovery_place(p_request jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
set statement_timeout = '1500ms'
as $$ select discovery_admin.detail_at(p_request, pg_catalog.clock_timestamp()) $$;

create function public.activate_discovery_release(
  p_release_id text,
  p_source_record_count integer,
  p_place_count integer,
  p_menu_count integer,
  p_source_digest text,
  p_projection_digest text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
declare
  v_release discovery_admin.releases%rowtype;
  v_actual_source_count integer;
  v_actual_place_count integer;
  v_actual_menu_count integer;
  v_actual_source_digest text;
  v_actual_projection_digest text;
  v_active text;
begin
  perform pg_catalog.pg_advisory_xact_lock(894573201);
  select * into v_release from discovery_admin.releases where release_id = p_release_id;
  if not found then raise exception using errcode = 'PT409', message = 'unknown_release'; end if;
  select count(*), encode(extensions.digest(convert_to(coalesce(string_agg(
    record_kind || ':' || id::text || ':' || source_sha256, ','
    order by record_kind, id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_actual_source_count, v_actual_source_digest
  from discovery_admin.source_records where release_id = p_release_id;
  select count(*), encode(extensions.digest(convert_to(coalesce(string_agg(
    'place:' || id::text || ':' || row_sha256, ',' order by id), ''), 'UTF8'), 'sha256'), 'hex')
  into v_actual_place_count, v_actual_projection_digest
  from discovery_admin.places where release_id = p_release_id;
  select count(*), encode(extensions.digest(convert_to(v_actual_projection_digest || ':' ||
    coalesce(string_agg('menu:' || id::text || ':' || row_sha256, ',' order by id), ''),
    'UTF8'), 'sha256'), 'hex')
  into v_actual_menu_count, v_actual_projection_digest
  from discovery_admin.menus where release_id = p_release_id;
  if row(p_source_record_count,p_place_count,p_menu_count,p_source_digest,p_projection_digest)
      is distinct from row(v_release.source_record_count,v_release.place_count,
        v_release.menu_count,v_release.source_digest,v_release.projection_digest)
    or row(v_actual_source_count,v_actual_place_count,v_actual_menu_count,
      v_actual_source_digest,v_actual_projection_digest)
      is distinct from row(p_source_record_count,p_place_count,p_menu_count,
        p_source_digest,p_projection_digest) then
    raise exception using errcode = 'PT409', message = 'release_manifest_mismatch';
  end if;
  select release_id into v_active from discovery_admin.state where singleton for update;
  if found and v_active = p_release_id then
    return jsonb_build_object('status','already_active','releaseId',p_release_id);
  end if;
  insert into discovery_admin.state(singleton,release_id,activated_at)
  values (true,p_release_id,pg_catalog.clock_timestamp())
  on conflict (singleton) do update set release_id = excluded.release_id,
    activated_at = excluded.activated_at;
  return jsonb_build_object('status','activated','releaseId',p_release_id);
end
$$;

grant usage on schema public, discovery_admin, extensions to discovery_reader;
grant select (release_id, id, slug, name, brand_id, address, latitude, longitude, region,
  phone, naver_place_url, media, listing_kind, store_description, official_store_url,
  searchable_text, source_order) on discovery_admin.places to discovery_reader;
grant select (release_id, id, place_id, name, facts, branch_applicability,
  applicability_notice, selection_eligible, discovery_tags, ingredients, searchable_text,
  source_order, valid_from, valid_until) on discovery_admin.menus to discovery_reader;
grant select (singleton, release_id, activated_at) on discovery_admin.state to discovery_reader;
grant execute on function discovery_admin.state_at(timestamptz),
  discovery_admin.place_dto(jsonb),
  discovery_admin.menu_dto(jsonb),
  discovery_admin.matching_at(text,timestamptz,text,text,text,text,boolean,double precision,
    double precision,double precision,double precision),
  discovery_admin.query_at(jsonb,timestamptz),
  discovery_admin.detail_at(jsonb,timestamptz) to discovery_reader;

grant discovery_reader to postgres;
grant create on schema public to discovery_reader;
alter function public.get_discovery_state() owner to discovery_reader;
alter function public.query_discovery(jsonb) owner to discovery_reader;
alter function public.get_discovery_place(jsonb) owner to discovery_reader;
revoke create on schema public from discovery_reader;
revoke discovery_reader from postgres;

revoke all on function public.get_discovery_state() from public, anon, authenticated;
revoke all on function public.query_discovery(jsonb) from public, anon, authenticated;
revoke all on function public.get_discovery_place(jsonb) from public, anon, authenticated;
grant execute on function public.get_discovery_state() to anon, authenticated, service_role;
grant execute on function public.query_discovery(jsonb) to anon, authenticated, service_role;
grant execute on function public.get_discovery_place(jsonb) to anon, authenticated, service_role;

revoke all on function public.activate_discovery_release(text,integer,integer,integer,text,text)
  from public, anon, authenticated;
grant usage on schema discovery_admin, extensions to service_role;
grant select, insert on discovery_admin.releases, discovery_admin.source_records,
  discovery_admin.places, discovery_admin.menus to service_role;
grant select, insert, update on discovery_admin.state to service_role;
grant execute on function extensions.digest(bytea,text) to service_role, discovery_reader;
grant execute on function public.activate_discovery_release(text,integer,integer,integer,text,text)
  to service_role;

revoke all on function discovery_admin.reject_immutable_change(),
  discovery_admin.state_at(timestamptz),
  discovery_admin.place_dto(jsonb),
  discovery_admin.menu_dto(jsonb),
  discovery_admin.matching_at(text,timestamptz,text,text,text,text,boolean,double precision,
    double precision,double precision,double precision),
  discovery_admin.query_at(jsonb,timestamptz),
  discovery_admin.detail_at(jsonb,timestamptz)
  from public, anon, authenticated;
