#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/data/verify-local-db.sh --local

Replays tracked applied migrations in a task-owned PostgreSQL 17 container and
runs the current discovery and suggestion SQL contracts. No host port is opened.
USAGE
}

if [[ "${1:-}" == "--help" && "$#" == 1 ]]; then
  usage
  exit 0
fi
if [[ "${1:-}" != "--local" || "$#" != 1 ]]; then
  usage >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
cd "$repo_root"

image="public.ecr.aws/supabase/postgres:17.6.1.158"
container_name="healthmap-local-db-verify-$$-$RANDOM"
container_id=""

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  if [[ -n "$container_id" ]]; then
    if ! docker rm --force --volumes "$container_id" >/dev/null; then
      printf 'Failed to remove the disposable PostgreSQL container\n' >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT INT TERM
trap 'exit 130' INT
trap 'exit 143' TERM

if ! docker image inspect "$image" >/dev/null 2>&1; then
  printf 'Required PostgreSQL image is unavailable: %s\n' "$image" >&2
  exit 1
fi

container_id="$(docker run --detach --name "$container_name" --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_HOST_AUTH_METHOD=trust "$image")"

for _attempt in {1..30}; do
  if docker exec "$container_id" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$container_id" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
  printf 'Disposable PostgreSQL did not become ready within 30 seconds\n' >&2
  exit 1
fi

postgres_version="$(docker exec "$container_id" psql -X -At -U postgres -d postgres -c 'show server_version_num')"
if [[ ! "$postgres_version" =~ ^17[0-9]{4}$ ]]; then
  printf 'PostgreSQL 17 is required\n' >&2
  exit 1
fi

docker exec -i "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres >/dev/null <<'SQL'
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit nosuperuser nocreatedb nocreaterole noreplication bypassrls;
  end if;
end
$$;
SQL

while IFS= read -r migration; do
  target="/tmp/$(basename "$migration")"
  docker cp "$migration" "$container_id:$target"
  docker exec "$container_id" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$target" >/dev/null
done < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -print | sort)

for contract in \
  tests/integration/discovery-db-contract.sql \
  tests/integration/suggestions-quota.sql \
  tests/integration/suggestions-rls.sql; do
  target="/tmp/$(basename "$contract")"
  docker cp "$contract" "$container_id:$target"
  docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$target" >/dev/null
done

if ! docker rm --force --volumes "$container_id" >/dev/null; then
  printf 'Failed to remove the disposable PostgreSQL container\n' >&2
  exit 1
fi
container_id=""

printf 'LOCAL_DB_CHECKS_PASS\n'
