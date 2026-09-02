create extension if not exists pgcrypto with schema extensions;

create type public.verification_method as enum (
  'official_menu',
  'merchant_submission',
  'direct_confirmation',
  'government_exact'
);

alter table public.menus drop constraint menus_evidence_url_https_check;
alter table public.menus drop constraint menus_evidence_url_userinfo_check;
alter table public.menus alter column evidence_url drop not null;
alter table public.menus
  add column verification_method public.verification_method not null default 'official_menu',
  add column valid_until date;

update public.menus set valid_until = verified_at + 180 where valid_until is null;

alter table public.menus alter column valid_until set not null;
alter table public.menus alter column verification_method drop default;
alter table public.menus add constraint menus_verification_evidence_check check (
  (
    verification_method in ('official_menu', 'merchant_submission', 'government_exact')
    and evidence_url is not null
    and evidence_url ~ '^https://[^[:space:]]+$'
    and evidence_url !~ '^https://example[.]invalid/'
    and strpos(split_part(split_part(evidence_url, '://', 2), '/', 1), '@') = 0
  )
  or (verification_method = 'direct_confirmation' and evidence_url is null)
);
alter table public.menus add constraint menus_validity_window_check check (
  valid_until > verified_at
  and (
    (verification_method = 'direct_confirmation' and valid_until <= verified_at + 90)
    or (
      verification_method in ('official_menu', 'merchant_submission', 'government_exact')
      and valid_until <= verified_at + 180
    )
  )
);

create table public.catalog_state (
  singleton boolean primary key default true check (singleton),
  catalog_version text not null check (char_length(btrim(catalog_version)) between 1 and 120),
  data_mode text not null default 'production' check (data_mode = 'production'),
  promoted_at timestamptz not null default now()
);

insert into public.catalog_state (singleton, catalog_version)
values (true, 'legacy-20260821');

alter table public.catalog_state enable row level security;
revoke all on table public.catalog_state from anon, authenticated;
grant all on table public.catalog_state to service_role;
drop policy if exists "catalog state is publicly readable" on public.catalog_state;
drop policy if exists "published places are publicly readable" on public.places;
drop policy if exists "published menus of published places are publicly readable" on public.menus;
revoke select on table public.places, public.menus from anon, authenticated;

create schema if not exists catalog_admin;
revoke all on schema catalog_admin from public, anon, authenticated;
grant usage on schema catalog_admin to service_role;

create table catalog_admin.import_batches (
  id uuid primary key default gen_random_uuid(),
  catalog_version text not null unique,
  data_mode text not null check (data_mode = 'production'),
  manifest_place_count integer not null check (manifest_place_count >= 100),
  manifest_menu_count integer not null check (manifest_menu_count >= 0),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  source_license text not null check (char_length(btrim(source_license)) > 0),
  reviewer text not null check (char_length(btrim(reviewer)) > 0),
  human_approved_by text,
  human_approved_at timestamptz,
  sample_population_count integer not null check (sample_population_count > 0),
  sample_reviewed_count integer not null check (
    sample_reviewed_count >= 0 and sample_reviewed_count <= sample_population_count
  ),
  status text not null default 'staged' check (status in ('staged', 'promoted')),
  promoted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint import_batches_approval_pair_check check (
    (human_approved_by is null) = (human_approved_at is null)
  )
);

create table catalog_admin.staged_places (
  row_id bigint generated always as identity primary key,
  batch_id uuid not null references catalog_admin.import_batches(id) on delete cascade,
  id uuid not null,
  slug text not null,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  naver_place_url text not null,
  primary_tag public.health_tag not null,
  health_tags public.health_tag[] not null,
  data_mode text not null,
  raw_provenance jsonb not null,
  source_hash text not null
);

create table catalog_admin.staged_menus (
  row_id bigint generated always as identity primary key,
  batch_id uuid not null references catalog_admin.import_batches(id) on delete cascade,
  id uuid not null,
  place_id uuid not null,
  name text not null,
  health_tags public.health_tag[] not null,
  evidence_url text,
  verification_method public.verification_method not null,
  verified_at date not null,
  valid_until date not null,
  display_order integer not null,
  data_mode text not null,
  raw_provenance jsonb not null,
  source_hash text not null
);

create table catalog_admin.place_approvals (
  batch_id uuid not null references catalog_admin.import_batches(id) on delete cascade,
  place_id uuid not null,
  reviewer text not null check (char_length(btrim(reviewer)) > 0),
  reviewed_at timestamptz not null,
  decision text not null check (decision in ('approved', 'rejected')),
  reviewed_evidence_reference text not null check (
    char_length(btrim(reviewed_evidence_reference)) > 0
  ),
  reviewed_evidence_hash text not null check (reviewed_evidence_hash ~ '^[a-f0-9]{64}$'),
  primary key (batch_id, place_id)
);

create table catalog_admin.place_rechecks (
  batch_id uuid not null references catalog_admin.import_batches(id) on delete cascade,
  place_id uuid not null,
  selection_rank integer not null check (selection_rank > 0),
  selection_key text not null check (selection_key ~ '^[a-f0-9]{64}$'),
  reviewer text not null check (char_length(btrim(reviewer)) > 0),
  reviewed_at timestamptz not null,
  decision text not null check (decision in ('approved', 'rejected')),
  reviewed_evidence_reference text not null check (
    char_length(btrim(reviewed_evidence_reference)) > 0
  ),
  reviewed_evidence_hash text not null check (reviewed_evidence_hash ~ '^[a-f0-9]{64}$'),
  primary key (batch_id, place_id),
  unique (batch_id, selection_rank),
  unique (batch_id, selection_key)
);

create table catalog_admin.catalog_versions (
  catalog_version text primary key,
  data_mode text not null check (data_mode = 'production'),
  manifest_place_count integer not null check (manifest_place_count >= 0),
  manifest_menu_count integer not null check (manifest_menu_count >= 0),
  manifest_hash text not null check (manifest_hash ~ '^[a-f0-9]{64}$'),
  promoted_at timestamptz not null
);

create table catalog_admin.catalog_place_memberships (
  catalog_version text not null references catalog_admin.catalog_versions(catalog_version)
    on delete cascade,
  place_id uuid not null references public.places(id) on delete cascade,
  primary key (catalog_version, place_id)
);

create table catalog_admin.catalog_menu_memberships (
  catalog_version text not null references catalog_admin.catalog_versions(catalog_version)
    on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  primary key (catalog_version, menu_id)
);

insert into catalog_admin.catalog_versions (
  catalog_version, data_mode, manifest_place_count, manifest_menu_count, manifest_hash, promoted_at
)
select state.catalog_version, state.data_mode,
  (select count(*) from public.places where published and data_mode = 'production'),
  (select count(*) from public.menus where published and data_mode = 'production'),
  repeat('0', 64), state.promoted_at
from public.catalog_state as state where state.singleton;

insert into catalog_admin.catalog_place_memberships (catalog_version, place_id)
select state.catalog_version, place.id
from public.catalog_state as state
join public.places as place on place.published and place.data_mode = 'production'
where state.singleton;

insert into catalog_admin.catalog_menu_memberships (catalog_version, menu_id)
select state.catalog_version, menu.id
from public.catalog_state as state
join public.menus as menu on menu.published and menu.data_mode = 'production'
where state.singleton;

revoke all on all tables in schema catalog_admin from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema catalog_admin to service_role;
grant usage, select on all sequences in schema catalog_admin to service_role;

create or replace function catalog_admin.compute_batch_manifest_hash(p_batch_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'catalogVersion', batch.catalog_version,
    'dataMode', batch.data_mode,
    'places', coalesce((
      select jsonb_agg(to_jsonb(place) - 'row_id' - 'batch_id' order by place.id, place.row_id)
      from catalog_admin.staged_places as place where place.batch_id = batch.id
    ), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg(to_jsonb(menu) - 'row_id' - 'batch_id' order by menu.id, menu.row_id)
      from catalog_admin.staged_menus as menu where menu.batch_id = batch.id
    ), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256'), 'hex')
  from catalog_admin.import_batches as batch
  where batch.id = p_batch_id;
$$;

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
  select id, catalog_version, data_mode, manifest_place_count, manifest_menu_count,
    manifest_hash, source_license, reviewer, human_approved_by, human_approved_at,
    sample_population_count, sample_reviewed_count, status, promoted_at, created_at
  into strict batch
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
      or place.latitude not between 37.4920 and 37.5085
      or place.longitude not between 127.0200 and 127.0445
      or place.slug <> lower(place.slug)
      or place.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or cardinality(place.health_tags) = 0
      or array_position(place.health_tags, null) is not null
      or not (place.primary_tag = any(place.health_tags))
      or place.naver_place_url !~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$'
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
    where place.batch_id = batch.id and (
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
    primary_tag, health_tags, published, data_mode
  )
  select id, slug, name, address, latitude, longitude, naver_place_url,
    primary_tag, health_tags, true, data_mode
  from catalog_admin.staged_places where batch_id = batch.id
  on conflict (id) do update set
    slug = excluded.slug, name = excluded.name, address = excluded.address,
    latitude = excluded.latitude, longitude = excluded.longitude,
    naver_place_url = excluded.naver_place_url, primary_tag = excluded.primary_tag,
    health_tags = excluded.health_tags, published = true, data_mode = excluded.data_mode;

  insert into public.menus (
    id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, published, data_mode
  )
  select id, place_id, name, health_tags, evidence_url, verification_method,
    verified_at, valid_until, display_order, true, data_mode
  from catalog_admin.staged_menus where batch_id = batch.id
  on conflict (id) do update set
    place_id = excluded.place_id, name = excluded.name, health_tags = excluded.health_tags,
    evidence_url = excluded.evidence_url, verification_method = excluded.verification_method,
    verified_at = excluded.verified_at, valid_until = excluded.valid_until,
    display_order = excluded.display_order, published = true, data_mode = excluded.data_mode;

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
    catalog_version = batch.catalog_version, data_mode = batch.data_mode, promoted_at = now()
  where singleton;
  update catalog_admin.import_batches set status = 'promoted', promoted_at = now()
  where id = batch.id;

  return jsonb_build_object('catalogVersion', batch.catalog_version, 'status', 'promoted');
end;
$$;

revoke all on function catalog_admin.compute_batch_manifest_hash(uuid) from public;
revoke all on function catalog_admin.promote_catalog_batch(uuid, text, text, integer, integer) from public;
grant execute on function catalog_admin.compute_batch_manifest_hash(uuid) to service_role;
grant execute on function catalog_admin.promote_catalog_batch(uuid, text, text, integer, integer) to service_role;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'catalog_reader') then
    create role catalog_reader nologin noinherit;
  end if;
end
$$;

create schema if not exists catalog_api;
revoke all on schema catalog_api from public, anon, authenticated;
grant usage on schema public, catalog_admin, catalog_api to catalog_reader;
grant select on table public.places, public.menus, public.catalog_state to catalog_reader;
grant select on table catalog_admin.catalog_place_memberships,
  catalog_admin.catalog_menu_memberships to catalog_reader;

create policy "catalog reader can read state"
  on public.catalog_state for select to catalog_reader using (singleton);
create policy "catalog reader can read places"
  on public.places for select to catalog_reader using (true);
create policy "catalog reader can read menus"
  on public.menus for select to catalog_reader using (true);

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
      select jsonb_agg(jsonb_build_object(
        'id', place.id, 'slug', place.slug, 'name', place.name,
        'address', place.address, 'latitude', place.latitude, 'longitude', place.longitude,
        'naverPlaceUrl', place.naver_place_url, 'primaryTag', place.primary_tag,
        'healthTags', place.health_tags, 'published', place.published,
        'dataMode', place.data_mode
      ) order by place.id)
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
            and current_menu.valid_until >= current_date
        )
    ), '[]'::jsonb),
    'menus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', menu.id, 'placeId', menu.place_id, 'name', menu.name,
        'healthTags', menu.health_tags, 'evidenceUrl', menu.evidence_url,
        'verificationMethod', menu.verification_method,
        'verifiedAt', to_char(menu.verified_at, 'YYYY-MM-DD'),
        'validUntil', to_char(menu.valid_until, 'YYYY-MM-DD'),
        'displayOrder', menu.display_order, 'published', menu.published,
        'dataMode', menu.data_mode
      ) order by menu.place_id, menu.display_order, menu.id)
      from catalog_admin.catalog_menu_memberships as membership
      join public.menus as menu on menu.id = membership.menu_id
      join catalog_admin.catalog_place_memberships as place_membership
        on place_membership.catalog_version = membership.catalog_version
        and place_membership.place_id = menu.place_id
      where membership.catalog_version = state.catalog_version
        and menu.published and menu.data_mode = 'production'
        and menu.valid_until >= current_date
    ), '[]'::jsonb)
  )
  from public.catalog_state as state
  where state.singleton;
$$;

revoke all on function catalog_api.read_current_catalog() from public;
grant usage on schema catalog_api to anon, authenticated;
grant execute on function catalog_api.read_current_catalog() to anon, authenticated;
grant catalog_reader to postgres;
grant create on schema catalog_api to catalog_reader;
alter function catalog_api.read_current_catalog() owner to catalog_reader;
revoke create on schema catalog_api from catalog_reader;
revoke catalog_reader from postgres;

create or replace function public.get_public_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select catalog_api.read_current_catalog();
$$;

revoke all on function public.get_public_catalog() from public;
grant execute on function public.get_public_catalog() to anon, authenticated;
