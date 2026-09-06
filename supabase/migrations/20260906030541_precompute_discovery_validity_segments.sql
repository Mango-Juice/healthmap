create table discovery_admin.validity_segments (
  release_id text not null references discovery_admin.releases (release_id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  eligible_epoch text not null check (eligible_epoch ~ '^[a-f0-9]{64}$'),
  primary key (release_id, starts_at),
  check (starts_at < ends_at)
);

alter table discovery_admin.validity_segments enable row level security;
revoke all on discovery_admin.validity_segments from public, anon, authenticated;

create policy "discovery reader can read safe validity segments"
  on discovery_admin.validity_segments for select to discovery_reader using (true);

create trigger discovery_validity_segments_immutable
before update or delete on discovery_admin.validity_segments
for each row execute function discovery_admin.reject_immutable_change();

lock table discovery_admin.source_records, discovery_admin.places,
  discovery_admin.menus, discovery_admin.state in share row exclusive mode;

create function discovery_admin.reject_sealed_release_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001',
      message = 'discovery staging requires read committed isolation';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(894573201);
  if not exists (
    select 1 from discovery_admin.validity_segments as validity
    where validity.release_id = new.release_id
  ) then return new; end if;
  if tg_table_name = 'source_records' then
    if exists (
      select 1 from discovery_admin.source_records as existing
      where existing.release_id = new.release_id and existing.id = new.id
    ) then return new; end if;
  elsif tg_table_name = 'places' then
    if exists (
      select 1 from discovery_admin.places as existing
      where existing.release_id = new.release_id and existing.id = new.id
    ) then return new; end if;
  elsif tg_table_name = 'menus' then
    if exists (
      select 1 from discovery_admin.menus as existing
      where existing.release_id = new.release_id and existing.id = new.id
    ) then return new; end if;
  end if;
  raise exception using errcode = '55000', message = 'discovery release rows are sealed';
end
$$;

create trigger discovery_sources_sealed before insert on discovery_admin.source_records
for each row execute function discovery_admin.reject_sealed_release_insert();
create trigger discovery_places_sealed before insert on discovery_admin.places
for each row execute function discovery_admin.reject_sealed_release_insert();
create trigger discovery_menus_sealed before insert on discovery_admin.menus
for each row execute function discovery_admin.reject_sealed_release_insert();

revoke all on function discovery_admin.reject_sealed_release_insert()
  from public, anon, authenticated, discovery_reader, service_role;

-- For B distinct validity endpoints this creates exactly B + 1 half-open segments.
-- Segment construction is activation-only and remains inside the activation transaction.
with source_manifests as (
  select release.release_id, count(source.id)::integer as source_record_count,
    encode(extensions.digest(convert_to(coalesce(string_agg(
      source.record_kind || ':' || source.id::text || ':' || source.source_sha256, ','
      order by source.record_kind, source.id), ''), 'UTF8'), 'sha256'), 'hex') as source_digest
  from discovery_admin.releases as release
  left join discovery_admin.source_records as source on source.release_id = release.release_id
  group by release.release_id
), place_manifests as (
  select release.release_id, count(place.id)::integer as place_count,
    encode(extensions.digest(convert_to(coalesce(string_agg(
      'place:' || place.id::text || ':' || place.row_sha256, ',' order by place.id
    ), ''), 'UTF8'), 'sha256'), 'hex') as place_digest
  from discovery_admin.releases as release
  left join discovery_admin.places as place on place.release_id = release.release_id
  group by release.release_id
), projection_manifests as (
  select place.release_id, place.place_count, count(menu.id)::integer as menu_count,
    encode(extensions.digest(convert_to(place.place_digest || ':' || coalesce(string_agg(
      'menu:' || menu.id::text || ':' || menu.row_sha256, ',' order by menu.id
    ), ''), 'UTF8'), 'sha256'), 'hex') as projection_digest
  from place_manifests as place
  left join discovery_admin.menus as menu on menu.release_id = place.release_id
  group by place.release_id, place.place_count, place.place_digest
), validated_releases as (
  select release.release_id
  from discovery_admin.releases as release
  join source_manifests as source using (release_id)
  join projection_manifests as projection using (release_id)
  where (release.source_record_count, release.place_count, release.menu_count,
      release.source_digest, release.projection_digest)
    = (source.source_record_count, projection.place_count, projection.menu_count,
      source.source_digest, projection.projection_digest)
), boundary_points as (
  select release.release_id, '-infinity'::timestamptz as starts_at
  from validated_releases as release
  union
  select menu.release_id, menu.valid_from from discovery_admin.menus as menu
  join validated_releases as release using (release_id)
  union
  select menu.release_id, menu.valid_until from discovery_admin.menus as menu
  join validated_releases as release using (release_id)
), segments as (
  select release_id, starts_at,
    coalesce(lead(starts_at) over (partition by release_id order by starts_at),
      'infinity'::timestamptz) as ends_at
  from boundary_points
)
insert into discovery_admin.validity_segments (
  release_id, starts_at, ends_at, eligible_epoch
)
select segment.release_id, segment.starts_at, segment.ends_at,
  encode(extensions.digest(convert_to(
    segment.release_id || ':' || coalesce(
      string_agg(menu.id::text, ',' order by menu.id), ''
    ), 'UTF8'), 'sha256'), 'hex')
from segments as segment
left join discovery_admin.menus as menu
  on menu.release_id = segment.release_id
  and menu.valid_from <= segment.starts_at
  and menu.valid_until > segment.starts_at
group by segment.release_id, segment.starts_at, segment.ends_at;

do $$
begin
  if exists (
    select 1 from discovery_admin.state as active
    where active.singleton and not exists (
      select 1 from discovery_admin.validity_segments as validity
      where validity.release_id = active.release_id
    )
  ) then raise exception 'active discovery release failed validity-segment validation'; end if;
end
$$;

create or replace function discovery_admin.state_at(p_now timestamptz)
returns jsonb
language sql
stable
security invoker
set search_path = ''
set statement_timeout = '1500ms'
as $$
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1',
    'releaseId', active.release_id,
    'eligibleEpoch', segment.eligible_epoch,
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', case when segment.ends_at = 'infinity'::timestamptz then null else
      to_char(segment.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
  )
  from discovery_admin.state as active
  cross join lateral (
    select validity.eligible_epoch, validity.ends_at
    from discovery_admin.validity_segments as validity
    where validity.release_id = active.release_id and validity.starts_at <= p_now
    order by validity.starts_at desc
    limit 1
  ) as segment
  where active.singleton
  union all
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1', 'releaseId', null,
    'eligibleEpoch', encode(extensions.digest(convert_to('empty', 'UTF8'), 'sha256'), 'hex'),
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', null
  )
  where not exists (select 1 from discovery_admin.state where singleton)
  limit 1
$$;

create or replace function public.activate_discovery_release(
  p_release_id text,
  p_source_record_count integer,
  p_place_count integer,
  p_menu_count integer,
  p_source_digest text,
  p_projection_digest text
)
returns jsonb
language plpgsql
security definer
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
  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise exception using errcode = '40001',
      message = 'discovery activation requires read committed isolation';
  end if;
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
  with boundary_points as (
    select p_release_id as release_id, '-infinity'::timestamptz as starts_at
    union
    select menu.release_id, menu.valid_from
    from discovery_admin.menus as menu where menu.release_id = p_release_id
    union
    select menu.release_id, menu.valid_until
    from discovery_admin.menus as menu where menu.release_id = p_release_id
  ), segments as (
    select release_id, starts_at,
      coalesce(lead(starts_at) over (order by starts_at), 'infinity'::timestamptz) as ends_at
    from boundary_points
  )
  insert into discovery_admin.validity_segments (
    release_id, starts_at, ends_at, eligible_epoch
  )
  select segment.release_id, segment.starts_at, segment.ends_at,
    encode(extensions.digest(convert_to(
      segment.release_id || ':' || coalesce(
        string_agg(menu.id::text, ',' order by menu.id), ''
      ), 'UTF8'), 'sha256'), 'hex')
  from segments as segment
  left join discovery_admin.menus as menu
    on menu.release_id = segment.release_id
    and menu.valid_from <= segment.starts_at
    and menu.valid_until > segment.starts_at
  where not exists (
    select 1 from discovery_admin.validity_segments as existing
    where existing.release_id = p_release_id
  )
  group by segment.release_id, segment.starts_at, segment.ends_at;
  insert into discovery_admin.state(singleton,release_id,activated_at)
  values (true,p_release_id,pg_catalog.clock_timestamp())
  on conflict (singleton) do update set release_id = excluded.release_id,
    activated_at = excluded.activated_at;
  return jsonb_build_object('status','activated','releaseId',p_release_id);
end
$$;

grant select (release_id, starts_at, ends_at, eligible_epoch)
  on discovery_admin.validity_segments to discovery_reader;
revoke all on discovery_admin.validity_segments from service_role;

revoke all on function public.activate_discovery_release(
  text,integer,integer,integer,text,text
) from public, anon, authenticated;
grant execute on function public.activate_discovery_release(
  text,integer,integer,integer,text,text
) to service_role;
