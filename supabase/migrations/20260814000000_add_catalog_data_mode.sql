alter table public.places add column data_mode text not null default 'production';
alter table public.places add constraint places_data_mode_check check (data_mode in ('production', 'mock'));
create unique index places_id_data_mode_unique_idx on public.places (id, data_mode);

alter table public.menus add column data_mode text not null default 'production';
alter table public.menus add constraint menus_data_mode_check check (data_mode in ('production', 'mock'));
alter table public.menus add constraint menus_place_mode_fk foreign key (place_id, data_mode) references public.places (id, data_mode) on delete cascade;

alter table public.places drop constraint places_naver_place_url_check;
alter table public.places add constraint places_mode_url_check check (
  (data_mode = 'production' and naver_place_url ~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$')
  or (data_mode = 'mock' and naver_place_url ~ '^https://example[.]invalid/mock-directions/mock-[a-z0-9-]+$')
);
alter table public.menus drop constraint menus_evidence_url_https_check;
alter table public.menus add constraint menus_mode_evidence_check check (
  (data_mode = 'production' and evidence_url ~ '^https://[^[:space:]]+$' and evidence_url !~ '^https://example[.]invalid/')
  or (data_mode = 'mock' and evidence_url ~ '^https://example[.]invalid/mock-evidence/mock-[a-z0-9-]+$')
);
