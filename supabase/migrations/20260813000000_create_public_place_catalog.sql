create type public.health_tag as enum (
  'vegetables',
  'protein',
  'balanced',
  'plant_based'
);

create table public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  naver_place_url text not null,
  primary_tag public.health_tag not null,
  health_tags public.health_tag[] not null,
  published boolean not null default false,
  constraint places_slug_normalized_check check (
    slug = lower(slug)
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    and char_length(slug) between 1 and 80
  ),
  constraint places_name_nonempty_check check (char_length(btrim(name)) > 0),
  constraint places_address_nonempty_check check (char_length(btrim(address)) > 0),
  constraint places_latitude_display_bounds_check check (
    latitude between 37.4920 and 37.5085
  ),
  constraint places_longitude_display_bounds_check check (
    longitude between 127.0200 and 127.0445
  ),
  constraint places_naver_place_url_check check (
    naver_place_url ~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$'
  ),
  constraint places_health_tags_nonempty_check check (cardinality(health_tags) > 0),
  constraint places_health_tags_no_null_check check (array_position(health_tags, null) is null),
  constraint places_primary_tag_membership_check check (primary_tag = any(health_tags))
);

create unique index places_slug_unique_idx on public.places (slug);
create index places_published_map_bounds_idx
  on public.places (latitude, longitude)
  where published;

create table public.menus (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  name text not null,
  health_tags public.health_tag[] not null,
  evidence_url text not null,
  verified_at date not null,
  display_order integer not null default 0,
  published boolean not null default false,
  constraint menus_name_nonempty_check check (char_length(btrim(name)) > 0),
  constraint menus_health_tags_nonempty_check check (cardinality(health_tags) > 0),
  constraint menus_health_tags_no_null_check check (array_position(health_tags, null) is null),
  constraint menus_evidence_url_https_check check (
    evidence_url ~ '^https://[^[:space:]]+$'
  ),
  constraint menus_display_order_nonnegative_check check (display_order >= 0)
);

create index menus_place_display_order_idx
  on public.menus (place_id, display_order)
  where published;
create index menus_published_idx on public.menus (published);

alter table public.places enable row level security;
alter table public.menus enable row level security;

revoke all on table public.places from anon, authenticated;
revoke all on table public.menus from anon, authenticated;
grant select on table public.places to anon, authenticated;
grant select on table public.menus to anon, authenticated;
grant all on table public.places to service_role;
grant all on table public.menus to service_role;

create policy "published places are publicly readable"
  on public.places
  for select
  to anon, authenticated
  using (published);

create policy "published menus of published places are publicly readable"
  on public.menus
  for select
  to anon, authenticated
  using (
    published
    and exists (
      select 1
      from public.places
      where places.id = menus.place_id
        and places.published
    )
  );
