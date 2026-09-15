-- Keep the managed supabase_admin grant separate from this temporary membership.
grant discovery_reader to postgres granted by postgres;
grant create on schema public to discovery_reader;
set local role discovery_reader;

create or replace function public.query_discovery(p_request jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set statement_timeout = '1500ms'
set extra_float_digits = '1'
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_request jsonb := p_request;
  v_state jsonb;
  v_mode text;
  v_error_message text;
begin
  if jsonb_typeof(p_request) = 'object'
      and not (p_request ? 'expectedRelease')
      and not (p_request ? 'expectedEpoch') then
    v_state := discovery_admin.state_at(v_now);
    v_request := p_request || jsonb_build_object(
      'expectedRelease', v_state->'releaseId',
      'expectedEpoch', v_state->>'eligibleEpoch'
    );
  end if;

  begin
    return discovery_admin.query_at(v_request, v_now);
  exception when sqlstate 'PT409' then
    get stacked diagnostics v_error_message = message_text;
    v_state := discovery_admin.state_at(v_now);
    -- query_at compares JSON null with SQL null before reaching its empty branch.
    -- Preserve its input validation and recover only a matching empty state.
    if v_error_message = '{"error":"stale_state","retry":true}'
        and v_state->'releaseId' = 'null'::jsonb
        and v_request ?& array['expectedRelease','expectedEpoch']
        and v_request->'expectedRelease' = 'null'::jsonb
        and v_request->>'expectedEpoch' is not distinct from v_state->>'eligibleEpoch' then
      v_mode := coalesce(v_request->>'mode', 'places');
      return v_state || jsonb_build_object(
        'data', case when v_mode = 'regions' then
          jsonb_build_object('catalogVersion','empty','total',0,'regions','[]'::jsonb)
        else jsonb_build_object('catalogVersion','empty','sortBasis','catalog_center',
          'sortOrigin',null,'total',0,'results','[]'::jsonb,'nextCursor',null)
        end
      );
    end if;
    raise;
  end;
end
$$;

alter function public.query_discovery(jsonb) owner to discovery_reader;
revoke all on function public.query_discovery(jsonb) from public, anon, authenticated;
grant execute on function public.query_discovery(jsonb) to anon, authenticated, service_role;

reset role;
revoke create on schema public from discovery_reader;
revoke discovery_reader from postgres granted by postgres;
