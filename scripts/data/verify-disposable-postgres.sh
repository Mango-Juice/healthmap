#!/usr/bin/env bash
set -euo pipefail

# SQL-only fallback when the full disposable Supabase stack cannot start.
evidence_dir="${1:-.omo/evidence/task7-database/disposable-postgres}"
mkdir -p "$evidence_dir"
evidence_dir="$(cd "$evidence_dir" && pwd -P)"
container_name="healthmap-catalog-sql-verify-$$"
container_id=""
image="public.ecr.aws/supabase/postgres:17.6.1.158"

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$container_id" ]]; then
    if [[ "$(docker inspect --format '{{index .Config.Labels "healthmap.disposable-verification"}}' "$container_id")" != "$container_name" ]]; then
      printf 'Refusing cleanup: disposable container label mismatch\n' >&2
      exit 1
    fi
    docker rm --force --volumes "$container_id" > "$evidence_dir/removed-container.txt"
  fi
  printf '{"disposableContainerRemoved":true,"hostPortsExposed":false,"existingDatabaseReset":false,"sqlOnly":true,"exitCode":%s}\n' "$status" > "$evidence_dir/cleanup.json"
  exit "$status"
}
trap cleanup EXIT INT TERM

container_id="$(docker run --detach --name "$container_name" \
  --label "healthmap.disposable-verification=$container_name" \
  --tmpfs /var/lib/postgresql/data --env POSTGRES_HOST_AUTH_METHOD=trust "$image")"
printf '%s\n' "$container_id" > "$evidence_dir/container-id.txt"
ready=false
for attempt in {1..30}; do
  if docker exec "$container_id" pg_isready -U postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  printf 'Disposable PostgreSQL did not become ready\n' >&2
  exit 1
fi

docker exec "$container_id" psql -U postgres -v ON_ERROR_STOP=1 -Atc \
  "select count(*) from information_schema.tables where table_schema = 'public'" \
  > "$evidence_dir/initial-public-table-count.txt"
if [[ "$(cat "$evidence_dir/initial-public-table-count.txt")" != "0" ]]; then
  printf 'Refusing to mutate a nonempty initial public schema\n' >&2
  exit 1
fi

: > "$evidence_dir/migrations.log"
for migration in supabase/migrations/*.sql; do
  printf '%s\n' "$migration" >> "$evidence_dir/migrations.log"
  docker exec -i "$container_id" psql -U postgres -v ON_ERROR_STOP=1 \
    < "$migration" >> "$evidence_dir/migrations.log" 2>&1
done
for contract in catalog-db-contract catalog-bundle-rpc-contract \
  catalog-review-approval-binding-contract catalog-v2-rpc-contract; do
  docker exec -i "$container_id" psql -U postgres -v ON_ERROR_STOP=1 \
    < "tests/integration/$contract.sql" > "$evidence_dir/$contract.log" 2>&1
done

if [[ -n "${2:-}" ]]; then
  docker exec -i "$container_id" psql -U postgres -v ON_ERROR_STOP=1 \
    < "$2" > "$evidence_dir/additional-rpc-contract.log" 2>&1
fi

docker exec "$container_id" psql -U postgres -v ON_ERROR_STOP=1 -Atc \
  "select json_build_object('places', (select count(*) from public.places), 'menus', (select count(*) from public.menus), 'batches', (select count(*) from catalog_admin.import_batches), 'catalogVersion', (select catalog_version from public.catalog_state), 'anonDirectRead', has_table_privilege('anon','public.places','select'), 'anonWrite', has_table_privilege('anon','public.places','insert'), 'publicTableRls', (select bool_and(relrowsecurity) from pg_class where oid in ('public.places'::regclass,'public.menus'::regclass)))" \
  > "$evidence_dir/final-state.json"
printf 'DISPOSABLE_POSTGRES_SQL_CONTRACTS_PASS\n' > "$evidence_dir/result.txt"
