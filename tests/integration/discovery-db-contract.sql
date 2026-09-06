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
      and relation.relname in (
        'releases','source_records','places','menus','state','validity_segments'
      )
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
    or not has_column_privilege(
      'discovery_reader','discovery_admin.validity_segments','eligible_epoch','select'
    )
    or has_table_privilege(
      'discovery_reader','discovery_admin.validity_segments','insert'
    )
    or has_table_privilege('service_role','discovery_admin.validity_segments','insert')
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
  if not (
    select procedure.prosecdef
      and procedure.proowner = (select oid from pg_catalog.pg_roles where rolname='postgres')
      and 'search_path=""' = any(procedure.proconfig)
      and 'statement_timeout=1500ms' = any(procedure.proconfig)
    from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'public.activate_discovery_release(text,integer,integer,integer,text,text)'
    )
  ) or has_function_privilege(
      'authenticated',
      'public.activate_discovery_release(text,integer,integer,integer,text,text)',
      'execute'
    ) then raise exception 'activation does not own trusted segment generation'; end if;
  if exists (
    select 1 from pg_catalog.pg_proc as procedure
    where procedure.oid = pg_catalog.to_regprocedure(
      'discovery_admin.reject_sealed_release_insert()'
    ) and (
      not procedure.prosecdef
      or procedure.proowner <> (select oid from pg_catalog.pg_roles where rolname='postgres')
      or not ('search_path=""' = any(procedure.proconfig))
      or has_function_privilege('service_role',procedure.oid,'execute')
      or has_function_privilege('discovery_reader',procedure.oid,'execute')
    )
  ) then raise exception 'sealed-release trigger function is missing or unsafe'; end if;
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
  helper pg_catalog.pg_proc%rowtype;
begin
  select procedure.* into helper
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'discovery_admin'
    and procedure.oid = pg_catalog.to_regprocedure(
      'discovery_admin.matching_keys_at(text,timestamptz,text,text,text,text,boolean,' ||
      'double precision,double precision,double precision,double precision)'
    );
  if not found
    or helper.prosecdef
    or not ('search_path=""' = any(helper.proconfig))
    or not ('statement_timeout=1500ms' = any(helper.proconfig))
    or not has_function_privilege('discovery_reader',helper.oid,'execute')
    or has_function_privilege('anon',helper.oid,'execute')
    or has_function_privilege('authenticated',helper.oid,'execute') then
    raise exception 'lean discovery matcher is missing or unsafe';
  end if;
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
    ('place','bc6b1050-539e-4d28-8493-5920eae54201'::uuid,repeat('a',64)),
    ('place','c4e1cffb-2658-4ad4-8e38-c8c12a11c603'::uuid,repeat('c',64)),
    ('place','75708968-2839-4eba-8b44-f613de821d04'::uuid,repeat('d',64)),
    ('store','bede62e8-6e4d-4d3b-8227-34b73451b302'::uuid,repeat('b',64))
  ) select encode(extensions.digest(convert_to(string_agg(
      kind || ':' || id::text || ':' || sha, ',' order by kind,id),'UTF8'),'sha256'),'hex')
    into source_digest from records;
  with rows(id,sha) as (values
    ('bc6b1050-539e-4d28-8493-5920eae54201'::uuid,repeat('6',64)),
    ('bede62e8-6e4d-4d3b-8227-34b73451b302'::uuid,repeat('7',64)),
    ('c4e1cffb-2658-4ad4-8e38-c8c12a11c603'::uuid,repeat('8',64)),
    ('75708968-2839-4eba-8b44-f613de821d04'::uuid,repeat('9',64))
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
    (release_id,'place','bc6b1050-539e-4d28-8493-5920eae54201','synthetic/places',0,repeat('a',64),
      '{"latitude":37.123456789012344,"longitude":127.12345678901235}',null,null),
    (release_id,'store','bede62e8-6e4d-4d3b-8227-34b73451b302','synthetic/stores',0,repeat('b',64),'{}',null,null),
    (release_id,'place','c4e1cffb-2658-4ad4-8e38-c8c12a11c603','synthetic/places',1,repeat('c',64),'{}',null,null),
    (release_id,'place','75708968-2839-4eba-8b44-f613de821d04','synthetic/places',2,repeat('d',64),'{}',null,null),
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
    (release_id,'bc6b1050-539e-4d28-8493-5920eae54201','alpha','Alpha',null,'Synthetic A',
      37.123456789012345,127.123456789012345,'Region A',null,
      null,'[]','menu_evidence',null,null,'alpha',0,repeat('6',64)),
    (release_id,'bede62e8-6e4d-4d3b-8227-34b73451b302','store','서브웨이 Synthetic Store','subway','Synthetic B',36,126,'Region B',null,
      null,'[]','store_only','Synthetic store only','https://example.invalid/store','subway 서브웨이 synthetic store sandwich salad',0,repeat('7',64)),
    (release_id,'c4e1cffb-2658-4ad4-8e38-c8c12a11c603','future','Future Place',null,'Synthetic C',38,128,'Region A',null,
      null,'[]','menu_evidence',null,null,'future place synthetic c',1,repeat('8',64)),
    (release_id,'75708968-2839-4eba-8b44-f613de821d04','split','Alpha Split',null,'Synthetic D',37.1,127.1,'Region A',null,
      null,'[]','menu_evidence',null,null,'alpha split synthetic d',2,repeat('9',64));
  insert into discovery_admin.menus(
    release_id,id,place_id,name,facts,branch_applicability,applicability_notice,
    selection_eligible,discovery_tags,ingredients,searchable_text,source_order,
    valid_from,valid_until,row_sha256
  ) values
    (release_id,'10000000-0000-4000-8000-000000000101','bc6b1050-539e-4d28-8493-5920eae54201','Literal %_ Chicken',
      '{"scope":"meal","form":"rice","ingredients":["chicken"],"rice_base":"unknown","base_is_option":false,"dietary":"unknown","ordering_note":null,"cooking":[],"selection_reasons":[{"kind":"salad_poke","basis":"menu_name","text":"synthetic"}]}',
      'branch_confirmed',null,true,array['rice'],array['chicken'],'alpha synthetic a literal %_ chicken 닭',2,'2026-01-01Z','2026-01-10 12:00Z',repeat('e',64)),
    (release_id,'10000000-0000-4000-8000-000000000102','bc6b1050-539e-4d28-8493-5920eae54201','Raw Ineligible',
      '{"scope":"meal"}','branch_confirmed',null,false,'{}','{}','alpha raw ineligible',1,'2026-01-01Z','2026-01-10 14:00Z',repeat('f',64)),
    (release_id,'10000000-0000-4000-8000-000000000103','c4e1cffb-2658-4ad4-8e38-c8c12a11c603','Future Menu',
      '{"scope":"meal"}','brand_common_unverified','Synthetic availability notice',true,array['salad_poke'],array['fish'],'future menu fish',0,'2026-01-10 13:00Z','2026-01-20Z',repeat('0',64)),
    (release_id,'10000000-0000-4000-8000-000000000104','75708968-2839-4eba-8b44-f613de821d04','Rice Fish',
      '{"scope":"meal"}','branch_confirmed',null,true,array['rice'],array['fish'],'alpha split rice fish',0,'2026-01-01Z','2026-01-20Z',repeat('1',64)),
    (release_id,'10000000-0000-4000-8000-000000000105','75708968-2839-4eba-8b44-f613de821d04','  Ｓａｌａｄ   Plain ',
      '{"scope":"meal"}','branch_confirmed',null,true,array['salad_poke'],array['chicken'],'alpha split salad plain chicken',1,'2026-01-01Z','2026-01-20Z',repeat('2',64));

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

create function pg_temp.dynamic_state_at(p_now timestamptz)
returns jsonb language sql stable set search_path = '' as $$
  with active as (
    select state.release_id
    from discovery_admin.state as state
    where state.singleton
  ), current_menus as (
    select menu.id
    from active
    join discovery_admin.menus as menu on menu.release_id = active.release_id
    where menu.valid_from <= p_now and menu.valid_until > p_now
  ), boundary as (
    select min(candidate) as next_boundary
    from active
    join discovery_admin.menus as menu on menu.release_id = active.release_id
    cross join lateral (
      values (case when menu.valid_from > p_now then menu.valid_from end),
        (case when menu.valid_until > p_now then menu.valid_until end)
    ) as boundaries(candidate)
    where candidate is not null
  )
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1',
    'releaseId', active.release_id,
    'eligibleEpoch', encode(extensions.digest(convert_to(
      active.release_id || ':' || coalesce((
        select string_agg(current_menus.id::text, ',' order by current_menus.id)
        from current_menus
      ), ''), 'UTF8'), 'sha256'), 'hex'),
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', case when boundary.next_boundary is null then null else
      to_char(boundary.next_boundary at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end
  )
  from active cross join boundary
  union all
  select jsonb_build_object(
    'schemaVersion', 'discovery-serving-1', 'releaseId', null,
    'eligibleEpoch', encode(extensions.digest(convert_to('empty', 'UTF8'), 'sha256'), 'hex'),
    'evaluatedAt', to_char(p_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'nextBoundary', null
  )
  where not exists (select 1 from active)
  limit 1
$$;

create function pg_temp.cursor_with_offset(p_cursor text,p_offset jsonb)
returns text language sql immutable as $$
  select rtrim(translate(replace(encode(convert_to(jsonb_set(
    convert_from(decode(translate(p_cursor,'-_','+/') ||
      repeat('=', (4 - char_length(p_cursor) % 4) % 4), 'base64'), 'UTF8')::jsonb,
    '{offset}', p_offset
  )::text,'UTF8'),'base64'), E'\n', ''),'+/','-_'), '=')
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
  if before_state <> pg_temp.dynamic_state_at(before_time)
    or at_state <> pg_temp.dynamic_state_at(at_time)
    or after_state <> pg_temp.dynamic_state_at(after_time) then
    raise exception 'precomputed state differs from the dynamic epoch oracle';
  end if;
  if (select count(*) from discovery_admin.validity_segments
      where release_id = 'synthetic-release-1') <> 6
    or (select min(starts_at) from discovery_admin.validity_segments
      where release_id = 'synthetic-release-1') <> '-infinity'::timestamptz
    or (select max(ends_at) from discovery_admin.validity_segments
      where release_id = 'synthetic-release-1') <> 'infinity'::timestamptz then
    raise exception 'synthetic release validity segments are incomplete';
  end if;
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
    or response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54201' then
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
  if response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54201'
    or response#>>'{data,nextCursor}' is null then raise exception 'relevance or pagination mismatch'; end if;
  cursor := response#>>'{data,nextCursor}';
  rejected := false;
  begin perform pg_temp.request_at(jsonb_build_object(
    'mode','places','query','alpha','filter','all','ingredient','all','limit',1,
    'cursor',pg_temp.cursor_with_offset(cursor,'-1'::jsonb)),before_time);
  exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'negative cursor offset was accepted'; end if;
  response := pg_temp.request_at(jsonb_build_object(
    'mode','places','query','alpha','filter','all','ingredient','all','limit',1,
    'cursor',pg_temp.cursor_with_offset(cursor,'2'::jsonb)),before_time);
  if jsonb_array_length(response#>'{data,results}') <> 0
    or response#>'{data,nextCursor}' <> 'null'::jsonb then
    raise exception 'cursor offset equal to total did not return the empty terminal page';
  end if;
  rejected := false;
  begin perform pg_temp.request_at(jsonb_build_object(
    'mode','places','query','alpha','filter','all','ingredient','all','limit',1,
    'cursor',pg_temp.cursor_with_offset(cursor,'3'::jsonb)),before_time);
  exception when sqlstate 'PT409' then rejected := true; end;
  if not rejected then raise exception 'cursor offset beyond total was accepted'; end if;
  response := pg_temp.request_at(jsonb_build_object(
    'mode','places','query','alpha','filter','all','ingredient','all','limit',1,
    'cursor',pg_temp.cursor_with_offset(cursor,'null'::jsonb)),before_time);
  if response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54201'
    or response#>'{data,nextCursor}' = 'null'::jsonb then
    raise exception 'null cursor offset compatibility changed';
  end if;
  rejected := false;
  begin perform pg_temp.request_at(jsonb_build_object(
    'mode','places','query','alpha','filter','all','ingredient','all','limit',1,
    'cursor',pg_temp.cursor_with_offset(cursor,'"bad"'::jsonb)),before_time);
  exception when sqlstate 'PT400' then rejected := true; end;
  if not rejected then raise exception 'non-integer cursor offset was accepted'; end if;
  response := pg_temp.request_at('{"mode":"places","query":"chicken","filter":"all","ingredient":"all","limit":100}',before_time);
  if response#>>'{data,results,0,place,id}' <> 'bc6b1050-539e-4d28-8493-5920eae54201' then
    raise exception 'menu-name relevance was not ranked above other searchable menu fields';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'chicken','all','all',null,false,null,null,null,null
    ) where id='75708968-2839-4eba-8b44-f613de821d04') <> 3 then
    raise exception 'non-name menu search text incorrectly received menu-name relevance';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'salad plain','all','all',null,false,null,null,null,null
    ) where id='75708968-2839-4eba-8b44-f613de821d04') <> 2 then
    raise exception 'NFKC and collapsed-whitespace menu name did not receive menu-name relevance';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'synthetic store','all','all',null,false,null,null,null,null
    ) where id='bede62e8-6e4d-4d3b-8227-34b73451b302') <> 0 then
    raise exception 'exact store name did not receive exact-name relevance';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'store','all','all',null,false,null,null,null,null
    ) where id='bede62e8-6e4d-4d3b-8227-34b73451b302') <> 1 then
    raise exception 'store name substring did not receive name-substring relevance';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'서브웨이 synthetic store','all','all',null,false,null,null,null,null
    ) where id='bede62e8-6e4d-4d3b-8227-34b73451b302') <> 3 then
    raise exception 'displayed store prefix incorrectly changed legacy raw-name relevance';
  end if;
  if (select relevance from discovery_admin.matching_at(
      'synthetic-release-1',before_time,'sandwich','all','all',null,false,null,null,null,null
    ) where id='bede62e8-6e4d-4d3b-8227-34b73451b302') <> 3 then
    raise exception 'store address or category search text incorrectly received name relevance';
  end if;
  response := pg_temp.request_at(jsonb_build_object('mode','places','query','alpha','filter','all','ingredient','all','limit',1,'cursor',cursor),before_time);
  if response#>>'{data,results,0,place,id}' <> '75708968-2839-4eba-8b44-f613de821d04' then
    raise exception 'cursor continuation mismatch';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc as procedure
    join pg_catalog.pg_namespace as namespace on namespace.oid=procedure.pronamespace
    where namespace.nspname='public'
      and procedure.proname in ('get_discovery_state','query_discovery','get_discovery_place')
      and not ('extra_float_digits=1'=any(procedure.proconfig))
  ) then raise exception 'public discovery RPC is missing exact float serialization'; end if;
  set local extra_float_digits = 1;
  response := pg_temp.request_at('{"mode":"places","query":"alpha","filter":"all","ingredient":"all","limit":1}',before_time);
  if response#>>'{data,results,0,place,latitude}' <>
      (select payload->>'latitude' from discovery_admin.source_records
       where source_records.release_id='synthetic-release-1'
         and id='bc6b1050-539e-4d28-8493-5920eae54201')
    or response#>>'{data,results,0,place,longitude}' <>
      (select payload->>'longitude' from discovery_admin.source_records
       where source_records.release_id='synthetic-release-1'
         and id='bc6b1050-539e-4d28-8493-5920eae54201') then
    raise exception 'public RPC coordinate serialization lost source precision';
  end if;
  response := discovery_admin.detail_at(jsonb_build_object(
    'id','75708968-2839-4eba-8b44-f613de821d04','expectedRelease',before_state->'releaseId',
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
  insert into discovery_admin.source_records(
    release_id,record_kind,id,source_path,source_order,source_sha256,payload,
    valid_from,valid_until
  )
  select release_id,record_kind,id,source_path,source_order,source_sha256,payload,
    valid_from,valid_until
  from discovery_admin.source_records
  where source_records.release_id='synthetic-release-1'
    and id='10000000-0000-4000-8000-000000000101'
  on conflict do nothing;
  if (select count(*) from discovery_admin.source_records
      where source_records.release_id='synthetic-release-1') <> 9 then
    raise exception 'idempotent restage changed a sealed release';
  end if;
  rejected := false;
  begin
    insert into discovery_admin.source_records(
      release_id,record_kind,id,source_path,source_order,source_sha256,payload,
      valid_from,valid_until
    ) values (
      'synthetic-release-1','menu','10000000-0000-4000-8000-000000000199',
      'synthetic/late-menu',99,repeat('9',64),'{}','2026-01-01Z','2026-01-20Z'
    );
  exception when sqlstate '55000' then rejected := true; end;
  if not rejected then raise exception 'new row entered a sealed release'; end if;
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
declare
  v_release_id constant text := 'synthetic-boundary-diversity';
  v_empty_release_id constant text := 'synthetic-empty-release';
  source_digest text;
  place_digest text;
  projection_digest text;
  empty_source_digest text;
  empty_place_digest text;
  empty_projection_digest text;
  response jsonb;
begin
  with records(kind,id,sha) as (
    select 'place', '2a8039ba-6862-4bf5-882c-298892e7ca01'::uuid, repeat('a',64)
    union all
    select 'menu', ('20000000-0000-4000-8000-' ||
      lpad((100000 + item)::text,12,'0'))::uuid, repeat('b',64)
    from generate_series(1,32) as item
  )
  select encode(extensions.digest(convert_to(string_agg(
    kind || ':' || id::text || ':' || sha, ',' order by kind,id
  ),'UTF8'),'sha256'),'hex') into source_digest from records;
  select encode(extensions.digest(convert_to(
    'place:2a8039ba-6862-4bf5-882c-298892e7ca01:' || repeat('c',64),
    'UTF8'),'sha256'),'hex') into place_digest;
  with rows(id,sha) as (
    select ('20000000-0000-4000-8000-' ||
      lpad((100000 + item)::text,12,'0'))::uuid, repeat('d',64)
    from generate_series(1,32) as item
  )
  select encode(extensions.digest(convert_to(place_digest || ':' || string_agg(
    'menu:' || id::text || ':' || sha, ',' order by id
  ),'UTF8'),'sha256'),'hex') into projection_digest from rows;

  set local role service_role;
  insert into discovery_admin.releases(
    release_id,source_digest,projection_digest,source_record_count,place_count,menu_count
  ) values (v_release_id,source_digest,projection_digest,33,1,32);
  insert into discovery_admin.source_records(
    release_id,record_kind,id,source_path,source_order,source_sha256,payload,
    valid_from,valid_until
  ) values (
    v_release_id,'place','2a8039ba-6862-4bf5-882c-298892e7ca01',
    'synthetic/diverse-place',0,repeat('a',64),'{}',null,null
  );
  insert into discovery_admin.source_records(
    release_id,record_kind,id,source_path,source_order,source_sha256,payload,
    valid_from,valid_until
  )
  select v_release_id,'menu',('20000000-0000-4000-8000-' ||
      lpad((100000 + item)::text,12,'0'))::uuid,
    'synthetic/diverse-menus',item - 1,repeat('b',64),'{}',
    '2030-01-01Z'::timestamptz + item * interval '1 hour',
    '2030-04-01Z'::timestamptz + item * interval '1 hour'
  from generate_series(1,32) as item;
  insert into discovery_admin.places(
    release_id,id,slug,name,brand_id,address,latitude,longitude,region,phone,
    naver_place_url,media,listing_kind,store_description,official_store_url,
    searchable_text,source_order,row_sha256
  ) values (
    v_release_id,'2a8039ba-6862-4bf5-882c-298892e7ca01','diverse','Diverse',null,
    'Synthetic Diverse',37,127,'Region D',null,null,'[]','menu_evidence',null,null,
    'diverse',0,repeat('c',64)
  );
  insert into discovery_admin.menus(
    release_id,id,place_id,name,facts,branch_applicability,applicability_notice,
    selection_eligible,discovery_tags,ingredients,searchable_text,source_order,
    valid_from,valid_until,row_sha256
  )
  select v_release_id,('20000000-0000-4000-8000-' ||
      lpad((100000 + item)::text,12,'0'))::uuid,
    '2a8039ba-6862-4bf5-882c-298892e7ca01','Diverse ' || item,'{}',
    'branch_confirmed',null,true,'{}','{}','diverse ' || item,item - 1,
    '2030-01-01Z'::timestamptz + item * interval '1 hour',
    '2030-04-01Z'::timestamptz + item * interval '1 hour',repeat('d',64)
  from generate_series(1,32) as item;
  response := public.activate_discovery_release(
    v_release_id,33,1,32,source_digest,projection_digest
  );
  reset role;
  if response <> jsonb_build_object('status','activated','releaseId',v_release_id)
    or (select count(*) from discovery_admin.validity_segments
      where validity_segments.release_id = v_release_id) <> 65 then
    raise exception 'higher-diversity release activation or segment count changed';
  end if;
  if exists (
    with boundaries as (
      select valid_from as boundary from discovery_admin.menus where menus.release_id = v_release_id
      union
      select valid_until from discovery_admin.menus where menus.release_id = v_release_id
    ), probes as (
      select boundary - interval '1 microsecond' as at_time from boundaries
      union select boundary from boundaries
      union select boundary + interval '1 microsecond' from boundaries
      union select '2029-01-01Z'::timestamptz
      union select '2031-01-01Z'::timestamptz
    )
    select 1 from probes
    where discovery_admin.state_at(at_time) <> pg_temp.dynamic_state_at(at_time)
  ) then raise exception 'higher-diversity segment differs from dynamic oracle'; end if;
  set local role service_role;
  if public.activate_discovery_release(
    v_release_id,33,1,32,source_digest,projection_digest
  )->>'status' <> 'already_active' then
    raise exception 'higher-diversity activation replay is not idempotent';
  end if;
  reset role;

  select encode(extensions.digest(convert_to('', 'UTF8'),'sha256'),'hex')
    into empty_source_digest;
  select encode(extensions.digest(convert_to('', 'UTF8'),'sha256'),'hex')
    into empty_place_digest;
  select encode(extensions.digest(convert_to(empty_place_digest || ':', 'UTF8'),'sha256'),'hex')
    into empty_projection_digest;
  set local role service_role;
  insert into discovery_admin.releases(
    release_id,source_digest,projection_digest,source_record_count,place_count,menu_count
  ) values (
    v_empty_release_id,empty_source_digest,empty_projection_digest,0,0,0
  );
  response := public.activate_discovery_release(
    v_empty_release_id,0,0,0,empty_source_digest,empty_projection_digest
  );
  reset role;
  if response <> jsonb_build_object('status','activated','releaseId',v_empty_release_id)
    or (select count(*) from discovery_admin.validity_segments
      where release_id = v_empty_release_id) <> 1
    or discovery_admin.state_at('2035-01-01Z') <> pg_temp.dynamic_state_at('2035-01-01Z')
    or discovery_admin.state_at('2035-01-01Z')->>'nextBoundary' is not null then
    raise exception 'empty release segment or state changed';
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
    set local role service_role;
    insert into discovery_admin.validity_segments(
      release_id,starts_at,ends_at,eligible_epoch
    ) values ('synthetic-empty-release','2000-01-01Z','2001-01-01Z',repeat('0',64));
  exception when insufficient_privilege then rejected := true; end;
  reset role;
  if not rejected then raise exception 'service role wrote derived validity segments'; end if;
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
  'id', 'bede62e8-6e4d-4d3b-8227-34b73451b302'
));
reset role;

rollback;
