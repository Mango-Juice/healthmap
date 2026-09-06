create function discovery_admin.matching_keys_at(
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
    select place.id, place.latitude, place.longitude, place.region, place.listing_kind,
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
    select place.id, place.latitude, place.longitude, place.region, place.listing_kind,
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
  )
  select * from menu_places union all select * from stores
$$;

revoke all on function discovery_admin.matching_keys_at(
  text,timestamptz,text,text,text,text,boolean,double precision,double precision,
  double precision,double precision
) from public, anon, authenticated;
grant execute on function discovery_admin.matching_keys_at(
  text,timestamptz,text,text,text,text,boolean,double precision,double precision,
  double precision,double precision
) to discovery_reader;

create or replace function discovery_admin.query_at(p_request jsonb, p_now timestamptz)
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
  v_cursor_offset_valid boolean := true;
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
      from discovery_admin.matching_keys_at(v_release,p_now,v_query,v_filter,v_ingredient,v_region,
        v_has_bounds,v_south,v_north,v_west,v_east) group by region
    ) as groups;
    return v_state || jsonb_build_object('data', v_data);
  end if;

  if p_request ? 'cursor' then
    begin
      v_cursor := convert_from(decode(translate(p_request->>'cursor','-_','+/') ||
        repeat('=', (4 - char_length(p_request->>'cursor') % 4) % 4), 'base64'), 'UTF8')::jsonb;
      if jsonb_typeof(v_cursor) <> 'object'
        or (v_cursor - array['release','epoch','fingerprint','offset']) <> '{}'::jsonb
        or v_cursor->>'release' is distinct from v_release
        or v_cursor->>'epoch' is distinct from v_epoch then
        raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
      end if;
      begin
        v_offset := (v_cursor->>'offset')::integer;
      exception when others then
        v_cursor_offset_valid := false;
        v_offset := 0;
      end;
      if v_cursor_offset_valid and v_offset < 0 then
        raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
      end if;
    exception
      when sqlstate 'PT409' then raise;
      when others then
        raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
    end;
  end if;

  v_sort_basis := case when v_has_bounds then 'map_center'
    when v_region is not null then 'region_center' else 'catalog_center' end;
  with matches as materialized (
    select *
    from discovery_admin.matching_keys_at(v_release,p_now,v_query,v_filter,v_ingredient,v_region,
      v_has_bounds,v_south,v_north,v_west,v_east)
  ), context as (
    select count(*)::integer as total,
      case when v_has_bounds then (v_south + v_north) / 2
        else (min(latitude) + max(latitude)) / 2 end as origin_lat,
      case when v_has_bounds then (v_west + v_east) / 2
        else (min(longitude) + max(longitude)) / 2 end as origin_lon
    from matches
  ), fingerprinted as (
    select context.*,
      encode(extensions.digest(convert_to(jsonb_build_array(
        'ordering-v2', v_query, v_filter, v_ingredient, v_region,
        v_south, v_north, v_west, v_east, v_sort_basis,
        context.origin_lat, context.origin_lon, v_release, v_epoch
      )::text, 'UTF8'), 'sha256'), 'hex') as fingerprint
    from context
  ), ranked as (
    select match.*,
      case when fingerprinted.origin_lat is null then 0 else 2 * 6371000 * asin(sqrt(
        power(sin(radians(match.latitude - fingerprinted.origin_lat) / 2), 2) +
        cos(radians(fingerprinted.origin_lat)) * cos(radians(match.latitude)) *
        power(sin(radians(match.longitude - fingerprinted.origin_lon) / 2), 2)
      )) end as distance
    from matches as match cross join fingerprinted
  ), page as (
    select * from ranked order by relevance, distance, id offset v_offset limit v_limit
  )
  select jsonb_build_object(
      'catalogVersion', v_release, 'sortBasis', v_sort_basis,
      'sortOrigin', case when fingerprinted.origin_lat is null then null else
        jsonb_build_object('latitude',fingerprinted.origin_lat,'longitude',fingerprinted.origin_lon) end,
      'total', fingerprinted.total,
      'results', coalesce(jsonb_agg(jsonb_build_object(
        'place', discovery_admin.place_dto(jsonb_build_object(
          'id',place.id,'slug',place.slug,'name',place.name,'brand_id',place.brand_id,
          'address',place.address,'latitude',place.latitude,'longitude',place.longitude,
          'region',place.region,'phone',place.phone,'naver_place_url',place.naver_place_url,
          'media',place.media,'listing_kind',place.listing_kind,
          'store_description',place.store_description,'official_store_url',place.official_store_url
        )),
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
      ) order by page.relevance, page.distance, page.id)
        filter (where page.id is not null), '[]'::jsonb),
      'nextCursor', case when v_offset + v_limit >= fingerprinted.total then null else
        rtrim(translate(replace(encode(convert_to(jsonb_build_object(
          'release',v_release,'epoch',v_epoch,'fingerprint',fingerprinted.fingerprint,
          'offset',v_offset + v_limit)::text,'UTF8'),'base64'), E'\n', ''),'+/','-_'), '=') end
    ), fingerprinted.total, fingerprinted.origin_lat, fingerprinted.origin_lon,
    fingerprinted.fingerprint
  into v_data, v_total, v_origin_lat, v_origin_lon, v_fingerprint
  from fingerprinted
  left join page on true
  left join discovery_admin.places as place
    on place.release_id = v_release and place.id = page.id
  group by fingerprinted.total, fingerprinted.origin_lat, fingerprinted.origin_lon,
    fingerprinted.fingerprint;

  if p_request ? 'cursor' then
    if v_cursor->>'fingerprint' is distinct from v_fingerprint then
      raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
    end if;
    if not v_cursor_offset_valid then
      raise exception using errcode = 'PT400', message = '{"error":"invalid_request","retry":false}';
    end if;
    if v_offset < 0 or v_offset > v_total then
      raise exception using errcode = 'PT409', message = '{"error":"stale_cursor","retry":true}';
    end if;
  end if;

  return v_state || jsonb_build_object('data', v_data);
end
$$;
