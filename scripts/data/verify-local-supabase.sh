#!/usr/bin/env bash
set -euo pipefail

evidence_dir="${1:-.omo/evidence/f2-final/security-fix}"
mkdir -p "$evidence_dir"
evidence_dir="$(cd "$evidence_dir" && pwd -P)"

temp_base="$(cd "${TMPDIR:-/tmp}" && pwd -P)"
scratch_root="$(mktemp -d "$temp_base/healthmap-catalog-verify.XXXXXX")"
scratch_root="$(cd "$scratch_root" && pwd -P)"
verification_root=""
verification_project_id=""
db_container=""
sql_database="${CATALOG_SQL_DATABASE:-postgres}"
api_url=""
service_role_key=""
auth_user_id=""
fixtures_inserted=false
stack_started=false
stack_start_attempted=false
cleanup_failed=false
cleanup_stop_attempts=0

main_state() {
  if ! docker inspect supabase_db_healthmap-local >/dev/null 2>&1; then
    printf 'absent'
    return
  fi
  local container_id
  local catalog_state
  container_id="$(docker inspect --format '{{.Id}}' supabase_db_healthmap-local)"
  catalog_state="$(docker exec supabase_db_healthmap-local psql -U postgres -d postgres -Atc \
    "select catalog_version || '|' || (select count(*) from public.places) || '|' || (select count(*) from public.menus) from public.catalog_state where singleton" \
    2>/dev/null || printf 'unavailable')"
  printf '%s|%s' "$container_id" "$catalog_state"
}

main_state_before="$(main_state)"
next_state_before="$(if [[ -d .next ]]; then stat -f '%i|%m' .next; else printf 'absent'; fi)"

cleanup() {
  local command_status=$?
  local main_state_after
  local next_state_after
  trap - EXIT INT TERM
  set +e

  for sensitive_file in \
    "$scratch_root/supabase-start.raw" \
    "$scratch_root/auth-admin.json" \
    "$scratch_root/auth-token.json"; do
    if [[ -e "$sensitive_file" ]]; then
      if [[ -f "$sensitive_file" && ! -L "$sensitive_file" \
        && "$sensitive_file" == "$scratch_root"/* ]]; then
        unlink "$sensitive_file" || cleanup_failed=true
      else
        cleanup_failed=true
      fi
    fi
  done

  if [[ -z "$verification_root" && -n "$auth_user_id" && -n "$api_url" \
    && -n "$service_role_key" ]]; then
    curl --silent --show-error --fail --request DELETE \
      --header "apikey: $service_role_key" \
      --header "Authorization: Bearer $service_role_key" \
      "$api_url/auth/v1/admin/users/$auth_user_id" >/dev/null 2>&1 || cleanup_failed=true
  fi

  if [[ -z "$verification_root" && "$fixtures_inserted" == true \
    && -n "$db_container" ]]; then
    docker exec "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$sql_database" \
      -c "delete from public.places where id in (
        '39000000-0000-4000-8000-000000000001',
        '39000000-0000-4000-8000-000000000002',
        '39000000-0000-4000-8000-000000000003',
        '59000000-0000-4000-8000-000000000001'
      )" >/dev/null 2>&1 || cleanup_failed=true
  fi

  if [[ "$stack_start_attempted" == true ]]; then
    cleanup_stop_attempts=1
    if ! pnpm exec supabase stop --project-id "$verification_project_id" --no-backup \
      > "$scratch_root/supabase-stop.log" 2>&1; then
      cleanup_stop_attempts=2
      pnpm exec supabase stop --project-id "$verification_project_id" --no-backup \
        >> "$scratch_root/supabase-stop.log" 2>&1 || cleanup_failed=true
    fi
  fi

  if [[ ! -d "$scratch_root" || -L "$scratch_root" \
    || "$scratch_root" != "$temp_base"/healthmap-catalog-verify.* ]]; then
    cleanup_failed=true
  elif [[ "$cleanup_failed" == false ]]; then
    rm -rf -- "$scratch_root"
  fi

  main_state_after="$(main_state)"
  next_state_after="$(if [[ -d .next ]]; then stat -f '%i|%m' .next; else printf 'absent'; fi)"
  jq -cn \
    --arg mode "$(if [[ -n "$verification_root" ]]; then printf 'disposable'; else printf 'existing-override'; fi)" \
    --argjson cleanupPassed "$([[ "$cleanup_failed" == false ]] && printf true || printf false)" \
    --argjson stopAttempts "$cleanup_stop_attempts" \
    --argjson userDatabaseUnchanged "$([[ "$main_state_before" == "$main_state_after" ]] && printf true || printf false)" \
    --argjson nextUnchanged "$([[ "$next_state_before" == "$next_state_after" ]] && printf true || printf false)" \
    '{mode: $mode, cleanupPassed: $cleanupPassed, stopAttempts: $stopAttempts, userDatabaseUnchanged: $userDatabaseUnchanged, nextUnchanged: $nextUnchanged, secretsRecorded: false}' \
    > "$evidence_dir/cleanup-summary.json"

  if [[ "$cleanup_failed" == true ]]; then
    printf 'local integration cleanup failed; inspect the non-sensitive cleanup summary\n' >&2
    exit 1
  fi
  exit "$command_status"
}
trap cleanup EXIT INT TERM

find_free_port() {
  local candidate="$1"
  while lsof -nP -iTCP:"$candidate" -sTCP:LISTEN >/dev/null 2>&1; do
    candidate=$((candidate + 1))
  done
  printf '%s' "$candidate"
}

use_existing_stack=false
if [[ "${CATALOG_VERIFY_USE_EXISTING_STACK:-0}" == "1" \
  || -n "${CATALOG_SQL_DATABASE+x}" ]]; then
  use_existing_stack=true
fi

if [[ "$use_existing_stack" == true ]]; then
  db_container="${CATALOG_DB_CONTAINER:-supabase_db_healthmap-local}"
  if [[ -z "$sql_database" ]]; then
    printf 'CATALOG_SQL_DATABASE must not be empty\n' >&2
    exit 1
  fi
  if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$db_container")" != "healthy" ]]; then
    printf 'configured database container is not healthy\n' >&2
    exit 1
  fi
  api_override_count=0
  for override_name in \
    CATALOG_VERIFY_API_URL \
    CATALOG_VERIFY_ANON_KEY \
    CATALOG_VERIFY_PUBLISHABLE_KEY \
    CATALOG_VERIFY_SERVICE_ROLE_KEY; do
    if [[ -n "${!override_name:-}" ]]; then
      api_override_count=$((api_override_count + 1))
    fi
  done
  if [[ "$api_override_count" != "0" && "$api_override_count" != "4" ]]; then
    printf 'all CATALOG_VERIFY API/key overrides must be supplied together\n' >&2
    exit 1
  fi
  if [[ "$api_override_count" == "0" ]]; then
    if [[ "$db_container" != "supabase_db_healthmap-local" || "$sql_database" != "postgres" ]]; then
      printf 'custom database overrides require matching CATALOG_VERIFY API/key overrides\n' >&2
      exit 1
    fi
    status_env="$(pnpm exec supabase status -o env 2>/dev/null)"
  else
    api_url="$CATALOG_VERIFY_API_URL"
    anon_key="$CATALOG_VERIFY_ANON_KEY"
    publishable_key="$CATALOG_VERIFY_PUBLISHABLE_KEY"
    service_role_key="$CATALOG_VERIFY_SERVICE_ROLE_KEY"
    status_env=""
  fi
else
  verification_root="$scratch_root/project"
  verification_project_id="healthmap-verify-$$-$RANDOM"
  mkdir -p "$verification_root/supabase"
  cp supabase/config.toml "$verification_root/supabase/config.toml.source"
  cp supabase/seed.sql "$verification_root/supabase/seed.sql"
  cp -R supabase/migrations "$verification_root/supabase/migrations"

  api_port="$(find_free_port $((44000 + $$ % 1000)))"
  db_port="$(find_free_port $((api_port + 1)))"
  shadow_port="$(find_free_port $((db_port + 1)))"
  sed \
    -e "s/^project_id = .*/project_id = \"$verification_project_id\"/" \
    -e "s/^port = 54321$/port = $api_port/" \
    -e "s/^port = 54322$/port = $db_port/" \
    -e "s/^shadow_port = 54320$/shadow_port = $shadow_port/" \
    "$verification_root/supabase/config.toml.source" \
    > "$verification_root/supabase/config.toml"
  unlink "$verification_root/supabase/config.toml.source"

  start_log="$scratch_root/supabase-start.raw"
  stack_start_attempted=true
  if ! pnpm exec supabase start --workdir "$verification_root" \
    --exclude realtime,storage-api,imgproxy,studio,edge-runtime,logflare,vector,supavisor,postgres-meta,mailpit \
    > "$start_log" 2>&1; then
    jq -cn \
      --argjson bytes "$(wc -c < "$start_log")" \
      --arg sha256 "$(shasum -a 256 "$start_log" | awk '{print $1}')" \
      '{stage: "supabase-start", status: "failed", rawBytes: $bytes, rawSha256: $sha256, rawOutputRetained: false}' \
      > "$evidence_dir/start-failure-summary.json"
    printf 'disposable Supabase start failed; raw output was withheld and will be removed\n' >&2
    exit 1
  fi
  stack_started=true
  db_container="supabase_db_$verification_project_id"
  status_env="$(pnpm exec supabase status --workdir "$verification_root" -o env 2>/dev/null)"
  unlink "$start_log"
fi

if [[ -n "$status_env" ]]; then
  api_url="$(printf '%s\n' "$status_env" | sed -n 's/^API_URL="\(.*\)"$/\1/p')"
  anon_key="$(printf '%s\n' "$status_env" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
  publishable_key="$(printf '%s\n' "$status_env" | sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p')"
  service_role_key="$(printf '%s\n' "$status_env" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p')"
fi

if [[ -z "$api_url" || -z "$anon_key" || -z "$publishable_key" || -z "$service_role_key" ]]; then
  printf 'Supabase status omitted a required local endpoint or key\n' >&2
  exit 1
fi

docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$sql_database" \
  < tests/integration/catalog-db-contract.sql > "$evidence_dir/sql-contract.log" 2>&1
docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$sql_database" \
  < tests/integration/catalog-bundle-rpc-contract.sql > "$evidence_dir/bundle-rpc-contract.log" 2>&1
docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$sql_database" \
  < tests/integration/catalog-review-approval-binding-contract.sql \
  > "$evidence_dir/approval-replay-contract.log" 2>&1

docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d "$sql_database" <<'SQL'
do $$
begin
  if exists (
    select 1 from public.places
    where id in (
      '39000000-0000-4000-8000-000000000001',
      '39000000-0000-4000-8000-000000000002',
      '39000000-0000-4000-8000-000000000003',
      '59000000-0000-4000-8000-000000000001'
    )
  ) then
    raise exception using message = 'local verification fixture IDs already exist';
  end if;
end
$$;

insert into public.places (
  id, slug, name, address, latitude, longitude, naver_place_url,
  primary_tag, health_tags, published, data_mode
) values
  ('39000000-0000-4000-8000-000000000001', 'rpc-current-fixture', 'RPC current', 'fixture',
   37.5000, 127.0328, 'https://map.naver.com/p/entry/place/rpc-current', 'balanced',
   array['balanced']::public.health_tag[], true, 'production'),
  ('39000000-0000-4000-8000-000000000002', 'rpc-expired-fixture', 'RPC expired', 'fixture',
   37.5000, 127.0328, 'https://map.naver.com/p/entry/place/rpc-expired', 'balanced',
   array['balanced']::public.health_tag[], true, 'production'),
  ('39000000-0000-4000-8000-000000000003', 'rpc-menu-less-fixture', 'RPC menu-less', 'fixture',
   37.5000, 127.0328, 'https://map.naver.com/p/entry/place/rpc-empty', 'balanced',
   array['balanced']::public.health_tag[], true, 'production');

insert into public.menus (
  id, place_id, name, health_tags, evidence_url, verification_method,
  verified_at, valid_until, display_order, published, data_mode
) values
  ('49000000-0000-4000-8000-000000000001', '39000000-0000-4000-8000-000000000001',
   'RPC current menu', array['balanced']::public.health_tag[], null, 'direct_confirmation',
   current_date - 1, current_date + 89, 0, true, 'production'),
  ('49000000-0000-4000-8000-000000000002', '39000000-0000-4000-8000-000000000002',
   'RPC expired menu', array['balanced']::public.health_tag[], null, 'direct_confirmation',
   current_date - 100, current_date - 10, 0, true, 'production');

insert into catalog_admin.catalog_place_memberships (catalog_version, place_id)
select state.catalog_version, place.id
from public.catalog_state as state
join public.places as place on place.id in (
  '39000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000002',
  '39000000-0000-4000-8000-000000000003'
)
where state.singleton;
insert into catalog_admin.catalog_menu_memberships (catalog_version, menu_id)
select state.catalog_version, menu.id
from public.catalog_state as state
join public.menus as menu on menu.id in (
  '49000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000002'
)
where state.singleton;
SQL
fixtures_inserted=true

auth_email="catalog-verifier-$$-$RANDOM@example.invalid"
auth_password="CatalogVerifier-$RANDOM-$RANDOM!"
auth_admin_file="$scratch_root/auth-admin.json"
auth_admin_status="$(curl --silent --show-error --output "$auth_admin_file" --write-out '%{http_code}' \
  --request POST --header "apikey: $service_role_key" \
  --header "Authorization: Bearer $service_role_key" \
  --header 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$auth_email" --arg password "$auth_password" \
    '{email: $email, password: $password, email_confirm: true}')" \
  "$api_url/auth/v1/admin/users")"
if [[ "$auth_admin_status" != "200" && "$auth_admin_status" != "201" ]]; then
  printf 'disposable authenticated-user creation failed with HTTP %s\n' "$auth_admin_status" >&2
  exit 1
fi
auth_user_id="$(jq -er '.id' "$auth_admin_file")"
unlink "$auth_admin_file"

auth_token_file="$scratch_root/auth-token.json"
auth_token_status="$(curl --silent --show-error --output "$auth_token_file" --write-out '%{http_code}' \
  --request POST --header "apikey: $anon_key" --header 'Content-Type: application/json' \
  --data "$(jq -cn --arg email "$auth_email" --arg password "$auth_password" \
    '{email: $email, password: $password}')" \
  "$api_url/auth/v1/token?grant_type=password")"
if [[ "$auth_token_status" != "200" ]]; then
  printf 'disposable authenticated sign-in failed with HTTP %s\n' "$auth_token_status" >&2
  exit 1
fi
authenticated_token="$(jq -er '.access_token' "$auth_token_file")"
unlink "$auth_token_file"

api_log="$evidence_dir/api-security-matrix.jsonl"
: > "$api_log"

request() {
  local label="$1"
  local key="$2"
  local bearer="$3"
  local method="$4"
  local path="$5"
  local body="$6"
  local response_file="$scratch_root/response-$RANDOM.json"
  local http_status
  local response_body
  local curl_arguments=(
    --silent --show-error --output "$response_file" --write-out '%{http_code}'
    --request "$method" --header "apikey: $key" --header 'Content-Type: application/json'
    --data "$body"
  )
  if [[ -n "$bearer" ]]; then
    curl_arguments+=(--header "Authorization: Bearer $bearer")
  fi
  http_status="$(curl "${curl_arguments[@]}" "$api_url/rest/v1/$path")"
  if [[ -s "$response_file" ]] && jq -e . "$response_file" >/dev/null 2>&1; then
    response_body="$(jq -c . "$response_file")"
  else
    response_body="null"
  fi
  jq -cn --arg label "$label" --arg status "$http_status" --argjson body "$response_body" \
    '{scenario: $label, httpStatus: ($status | tonumber), body: $body}' >> "$api_log"
  unlink "$response_file"
}

request "anon direct places denied" "$anon_key" "" GET 'places?select=slug&order=slug' ''
request "authenticated direct places denied" "$anon_key" "$authenticated_token" GET \
  'places?select=slug&order=slug' ''
request "publishable direct places denied" "$publishable_key" "" GET \
  'places?select=slug&order=slug' ''
request "anon catalog RPC" "$anon_key" "" POST 'rpc/get_public_catalog' '{}'
request "authenticated catalog RPC" "$anon_key" "$authenticated_token" POST \
  'rpc/get_public_catalog' '{}'
request "service catalog RPC" "$service_role_key" "$service_role_key" POST \
  'rpc/get_public_catalog' '{}'
request "anon private reader hidden" "$anon_key" "" POST 'rpc/read_current_catalog' '{}'
request "authenticated private reader hidden" "$anon_key" "$authenticated_token" POST \
  'rpc/read_current_catalog' '{}'
request "service private reader hidden" "$service_role_key" "$service_role_key" POST \
  'rpc/read_current_catalog' '{}'
request "anon write denied" "$anon_key" "" POST 'places' \
  '{"slug":"anon-write","name":"denied","address":"denied","latitude":37.5,"longitude":127.0328,"naver_place_url":"https://map.naver.com/p/entry/place/9","primary_tag":"balanced","health_tags":["balanced"],"published":false,"data_mode":"production"}'
request "authenticated write denied" "$anon_key" "$authenticated_token" POST 'places' \
  '{"slug":"authenticated-write","name":"denied","address":"denied","latitude":37.5,"longitude":127.0328,"naver_place_url":"https://map.naver.com/p/entry/place/10","primary_tag":"balanced","health_tags":["balanced"],"published":false,"data_mode":"production"}'
request "service direct places allowed" "$service_role_key" "$service_role_key" GET \
  'places?select=slug&order=slug' ''
request "service write allowed" "$service_role_key" "$service_role_key" POST 'places' \
  '{"id":"59000000-0000-4000-8000-000000000001","slug":"service-write-fixture","name":"service fixture","address":"fixture","latitude":37.5,"longitude":127.0328,"naver_place_url":"https://map.naver.com/p/entry/place/service-fixture","primary_tag":"balanced","health_tags":["balanced"],"published":false,"data_mode":"production"}'
request "service delete allowed" "$service_role_key" "$service_role_key" DELETE \
  'places?id=eq.59000000-0000-4000-8000-000000000001' ''

jq -e -s '
  (.[0].httpStatus == 401) and
  (.[1].httpStatus == 403) and
  (.[2].httpStatus == 401) and
  ([.[3], .[4]] | all(
    .httpStatus == 200 and
    (.body | keys | sort) == ["catalogVersion", "dataMode", "menus", "places"] and
    .body.dataMode == "production" and
    (.body.places | map(.slug)) == ["rpc-current-fixture"] and
    (.body.menus | map(.name)) == ["RPC current menu"]
  )) and
  (.[5].httpStatus == 403) and
  ([.[6], .[7], .[8]] | all(.httpStatus == 404)) and
  (.[9].httpStatus == 401) and
  (.[10].httpStatus == 403) and
  (.[11].httpStatus == 200 and (.[11].body | map(.slug) | sort) == [
    "rpc-current-fixture", "rpc-expired-fixture", "rpc-menu-less-fixture"
  ]) and
  (.[12].httpStatus == 201) and
  (.[13].httpStatus == 204)
' "$api_log" > "$evidence_dir/api-security-assertion.txt"

jq -cn '{sqlContracts: "passed", restSecurityMatrix: "passed", secretsRecorded: false}' \
  > "$evidence_dir/local-integration-summary.json"
