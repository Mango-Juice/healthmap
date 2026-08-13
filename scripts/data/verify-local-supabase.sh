#!/usr/bin/env bash
set -euo pipefail

evidence_dir="${1:-.omo/evidence/task-3}"
mkdir -p "$evidence_dir"

db_container="supabase_db_healthmap-local"
if [[ "$(docker inspect --format '{{.State.Health.Status}}' "$db_container")" != "healthy" ]]; then
  printf 'database container is not healthy\n' >&2
  exit 1
fi

status_env="$(pnpm exec supabase status -o env 2>/dev/null)"
api_url="$(printf '%s\n' "$status_env" | sed -n 's/^API_URL="\(.*\)"$/\1/p')"
anon_key="$(printf '%s\n' "$status_env" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')"
publishable_key="$(printf '%s\n' "$status_env" | sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p')"

if [[ -z "$api_url" || -z "$anon_key" || -z "$publishable_key" ]]; then
  printf 'Supabase status omitted a required local endpoint or public key\n' >&2
  exit 1
fi

docker exec -i "$db_container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres \
  < tests/integration/catalog-db-contract.sql \
  > "$evidence_dir/sql-contract.log" 2>&1

api_log="$evidence_dir/anon-api-results.jsonl"
: > "$api_log"

request() {
  local label="$1"
  local key="$2"
  local method="$3"
  local path="$4"
  local body="$5"
  local response_file
  local http_status
  response_file="$(mktemp)"
  http_status="$(curl --silent --show-error --output "$response_file" --write-out '%{http_code}' \
    --request "$method" \
    --header "apikey: $key" \
    --header 'Content-Type: application/json' \
    --data "$body" \
    "$api_url/rest/v1/$path")"
  jq -cn \
    --arg label "$label" \
    --arg status "$http_status" \
    --argjson body "$(cat "$response_file")" \
    '{scenario: $label, http_status: ($status | tonumber), body: $body}' >> "$api_log"
  unlink "$response_file"
}

request "anon published places only" "$anon_key" GET 'places?select=slug&order=slug' ''
request "anon published menus with published parents only" "$anon_key" GET 'menus?select=name&order=display_order' ''
request "publishable key published places only" "$publishable_key" GET 'places?select=slug&order=slug' ''
request "anon insert denied" "$anon_key" POST 'places' \
  '{"slug":"anon-write","name":"denied","address":"denied","latitude":37.5,"longitude":127.0328,"naver_place_url":"https://map.naver.com/p/entry/place/9","primary_tag":"balanced","health_tags":["balanced"],"published":false}'
request "anon update denied" "$anon_key" PATCH 'places?slug=eq.sentinel-published-place' \
  '{"name":"tampered"}'
request "anon delete denied" "$anon_key" DELETE 'places?slug=eq.sentinel-published-place' ''
request "publishable insert denied" "$publishable_key" POST 'places' \
  '{"slug":"publishable-write","name":"denied","address":"denied","latitude":37.5,"longitude":127.0328,"naver_place_url":"https://map.naver.com/p/entry/place/10","primary_tag":"balanced","health_tags":["balanced"],"published":false}'

jq -e -s '
  (.[0].http_status == 200 and .[0].body == [{"slug":"sentinel-published-place"}]) and
  (.[1].http_status == 200 and .[1].body == [{"name":"통합 테스트 게시 메뉴"}]) and
  (.[2].http_status == 200 and .[2].body == [{"slug":"sentinel-published-place"}]) and
  (.[3].http_status >= 400 and .[4].http_status >= 400 and .[5].http_status >= 400) and
  (.[6].http_status >= 400)
' "$api_log" > "$evidence_dir/anon-api-assertion.txt"

printf '{"sql_contract":"passed","anon_api":"passed","secrets_recorded":false}\n' \
  > "$evidence_dir/local-integration-summary.json"
