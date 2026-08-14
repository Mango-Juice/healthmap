alter table public.places add constraint places_production_naver_url_userinfo_check check (
  data_mode <> 'production'
  or strpos(split_part(split_part(naver_place_url, '://', 2), '/', 1), '@') = 0
);

alter table public.menus add constraint menus_production_evidence_url_userinfo_check check (
  data_mode <> 'production'
  or strpos(split_part(split_part(evidence_url, '://', 2), '/', 1), '@') = 0
);
