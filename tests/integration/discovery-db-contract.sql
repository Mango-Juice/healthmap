begin;

do $$
begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'PostgreSQL 17 or newer is required';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'discovery_reader' and not rolcanlogin and not rolinherit
      and not rolsuper and not rolcreatedb and not rolcreaterole and not rolreplication
      and not rolbypassrls
  ) then raise exception 'discovery_reader is missing or privileged'; end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members as membership
    join pg_catalog.pg_roles as member_role on member_role.oid = membership.member
    where membership.member = (select oid from pg_catalog.pg_roles
        where rolname='discovery_reader')
      or (membership.roleid = (select oid from pg_catalog.pg_roles
          where rolname='discovery_reader') and not (
        member_role.rolname = current_user and membership.admin_option
        and not membership.inherit_option and not membership.set_option
      ))
  ) then raise exception 'discovery_reader has unsafe role memberships'; end if;
  if exists (
    select 1 from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'discovery_admin'
      and relation.relname in ('releases','source_records','places','menus','state')
      and not relation.relrowsecurity
  ) then raise exception 'discovery table without RLS'; end if;
  if has_schema_privilege('anon','discovery_admin','usage')
    or has_schema_privilege('authenticated','discovery_admin','usage')
    or has_table_privilege('anon','discovery_admin.source_records','select')
    or has_table_privilege('authenticated','discovery_admin.places','select') then
    raise exception 'public role received direct discovery access';
  end if;
  if has_table_privilege('discovery_reader','discovery_admin.source_records','select')
    or has_table_privilege('discovery_reader','discovery_admin.places','insert')
    or has_column_privilege('discovery_reader','discovery_admin.places','row_sha256','select')
    or has_column_privilege('discovery_reader','discovery_admin.menus','row_sha256','select') then
    raise exception 'discovery_reader can access raw or mutable data';
  end if;
  if not has_function_privilege('anon','public.get_discovery_state()','execute')
    or not has_function_privilege('authenticated','public.query_discovery(jsonb)','execute')
    or not has_function_privilege('service_role','public.get_discovery_place(jsonb)','execute')
    or has_function_privilege('anon',
      'public.activate_discovery_release(text,integer,integer,integer,text,text)','execute') then
    raise exception 'RPC grants differ from contract';
  end if;
  if not has_function_privilege('anon','public.get_public_catalog()','execute')
    or has_function_privilege('anon','public.submit_pending_suggestion(jsonb,text,text)','execute')
    or not has_function_privilege('service_role',
      'public.submit_pending_suggestion(jsonb,text,text)','execute')
    or has_table_privilege('anon','suggestion_admin.pending','select') then
    raise exception 'existing reviewed or suggestion privileges changed';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in ('get_discovery_state','query_discovery','get_discovery_place')
      and (
        not procedure.prosecdef
        or procedure.proowner <> (select oid from pg_catalog.pg_roles where rolname='discovery_reader')
        or not ('search_path=""' = any(procedure.proconfig))
        or not ('statement_timeout=1500ms' = any(procedure.proconfig))
      )
  ) then raise exception 'public discovery RPC is not hardened'; end if;
end
$$;

do $$
declare
  release_id constant text := 'synthetic-release-1';
  source_digest text;
  place_digest text;
  projection_digest text;
begin
  with records(kind,id,sha) as (values
    ('menu','10000000-0000-4000-8000-000000000101'::uuid,repeat('1',64)),
    ('menu','10000000-0000-4000-8000-000000000102'::uuid,repeat('2',64)),
    ('menu','10000000-0000-4000-8000-000000000103'::uuid,repeat('3',64)),
    ('menu','10000000-0000-4000-8000-000000000104'::uuid,repeat('4',64)),
    ('menu','10000000-0000-4000-8000-000000000105'::uuid,repeat('5',64)),
    ('place','bc6b1050-539e-4d28-8493-5920eae54248'::uuid,repeat('a',64)),
    ('place','c4e1cffb-2658-4ad4-8e38-c8c12a11c627'::uuid,repeat('c',64)),
    ('place','75708968-2839-4eba-8b44-f613de821d6c'::uuid,repeat('d',64)),
    ('store','bede62e8-6e4d-4d3b-8227-34b73451b3a4'::uuid,repeat('b',64))
  ) select encode(extensions.digest(convert_to(string_agg(
      kind || ':' || id::text || ':' || sha, ',' order by kind,id),'UTF8'),'sha256'),'hex')
    into source_digest from records;
  with rows(id,sha) as (values
    ('bc6b1050-539e-4d28-8493-5920eae54248'::uuid,repeat('6',64)),
    ('bede62e8-6e4d-4d3b-8227-34b73451b3a4'::uuid,repeat('7',64)),
    ('c4e1cffb-2658-4ad4-8e38-c8c12a11c627'::uuid,repeat('8',64)),
    ('75708968-2839-4eba-8b44-f613de821d6c'::uuid,repeat('9',64))
  ) select encode(extensions.digest(convert_to(string_agg(
      'place:' || id::text || ':' || sha, ',' order by id),'UTF8'),'sha256'),'hex')
    into place_digest from rows;
  with rows(id,sha) as (values
    ('10000000-0000-4000-8000-000000000101'::uuid,repeat('e',64)),
    ('10000000-0000-4000-8000-000000000102'::uuid,repeat('f',64)),
    ('10000000-0000-4000-8000-000000000103'::uuid,repeat('0',64)),
    ('10000000-0000-4000-8000-000000000104'::uuid,repeat('1',64)),
    ('10000000-0000-4000-8000-000000000105'::uuid,repeat('2',64))
  ) select encode(extensions.digest(convert_to(place_digest || ':' || string_agg(
      'menu:' || id::text || ':' || sha, ',' order by id),'UTF8'),'sha256'),'hex')
    into projection_digest from rows;

  set local role service_role;
  insert into discovery_admin.releases(
    release_id,source_digest,projection_digest,source_record_count,place_count,menu_count
  ) values (release_id,source_digest,projection_digest,9,4,5);
  insert into discovery_admin.source_records(
    release_id,record_kind,id,source_path,source_order,source_sha256,payload,valid_from,valid_until
  ) values
    (release_id,'place','bc6b1050-539e-4d28-8493-5920eae54248','synthetic/places',0,repeat('a',64),'{}',null,null),
    (release_id,'store','bede62e8-6e4d-4d3b-8227-34b73451b3a4','synthetic/stores',0,repeat('b',64),'{}',null,null),
    (release_id,'place','c4e1cffb-2658-4ad4-8e38-c8c12a11c627','synthetic/places',1,repeat('c',64),'{}',null,null),
    (release_id,'place','75708968-2839-4eba-8b44-f613de821d6c','synthetic/places',2,repeat('d',64),'{}',null,null),
    (release_id,'menu','10000000-0000-4000-8000-000000000101','synthetic/menus',0,repeat('1',64),'{}','2026-01-01Z','2026-01-10 12:00Z'),
    (release_id,'menu','10000000-0000-4000-8000-000000000102','synthetic/menus',1,repeat('2',64),'{}','2026-01-01Z','2026-01-10 14:00Z'),
    (release_id,'menu','10000000-0000-4000-8000-000000000103','synthetic/menus',2,repeat('3',64),'{}','2026-01-10 13:00Z','2026-01-20Z'),
    (release_id,'menu','10000000-0000-4000-8000-000000000104','synthetic/menus',3,repeat('4',64),'{}','2026-01-01Z','2026-01-20Z'),
    (release_id,'menu','10000000-0000-4000-8000-000000000105','synthetic/menus',4,repeat('5',64),'{}','2026-01-01Z','2026-01-20Z');
  insert into discovery_admin.places(
    release_id,id,slug,name,brand_id,address,latitude,longitude,region,phone,
    naver_place_url,media,listing_kind,store_description,official_store_url,
    searchable_text,source_order,row_sha256
  ) values
    (release_id,'bc6b1050-539e-4d28-8493-5920eae54248','alpha','Alpha',null,'Synthetic A',37,127,'Region A',null,
      null,'[]','menu_evidence',null,null,'alpha',0,repeat('6',64)),
    (release_id,'bede62e8-6e4d-4d3b-8227-34b73451b3a4','store','Synthetic Store','synthetic-brand','Synthetic B',36,126,'Region B',null,
      null,'[]','store_only','Synthetic store only','https://example.invalid/store','synthetic store sandwich salad',0,repeat('7',64)),
    (release_id,'c4e1cffb-2658-4ad4-8e38-c8c12a11c627','future','Future Place',null,'Synthetic C',38,128,'Region A',null,
      null,'[]','menu_evidence',null,null,'future place synthetic c',1,repeat('8',64)),
    (release_id,'75708968-2839-4eba-8b44-f613de821d6c','split','Alpha Split',null,'Synthetic D',37.1,127.1,'Region A',null,
      null,'[]','menu_evidence',null,null,'alpha split synthetic d',2,repeat('9',64));
  insert into discovery_admin.menus(
    release_id,id,place_id,name,facts,branch_applicability,applicability_notice,
    selection_eligible,discovery_tags,ingredients,searchable_text,source_order,
    valid_from,valid_until,row_sha256
  ) values
    (release_id,'10000000-0000-4000-8000-000000000101','bc6b1050-539e-4d28-8493-5920eae54248','Literal %_ Chicken',
      '{"scope":"meal","form":"rice","ingredients":["chicken"],"rice_base":"unknown","base_is_option":false,"dietary":"unknown","ordering_note":null,"cooking":[],"selection_reasons":[{"kind":"salad_poke","basis":"menu_name","text":"synthetic"}]}',
      'branch_confirmed',null,true,array['rice'],array['chicken'],'alpha synthetic a literal %_ chicken 닭',2,'2026-01-01Z','2026-01-10 12:00Z',repeat('e',64)),
    (release_id,'10000000-0000-4000-8000-000000000102','bc6b1050-539e-4d28-8493-5920eae54248','Raw Ineligible',
      '{"scope":"meal"}','branch_confirmed',null,false,'{}','{}','alpha raw ineligible',1,'2026-01-01Z','2026-01-10 14:00Z',repeat('f',64)),
    (release_id,'10000000-0000-4000-8000-000000000103','c4e1cffb-2658-4ad4-8e38-c8c12a11c627','Future Menu',
      '{"scope":"meal"}','brand_common_unverified','Synthetic availability notice',true,array['salad_poke'],array['fish'],'future menu fish',0,'2026-01-10 13:00Z','2026-01-20Z',repeat('0',64)),
    (release_id,'10000000-0000-4000-8000-000000000104','75708968-2839-4eba-8b44-f613de821d6c','Rice Fish',
      '{"scope":"meal"}','branch_confirmed',null,true,array['rice'],array['fish'],'alpha split rice fish',0,'2026-01-01Z','2026-01-20Z',repeat('1',64)),
    (release_id,'10000000-0000-4000-8000-000000000105','75708968-2839-4eba-8b44-f613de821d6c','Salad Chicken',
      '{"scope":"meal"}','branch_confirmed',null,true,array['salad_poke'],array['chicken'],'alpha split salad chicken',1,'2026-01-01Z','2026-01-20Z',repeat('2',64));

  perform public.activate_discovery_release(release_id,9,4,5,source_digest,projection_digest);
  reset role;
end
$$;

create function pg_temp.request_at(p_request jsonb,p_now timestamptz)
returns jsonb language sql as $$
  select discovery_admin.query_at(
    p_request || jsonb_build_object(
      'expectedRelease', state->'releaseId', 'expectedEpoch', state->>'eligibleEpoch'
    ), p_now
  ) from (select discovery_admin.state_at(p_now) as state) as current_state
$$;

do $$
declare
  before_time timestamptz := '2026-01-10 11:59:59.999Z';
  at_time timestamptz := '2026-01-10 12:00:00Z';
  after_time timestamptz := '2026-01-10 12:00:00.001Z';
  future_before timestamptz := '2026-01-10 12:59:59.999Z';
  future_at timestamptz := '2026-01-10 13:00:00Z';
  future_after timestamptz := '2026-01-10 13:00:00.001Z';
  before_state jsonb;
  at_state jsonb;
  after_state jsonb;
  response jsonb;
  cursor text;
  rejected boolean;
  pointer_before text;
begin
  before_state := discovery_admin.state_at(before_time);
  at_state := discovery_admin.state_at(at_time);
  after_state := discovery_admin.state_at(after_time);
  if before_state->>'nextBoundary' <> '2026-01-10T12:00:00.000000Z'
    or before_state->>'eligibleEpoch' = at_state->>'eligibleEpoch'
    or at_state->>'eligibleEpoch' <> after_state->>'eligibleEpoch' then
    raise exception 'valid_until -1/at/+1 boundary or epoch is wrong';
  end if;
  if discovery_admin.state_at(future_before)->>'eligibleEpoch'
      = discovery_admin.state_at(future_at)->>'eligibleEpoch'
    or discovery_admin.state_at(future_at)->>'eligibleEpoch'
      <> discovery_admin.state_at(future_after)->>'eligibleEpoch' then
    raise exception 'future valid_from -1/at/+1 boundary is wrong';
  end if;
  if at_state->>'nextBoundary' <> '2026-01-10T13:00:00.000000Z' then
    raise exception 'next boundary skipped future capture';
  end if;

  response := pg_temp.request_at('{"mode":"places","query":"%_","filter":"all","ingredient":"all","limit":100}',before_time);
  if response#>>'{data,total}' <> '1'
    or response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54248' then
    raise exception 'literal wildcard substring search changed';
  end if;
  response := pg_temp.request_at('{"mode":"places","query":"","filter":"rice","ingredient":"chicken","limit":100}',before_time);
  if response#>>'{data,total}' <> '1' then raise exception 'same-menu filter was not enforced'; end if;
  response := pg_temp.request_at('{"mode":"places","query":"","filter":"all","ingredient":"all","limit":100}',before_time);
  if response#>>'{data,total}' <> '3' then raise exception 'eligible/store query count mismatch'; end if;
  response := pg_temp.request_at('{"mode":"places","query":"","filter":"all","ingredient":"all","limit":100}',at_time);
  if response#>>'{data,total}' <> '2' then raise exception 'expired menu place remained visible'; end if;
  response := pg_temp.request_at('{"mode":"places","query":"","filter":"all","ingredient":"all","limit":100}',future_at);
  if response#>>'{data,total}' <> '3' then raise exception 'future-captured menu did not become visible'; end if;
  response := pg_temp.request_at('{"mode":"places","query":"","filter":"rice","ingredient":"all","limit":100}',before_time);
  if exists (select 1 from jsonb_array_elements(response#>'{data,results}') as item
    where item#>>'{place,listingKind}' = 'store_only') then
    raise exception 'store_only leaked into unsupported filter';
  end if;
  response := pg_temp.request_at('{"mode":"regions","query":"","filter":"all","ingredient":"all","limit":100}',before_time);
  if response#>>'{data,total}' <> '3' or jsonb_array_length(response#>'{data,regions}') <> 2 then
    raise exception 'region aggregation mismatch';
  end if;
  response := pg_temp.request_at('{"mode":"places","query":"alpha","filter":"all","ingredient":"all","limit":1}',before_time);
  if response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54248'
    or response#>>'{data,nextCursor}' is null then raise exception 'relevance or pagination mismatch'; end if;
  cursor := response#>>'{data,nextCursor}';
  response := pg_temp.request_at(jsonb_build_object('mode','places','query','alpha','filter','all','ingredient','all','limit',1,'cursor',cursor),before_time);
  if response#>>'{data,results,0,place,id}' <> '75708968-2839-4eba-8b44-f613de821d6c' then
    raise exception 'cursor continuation mismatch';
  end if;
  response := discovery_admin.detail_at(jsonb_build_object(
    'id','75708968-2839-4eba-8b44-f613de821d6c','expectedRelease',before_state->'releaseId',
    'expectedEpoch',before_state->>'eligibleEpoch'),before_time);
  if response#>>'{data,menus,0,id}' <> '10000000-0000-4000-8000-000000000104'
    or response#>>'{data,menus,1,id}' <> '10000000-0000-4000-8000-000000000105'
    or response#>'{data,place}' ? 'searchable_text' then
    raise exception 'detail source order or safe projection mismatch';
  end if;

  foreach response in array array[
    '{"expectedRelease":"synthetic-release-1","expectedEpoch":"bad","asOf":"2026-01-01Z"}'::jsonb,
    '{"expectedRelease":"synthetic-release-1","expectedEpoch":"bad","unknown":true}'::jsonb,
    '{"expectedRelease":"synthetic-release-1","expectedEpoch":"bad","limit":0}'::jsonb,
    '{"expectedRelease":"synthetic-release-1","expectedEpoch":"bad","south":1}'::jsonb,
    '{"expectedRelease":"synthetic-release-1","expectedEpoch":"bad","cursor":"%%%%"}'::jsonb
  ] loop
    rejected := false;
    begin perform discovery_admin.query_at(response,before_time);
    exception when sqlstate 'PT400' then rejected := true; end;
    if not rejected then raise exception 'malformed request was accepted: %',response; end if;
  end loop;
  rejected := false;
  begin perform discovery_admin.query_at('{"expectedRelease":"stale","expectedEpoch":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}',before_time);
  exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'stale state was accepted'; end if;
  rejected := false;
  begin perform pg_temp.request_at(jsonb_build_object('mode','places','query','alpha','filter','all','ingredient','all','limit',1,'cursor',cursor),future_at);
  exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'stale cursor was accepted after epoch change'; end if;

  select release_id into pointer_before from discovery_admin.state where singleton;
  rejected := false;
  begin
    set local role service_role;
    perform public.activate_discovery_release('synthetic-release-1',9,4,5,repeat('9',64),repeat('8',64));
  exception when sqlstate 'PT409' then rejected := true; end;
  reset role;
  if not rejected or (select release_id from discovery_admin.state where singleton) <> pointer_before then
    raise exception 'altered activation digest changed pointer';
  end if;
  set local role service_role;
  if public.activate_discovery_release('synthetic-release-1',9,4,5,
    (select source_digest from discovery_admin.releases where release_id='synthetic-release-1'),
    (select projection_digest from discovery_admin.releases where release_id='synthetic-release-1'))
    ->>'status' <> 'already_active' then raise exception 'activation replay not idempotent'; end if;
  reset role;
  rejected := false;
  begin
    set local role service_role;
    insert into discovery_admin.releases(
      release_id,source_digest,projection_digest,source_record_count,place_count,menu_count
    ) values ('synthetic-release-1',repeat('f',64),repeat('e',64),9,4,5);
  exception when unique_violation then rejected := true; end;
  reset role;
  if not rejected or (select source_digest from discovery_admin.releases
    where release_id='synthetic-release-1') = repeat('f',64) then
    raise exception 'conflicting same-version release was accepted';
  end if;
end
$$;

do $$
declare rejected boolean;
begin
  rejected := false;
  begin
    set local role anon;
    perform payload from discovery_admin.source_records limit 1;
  exception when insufficient_privilege then rejected := true; end;
  reset role;
  if not rejected then raise exception 'anon raw source read succeeded'; end if;
  rejected := false;
  begin
    set local role anon;
    insert into discovery_admin.source_records(
      release_id,record_kind,id,source_path,source_order,source_sha256,payload
    ) values ('synthetic-release-1','place','10000000-0000-4000-8000-000000000099',
      'synthetic/attack',99,repeat('9',64),'{}');
  exception when insufficient_privilege then rejected := true; end;
  reset role;
  if not rejected then raise exception 'anon raw source insert succeeded'; end if;
  rejected := false;
  begin
    set local role authenticated;
    insert into discovery_admin.state(singleton,release_id) values(true,'synthetic-release-1');
  exception when insufficient_privilege then rejected := true; end;
  reset role;
  if not rejected then raise exception 'authenticated mutation succeeded'; end if;
  rejected := false;
  begin
    set local role discovery_reader;
    perform payload from discovery_admin.source_records limit 1;
  exception when insufficient_privilege then rejected := true; end;
  reset role;
  if not rejected then raise exception 'discovery_reader raw source read succeeded'; end if;
  rejected := false;
  begin
    update discovery_admin.menus set name='changed'
    where release_id='synthetic-release-1' and id='10000000-0000-4000-8000-000000000101';
  exception when sqlstate '55000' then rejected := true; end;
  if not rejected then raise exception 'immutable menu update succeeded'; end if;
end
$$;

set local role anon;
select public.get_discovery_state();
select public.query_discovery(jsonb_build_object(
  'expectedRelease', public.get_discovery_state()->'releaseId',
  'expectedEpoch', public.get_discovery_state()->>'eligibleEpoch',
  'mode','places','query','','filter','all','ingredient','all','limit',1
));
select public.get_discovery_place(jsonb_build_object(
  'expectedRelease', public.get_discovery_state()->'releaseId',
  'expectedEpoch', public.get_discovery_state()->>'eligibleEpoch',
  'id', 'bede62e8-6e4d-4d3b-8227-34b73451b3a4'
));
reset role;

rollback;
