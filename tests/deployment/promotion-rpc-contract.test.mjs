import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

const migrationPath =
  "supabase/migrations/20260822120000_add_atomic_catalog_bundle_promotion_rpc.sql"
const approvalBindingMigrationPath =
  "supabase/migrations/20260822130000_bind_catalog_review_approval.sql"

test("promotion RPC is public-callable only by service_role while catalog_admin stays private", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /create or replace function public\.promote_catalog_bundle/)
  assert.match(sql, /security invoker/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /revoke all on function public\.promote_catalog_bundle[\s\S]+from public/)
  assert.match(
    sql,
    /grant execute on function public\.promote_catalog_bundle[\s\S]+to service_role/,
  )
  assert.doesNotMatch(sql, /grant usage on schema catalog_admin to (?:anon|authenticated)/)
})

test("promotion RPC recomputes exact UTF-8 transport hash and supports rollback dry-run", async () => {
  const sql = await readFile(migrationPath, "utf8")
  assert.match(sql, /digest\(convert_to\(places_jsonl \|\| menus_jsonl, 'UTF8'\), 'sha256'\)/)
  assert.match(sql, /dry_run_validation_complete/)
  assert.match(sql, /exception when sqlstate 'HMDRY'/)
  assert.match(sql, /catalog_admin\.promote_catalog_batch/)
  assert.match(
    sql,
    /case when dry_run then 'validated' else 'promoted' end/,
    "the idempotent promoted-batch path must preserve dry-run validation semantics",
  )
})

test("forward promotion RPC requires an exact stored approval replay", async () => {
  const sql = await readFile(approvalBindingMigrationPath, "utf8")

  assert.match(sql, /create function public\.promote_catalog_bundle/)
  assert.match(sql, /security invoker/)
  assert.match(sql, /set search_path = ''/)
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/)
  assert.match(sql, /pg_catalog\.hashtextextended\(batch_id::text, 0\)/)
  assert.match(sql, /incoming_approvals is distinct from stored_approvals/)
  assert.match(sql, /incoming_rechecks is distinct from stored_rechecks/)
  assert.match(sql, /approval_place_ids is distinct from transport_place_ids/)
  assert.match(sql, /record->>'reviewer' is distinct from reviewer/)
  assert.match(sql, /incoming_recheck_selection is distinct from expected_recheck_selection/)
  assert.match(sql, /catalog_version \|\| ':' \|\| \(line::jsonb->>'id'\)::uuid::text/)
  assert.match(sql, /primary promotion approvals are invalid/)
  assert.match(sql, /independent promotion rechecks are invalid/)
  assert.match(sql, /promoted approval replay mismatch/)
  assert.match(sql, /catalog_admin\.promote_catalog_bundle/)
  assert.doesNotMatch(sql, /review_approval_json|review_approval_sha256|add column/)
  assert.match(
    sql,
    /revoke all on function public\.promote_catalog_bundle\([\s\S]+from public, anon, authenticated/,
  )
  assert.match(
    sql,
    /grant execute on function public\.promote_catalog_bundle\([\s\S]+to service_role/,
  )
})
