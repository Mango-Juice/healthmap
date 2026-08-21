-- This is an intentional one-way cleanup; inspect row counts and take a snapshot before applying it.
delete from public.menus where data_mode is distinct from 'production';
delete from public.places where data_mode is distinct from 'production';

alter table public.menus drop constraint menus_mode_evidence_check;
alter table public.menus drop constraint menus_production_evidence_url_userinfo_check;
alter table public.menus drop constraint menus_data_mode_check;
alter table public.menus add constraint menus_data_mode_check check (data_mode = 'production');
alter table public.menus add constraint menus_evidence_url_https_check check (
  evidence_url ~ '^https://[^[:space:]]+$'
  and evidence_url !~ '^https://example[.]invalid/'
);
alter table public.menus add constraint menus_evidence_url_userinfo_check check (
  strpos(split_part(split_part(evidence_url, '://', 2), '/', 1), '@') = 0
);

alter table public.places drop constraint places_mode_url_check;
alter table public.places drop constraint places_production_naver_url_userinfo_check;
alter table public.places drop constraint places_data_mode_check;
alter table public.places add constraint places_data_mode_check check (data_mode = 'production');
alter table public.places add constraint places_naver_place_url_check check (
  naver_place_url ~ '^https://(map[.]naver[.]com|m[.]place[.]naver[.]com|place[.]naver[.]com|naver[.]me)/[^[:space:]]+$'
);
alter table public.places add constraint places_naver_url_userinfo_check check (
  strpos(split_part(split_part(naver_place_url, '://', 2), '/', 1), '@') = 0
);
