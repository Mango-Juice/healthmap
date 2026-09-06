alter table discovery_admin.places add column normalized_name text generated always as (
  lower(regexp_replace(btrim(normalize(
    case when listing_kind='store_only' and brand_id='subway'
      then regexp_replace(name, '^서브웨이[[:space:]]+', '') else name end,
    NFKC)), '[[:space:]]+', ' ', 'g'))
) stored;

alter table discovery_admin.menus add column normalized_name text generated always as (
  lower(regexp_replace(btrim(normalize(name, NFKC)), '[[:space:]]+', ' ', 'g'))
) stored;

grant select (normalized_name) on discovery_admin.places, discovery_admin.menus
  to discovery_reader;

create or replace function discovery_admin.matching_at(
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
    select menu.release_id, menu.id, menu.place_id, menu.searchable_text, menu.normalized_name
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
        when place.normalized_name = p_query then 0
        when position(p_query in place.normalized_name) > 0 then 1
        when bool_or(position(p_query in menu.normalized_name) > 0) then 2 else 3 end as rank
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
      case when p_query = '' then 0 when place.normalized_name = p_query then 0
        when position(p_query in place.normalized_name) > 0 then 1 else 3 end as rank
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

grant discovery_reader to postgres with inherit false, set true;
set role discovery_reader;
alter function public.get_discovery_state() set extra_float_digits = '1';
alter function public.query_discovery(jsonb) set extra_float_digits = '1';
alter function public.get_discovery_place(jsonb) set extra_float_digits = '1';
reset role;
set role postgres;
revoke discovery_reader from postgres granted by postgres;
