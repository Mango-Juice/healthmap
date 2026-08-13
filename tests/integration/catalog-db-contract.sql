begin;

do $$
begin
  if not (
    has_table_privilege('service_role', 'public.places', 'INSERT, UPDATE, DELETE')
    and has_table_privilege('service_role', 'public.menus', 'INSERT, UPDATE, DELETE')
  ) then
    raise exception using message = 'service role lacks catalog write privileges';
  end if;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'invalid-primary-membership', 'invalid', 'invalid', 37.5000, 127.0328,
      'https://map.naver.com/p/entry/place/1', 'protein', array['balanced']::public.health_tag[], false
    );
    raise exception using message = 'primary tag membership accepted malformed input';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'invalid-empty-tags', 'invalid', 'invalid', 37.5000, 127.0328,
      'https://map.naver.com/p/entry/place/2', 'balanced', array[]::public.health_tag[], false
    );
    raise exception using message = 'empty health tags accepted malformed input';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'invalid-coordinates', 'invalid', 'invalid', 37.4919, 127.0446,
      'https://map.naver.com/p/entry/place/3', 'balanced', array['balanced']::public.health_tag[], false
    );
    raise exception using message = 'out-of-bounds coordinates accepted malformed input';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'invalid-url', 'invalid', 'invalid', 37.5000, 127.0328,
      'http://map.naver.com/p/entry/place/4', 'balanced', array['balanced']::public.health_tag[], false
    );
    raise exception using message = 'insecure NAVER URL accepted malformed input';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'Invalid Slug', 'invalid', 'invalid', 37.5000, 127.0328,
      'https://map.naver.com/p/entry/place/5', 'balanced', array['balanced']::public.health_tag[], false
    );
    raise exception using message = 'unnormalized slug accepted malformed input';
  exception when check_violation then
    null;
  end;

  begin
    insert into public.places (
      slug, name, address, latitude, longitude, naver_place_url,
      primary_tag, health_tags, published
    ) values (
      'sentinel-published-place', 'duplicate', 'duplicate', 37.5000, 127.0328,
      'https://map.naver.com/p/entry/place/6', 'balanced', array['balanced']::public.health_tag[], false
    );
    raise exception using message = 'duplicate slug accepted malformed input';
  exception when unique_violation then
    null;
  end;

  begin
    insert into public.menus (
      place_id, name, health_tags, evidence_url, verified_at, display_order, published
    ) values (
      '30000000-0000-4000-8000-000000000099', 'orphan', array['balanced']::public.health_tag[],
      'https://example.com/orphan', '2026-08-13', 0, false
    );
    raise exception using message = 'orphan menu accepted malformed input';
  exception when foreign_key_violation then
    null;
  end;

  insert into public.places (
    id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, published
  ) values (
    '30000000-0000-4000-8000-000000000001', 'cascade-sentinel', 'cascade', 'cascade',
    37.4920, 127.0200, 'https://map.naver.com/p/entry/place/7',
    'balanced', array['balanced']::public.health_tag[], false
  );

  insert into public.menus (
    id, place_id, name, health_tags, evidence_url, verified_at, display_order, published
  ) values (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 'cascade', array['balanced']::public.health_tag[],
    'https://example.com/cascade', '2026-08-13', 0, false
  );

  delete from public.places where id = '30000000-0000-4000-8000-000000000001';

  if exists (
    select 1 from public.menus where id = '40000000-0000-4000-8000-000000000001'
  ) then
    raise exception using message = 'menu did not cascade with deleted place';
  end if;
end
$$;

select json_build_object(
  'malformed_input', 'rejected',
  'slug_uniqueness', 'enforced',
  'foreign_key', 'enforced',
  'delete_behavior', 'cascade',
  'place_indexes', (
    select json_agg(indexname order by indexname)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'places'
  ),
  'menu_indexes', (
    select json_agg(indexname order by indexname)
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'menus'
  ),
  'policies', (
    select json_agg(policyname order by policyname)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('places', 'menus')
  ),
  'rls_enabled', (
    select bool_and(relrowsecurity)
    from pg_class
    where oid in ('public.places'::regclass, 'public.menus'::regclass)
  ),
  'service_role_can_write', (
    select bool_and(
      has_table_privilege('service_role', relation_name, 'INSERT, UPDATE, DELETE')
    )
    from unnest(array['public.places', 'public.menus']) as relation(relation_name)
  )
) as contract_result;

rollback;
