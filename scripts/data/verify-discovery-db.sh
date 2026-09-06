#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage: bash scripts/data/verify-discovery-db.sh --local

Runs the explicitly enumerated compatible baseline migrations plus the
discovery-serving migration against a task-owned disposable PostgreSQL 17
container. No host port is published and the container is removed on exit.

Environment:
  DISCOVERY_DB_EVIDENCE_FILE  JSON receipt path
                              (default: .omo/evidence/task-5-harness.json)
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

evidence_file="${DISCOVERY_DB_EVIDENCE_FILE:-.omo/evidence/task-5-harness.json}"
evidence_dir="$(dirname "$evidence_file")"
mkdir -p "$evidence_dir"
evidence_file="$(cd "$evidence_dir" && pwd -P)/$(basename "$evidence_file")"

image="public.ecr.aws/supabase/postgres:17.6.1.158"
container_name="healthmap-discovery-db-verify-$$-$RANDOM"
container_id=""
scratch_root="$(mktemp -d "${TMPDIR:-/tmp}/healthmap-discovery-db.XXXXXX")"
cleanup_complete=false
cleanup_note="not_started"
current_stage="initialization"
current_log=""

baseline_migrations=(
  "supabase/migrations/20260813000000_create_public_place_catalog.sql"
  "supabase/migrations/20260814000000_add_catalog_data_mode.sql"
  "supabase/migrations/20260814010000_harden_public_catalog_boundaries.sql"
  "supabase/migrations/20260821113513_remove_mock_catalog.sql"
  "supabase/migrations/20260821135627_add_catalog_snapshot_promotion.sql"
  "supabase/migrations/20260822120000_add_atomic_catalog_bundle_promotion_rpc.sql"
  "supabase/migrations/20260822130000_bind_catalog_review_approval.sql"
  "supabase/migrations/20260904055749_add_public_v2_reviewed_catalog.sql"
  "supabase/migrations/20260904165055_add_moderated_suggestions.sql"
)
discovery_migration="supabase/migrations/20260905215700_discovery_serving.sql"
parity_migration="supabase/migrations/20260905234327_discovery_read_parity.sql"
contract_file="tests/integration/discovery-db-contract.sql"

sha256() {
  shasum -a 256 "$1" | awk '{print $1}'
}

cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  if [[ -n "$container_id" ]]; then
    local label
    label="$(docker inspect --format '{{index .Config.Labels "healthmap.discovery-db-harness"}}' "$container_id" 2>/dev/null)"
    if [[ "$label" == "$container_name" ]]; then
      docker rm --force --volumes "$container_id" >/dev/null 2>&1
      if ! docker inspect "$container_id" >/dev/null 2>&1; then
        cleanup_complete=true
        cleanup_note="owned_container_removed"
      else
        cleanup_note="owned_container_removal_not_confirmed"
      fi
    else
      cleanup_note="refused_label_mismatch"
    fi
  else
    cleanup_complete=true
    cleanup_note="no_container_remaining"
  fi
  rm -rf -- "$scratch_root"
  exit "$status"
}
trap cleanup EXIT INT TERM

report_failure() {
  local status=$?
  set +e
  printf 'Discovery DB harness failed at stage: %s\n' "$current_stage" >&2
  if [[ -n "$current_log" && -f "$current_log" ]]; then
    rg -m 1 'ERROR:' "$current_log" >&2 || true
    tail -n 30 "$current_log" >&2
  fi
  exit "$status"
}
trap report_failure ERR

require_file() {
  if [[ ! -f "$1" ]]; then
    printf 'Required verification input is missing: %s\n' "$1" >&2
    exit 1
  fi
}

for migration in "${baseline_migrations[@]}" "$discovery_migration" "$parity_migration" "$contract_file"; do
  require_file "$migration"
done

before_status_file="$scratch_root/git-status-before.txt"
after_status_file="$scratch_root/git-status-after.txt"
git --no-optional-locks status --porcelain=v1 > "$before_status_file"

help_probe="$scratch_root/help.txt"
bad_probe="$scratch_root/bad-flag.txt"
bash "$0" --help > "$help_probe"
if bash "$0" --not-a-valid-flag > "$bad_probe" 2>&1; then
  printf 'Malformed command-line probe unexpectedly succeeded\n' >&2
  exit 1
fi
if ! rg -q '^Usage: bash scripts/data/verify-discovery-db\.sh --local$' "$help_probe" \
  || ! rg -q '^Usage: bash scripts/data/verify-discovery-db\.sh --local$' "$bad_probe"; then
  printf 'Command-line help is not useful or malformed-input handling regressed\n' >&2
  exit 1
fi

if ! docker image inspect "$image" >/dev/null 2>&1; then
  printf 'Required disposable PostgreSQL 17 image is unavailable: %s\n' "$image" >&2
  exit 1
fi

container_id="$(docker run --detach --name "$container_name" \
  --label "healthmap.discovery-db-harness=$container_name" \
  --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  "$image")"

ready=false
for _attempt in {1..30}; do
  if docker exec "$container_id" pg_isready -U postgres -d postgres >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if [[ "$ready" != true ]]; then
  printf 'Task-owned PostgreSQL 17 container did not become ready within 30 seconds\n' >&2
  exit 1
fi

server_version_num="$(docker exec "$container_id" psql -X -At -U postgres -d postgres \
  -c 'show server_version_num')"
if [[ ! "$server_version_num" =~ ^17[0-9]{4}$ ]]; then
  printf 'Disposable database is not PostgreSQL 17: %s\n' "$server_version_num" >&2
  exit 1
fi

current_stage="role and extension shim"
current_log="$scratch_root/bootstrap.log"
docker exec -i "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  > "$scratch_root/bootstrap.log" 2>&1 <<'SQL'
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

run_migration() {
  local migration="$1"
  local target="/tmp/$(basename "$migration")"
  current_stage="migration $(basename "$migration")"
  current_log="$scratch_root/$(basename "$migration").log"
  docker cp "$migration" "$container_id:$target"
  docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$target" \
    > "$current_log" 2>&1
}

for migration in "${baseline_migrations[@]}"; do
  run_migration "$migration"
done

privileges_before="$(docker exec "$container_id" psql -X -At -U postgres -d postgres -c "
  select jsonb_build_object(
    'catalogAdmin', jsonb_build_object(
      'anonUsage', has_schema_privilege('anon', 'catalog_admin', 'usage'),
      'authenticatedUsage', has_schema_privilege('authenticated', 'catalog_admin', 'usage'),
      'serviceUsage', has_schema_privilege('service_role', 'catalog_admin', 'usage'),
      'anonImportSelect', has_table_privilege('anon', 'catalog_admin.import_batches', 'select'),
      'authenticatedImportSelect', has_table_privilege('authenticated', 'catalog_admin.import_batches', 'select')
    ),
    'suggestionAdmin', jsonb_build_object(
      'anonUsage', has_schema_privilege('anon', 'suggestion_admin', 'usage'),
      'authenticatedUsage', has_schema_privilege('authenticated', 'suggestion_admin', 'usage'),
      'serviceUsage', has_schema_privilege('service_role', 'suggestion_admin', 'usage'),
      'anonPendingSelect', has_table_privilege('anon', 'suggestion_admin.pending', 'select'),
      'authenticatedPendingSelect', has_table_privilege('authenticated', 'suggestion_admin.pending', 'select'),
      'servicePendingSelect', has_table_privilege('service_role', 'suggestion_admin.pending', 'select')
    )
  )")"

missing_rpc_log="$scratch_root/missing-rpc.log"
if docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -U postgres -d postgres \
  -c 'select public.get_discovery_state();' > "$missing_rpc_log" 2>&1; then
  printf 'Discovery RPC unexpectedly existed before its migration\n' >&2
  exit 1
fi
if ! rg -q '42883|does not exist' "$missing_rpc_log"; then
  printf 'Expected pre-migration undefined-function failure was not observed\n' >&2
  exit 1
fi

unsafe_role_log="$scratch_root/unsafe-reader-role.log"
docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c 'create role discovery_reader login noinherit' >/dev/null
docker cp "$discovery_migration" "$container_id:/tmp/unsafe-$(basename "$discovery_migration")"
if docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=verbose \
  -U postgres -d postgres -f "/tmp/unsafe-$(basename "$discovery_migration")" \
  > "$unsafe_role_log" 2>&1; then
  printf 'Discovery migration accepted an unsafe preexisting reader role\n' >&2
  exit 1
fi
if ! rg -q '42501.*preexisting discovery_reader is not an isolated least-privilege role' \
  "$unsafe_role_log"; then
  printf 'Unsafe preexisting reader role did not fail with the expected SQLSTATE\n' >&2
  exit 1
fi
if docker exec "$container_id" psql -X -At -U postgres -d postgres \
  -c "select count(*) from pg_namespace where nspname='discovery_admin'" | rg -qv '^0$'; then
  printf 'Unsafe reader rejection left a discovery schema behind\n' >&2
  exit 1
fi
docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c 'drop role discovery_reader' >/dev/null

run_migration "$discovery_migration"
run_migration "$parity_migration"

privileges_after="$(docker exec "$container_id" psql -X -At -U postgres -d postgres -c "
  select jsonb_build_object(
    'catalogAdmin', jsonb_build_object(
      'anonUsage', has_schema_privilege('anon', 'catalog_admin', 'usage'),
      'authenticatedUsage', has_schema_privilege('authenticated', 'catalog_admin', 'usage'),
      'serviceUsage', has_schema_privilege('service_role', 'catalog_admin', 'usage'),
      'anonImportSelect', has_table_privilege('anon', 'catalog_admin.import_batches', 'select'),
      'authenticatedImportSelect', has_table_privilege('authenticated', 'catalog_admin.import_batches', 'select')
    ),
    'suggestionAdmin', jsonb_build_object(
      'anonUsage', has_schema_privilege('anon', 'suggestion_admin', 'usage'),
      'authenticatedUsage', has_schema_privilege('authenticated', 'suggestion_admin', 'usage'),
      'serviceUsage', has_schema_privilege('service_role', 'suggestion_admin', 'usage'),
      'anonPendingSelect', has_table_privilege('anon', 'suggestion_admin.pending', 'select'),
      'authenticatedPendingSelect', has_table_privilege('authenticated', 'suggestion_admin.pending', 'select'),
      'servicePendingSelect', has_table_privilege('service_role', 'suggestion_admin.pending', 'select')
    )
  )")"
if [[ "$privileges_before" != "$privileges_after" ]]; then
  printf 'Discovery migration changed reviewed or suggestion privilege baseline\n' >&2
  exit 1
fi

contract_target="/tmp/discovery-db-contract.sql"
contract_log="$scratch_root/discovery-db-contract.log"
public_rpc_hardening="$(docker exec "$container_id" psql -X -At -U postgres -d postgres -c "
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', procedure.proname,
    'owner', pg_get_userbyid(procedure.proowner),
    'securityDefiner', procedure.prosecdef,
    'config', coalesce(to_jsonb(procedure.proconfig), '[]'::jsonb)
  ) order by procedure.proname), '[]'::jsonb)
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname in ('get_discovery_state', 'query_discovery', 'get_discovery_place')")"
reader_membership="$(docker exec "$container_id" psql -X -At -U postgres -d postgres -c "
  select coalesce(jsonb_agg(jsonb_build_object(
    'member', member_role.rolname,
    'admin', membership.admin_option,
    'inherit', membership.inherit_option,
    'set', membership.set_option
  ) order by member_role.rolname), '[]'::jsonb)
  from pg_catalog.pg_auth_members as membership
  join pg_catalog.pg_roles as granted_role on granted_role.oid=membership.roleid
  join pg_catalog.pg_roles as member_role on member_role.oid=membership.member
  where granted_role.rolname='discovery_reader'")"
if ! jq -e 'length == 3' >/dev/null <<< "$public_rpc_hardening"; then
  printf 'Expected three public discovery RPC hardening records\n' >&2
  exit 1
fi
printf 'DISCOVERY_RPC_HARDENING %s\n' "$public_rpc_hardening"
printf 'DISCOVERY_READER_MEMBERSHIP %s\n' "$reader_membership"
current_stage="discovery SQL contract"
current_log="$contract_log"
docker cp "$contract_file" "$container_id:$contract_target"
docker exec "$container_id" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -f "$contract_target" \
  > "$contract_log" 2>&1
if [[ "$(sed '/^[[:space:]]*$/d' "$contract_log" | tail -n 1)" != "ROLLBACK" ]]; then
  printf 'Discovery SQL contract did not finish with ROLLBACK\n' >&2
  exit 1
fi

git --no-optional-locks status --porcelain=v1 > "$after_status_file"
if ! cmp -s "$before_status_file" "$after_status_file"; then
  printf 'Verification modified the worktree\n' >&2
  exit 1
fi

if ! docker rm --force --volumes "$container_id" >/dev/null; then
  printf 'Failed to remove the task-owned verification container\n' >&2
  exit 1
fi
if docker inspect "$container_id" >/dev/null 2>&1; then
  printf 'Task-owned verification container still exists after removal\n' >&2
  exit 1
fi
container_id=""
cleanup_complete=true
cleanup_note="owned_container_removed_and_absent"

baseline_json="$(printf '%s\n' "${baseline_migrations[@]}" | jq -R . | jq -sc .)"
baseline_hashes_json="$({ for migration in "${baseline_migrations[@]}"; do
  jq -cn --arg file "$migration" --arg sha256 "$(sha256 "$migration")" '{file: $file, sha256: $sha256}'
done; } | jq -sc .)"
contract_log_sha256="$(sha256 "$contract_log")"
missing_rpc_log_sha256="$(sha256 "$missing_rpc_log")"
unsafe_role_log_sha256="$(sha256 "$unsafe_role_log")"
privileges_before_sha256="$(printf '%s' "$privileges_before" | shasum -a 256 | awk '{print $1}')"

jq -n \
  --arg invocation "bash scripts/data/verify-discovery-db.sh --local" \
  --arg image "$image" \
  --arg serverVersionNum "$server_version_num" \
  --arg discoveryMigration "$discovery_migration" \
  --arg discoveryMigrationSha256 "$(sha256 "$discovery_migration")" \
  --arg parityMigration "$parity_migration" \
  --arg parityMigrationSha256 "$(sha256 "$parity_migration")" \
  --arg contract "$contract_file" \
  --arg contractSha256 "$(sha256 "$contract_file")" \
  --arg contractOutputSha256 "$contract_log_sha256" \
  --arg missingRpcOutputSha256 "$missing_rpc_log_sha256" \
  --arg unsafeRoleOutputSha256 "$unsafe_role_log_sha256" \
  --arg privilegeSnapshotSha256 "$privileges_before_sha256" \
  --argjson baselineMigrations "$baseline_json" \
  --argjson baselineMigrationHashes "$baseline_hashes_json" \
  --argjson publicRpcHardening "$public_rpc_hardening" \
  --argjson unchangedPrivileges "$([[ "$privileges_before" == "$privileges_after" ]] && printf true || printf false)" \
  --argjson worktreeUnchanged "$([[ "$(sha256 "$before_status_file")" == "$(sha256 "$after_status_file")" ]] && printf true || printf false)" \
  --argjson cleanupPassed "$([[ "$cleanup_complete" == true ]] && printf true || printf false)" \
  '{
    task: "task-5-discovery-db-harness",
    outcome: "PASS",
    invocation: $invocation,
    infrastructure: {
      image: $image,
      serverVersionNum: ($serverVersionNum | tonumber),
      taskOwnedContainer: true,
      hostPortsExposed: false,
      existingDatabaseTouched: false,
      hostedDatabaseTouched: false,
      roleShim: {
        adequateFor: ["SQL grants", "RLS role checks", "SECURITY DEFINER ownership"],
        excluded: ["JWT parsing", "GoTrue", "PostgREST routing", "hosted-project behavior"]
      }
    },
    migrationReplay: {
      baselineMigrations: $baselineMigrations,
      baselineMigrationHashes: $baselineMigrationHashes,
      discoveryMigration: $discoveryMigration,
      discoveryMigrationSha256: $discoveryMigrationSha256,
      parityMigration: $parityMigration,
      parityMigrationSha256: $parityMigrationSha256,
      preMigrationMissingRpc: {status: "PASS", expectedSqlState: "42883", classification: "undefined_function", outputSha256: $missingRpcOutputSha256},
      unsafePreexistingReader: {status: "PASS", expectedSqlState: "42501", schemaCreated: false, outputSha256: $unsafeRoleOutputSha256},
      discoveryContract: {status: "PASS", finalObservable: "ROLLBACK", file: $contract, fileSha256: $contractSha256, outputSha256: $contractOutputSha256},
      publicRpcHardening: $publicRpcHardening
    },
    preservation: {
      reviewedAndSuggestionPrivilegesUnchanged: $unchangedPrivileges,
      snapshotSha256: $privilegeSnapshotSha256,
      worktreeUnchanged: $worktreeUnchanged
    },
    cliSurface: {help: {exitCode: 0, useful: true}, malformedFlag: {exitCode: 2, rejected: true}, positive: {exitCode: 0, passed: true}},
    adversarial: {
      malformed_input: {status: "PASS", evidence: "malformed CLI flag rejects; SQL contract exercises malformed RPC requests"},
      prompt_injection: {status: "N_A", reason: "the harness accepts one fixed flag and does not interpret prompts or user-provided SQL"},
      cancel_resume: {status: "N_A", reason: "a disposable verification is intentionally non-resumable; EXIT/INT/TERM cleanup removes its labelled resource and a new run starts empty"},
      stale_state: {status: "PASS", evidence: "discovery SQL contract invocation includes the schema worker stale-state assertions"},
      dirty_worktree: {status: "PASS", evidence: "before/after porcelain hashes matched"},
      hung_long_commands: {status: "PASS", evidence: "container readiness has an explicit 30-second bound"},
      flaky_tests: {status: "N_A", reason: "one deterministic disposable replay is required; retries would mask migration failures"},
      misleading_success_output: {status: "PASS", evidence: "success requires expected pre-migration failure, contract exit zero, final ROLLBACK, equal privilege snapshot, and confirmed cleanup"},
      repeated_interruptions: {status: "N_A", reason: "the same idempotent label-checked cleanup trap handles repeated signals; injecting signals would intentionally terminate the only verification run"}
    },
    cleanup: {status: "PASS", receipt: "owned labelled container removed and docker inspect confirmed absence", cleanupPassed: $cleanupPassed, secretsRecorded: false}
  }' > "$evidence_file"

if ! jq -e '.outcome == "PASS" and .cleanup.cleanupPassed and .preservation.worktreeUnchanged and .preservation.reviewedAndSuggestionPrivilegesUnchanged' "$evidence_file" >/dev/null; then
  printf 'Verification receipt did not satisfy completion invariants\n' >&2
  exit 1
fi

printf 'DISCOVERY_DB_HARNESS_PASS %s\n' "$evidence_file"
