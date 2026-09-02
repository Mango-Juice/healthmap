import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const MIGRATION_PATH = "supabase/migrations/20260813000000_create_public_place_catalog.sql"
const MODE_MIGRATION_PATH = "supabase/migrations/20260814000000_add_catalog_data_mode.sql"
const HARDENING_MIGRATION_PATH =
  "supabase/migrations/20260814010000_harden_public_catalog_boundaries.sql"
const SNAPSHOT_MIGRATION_PATH =
  "supabase/migrations/20260821135627_add_catalog_snapshot_promotion.sql"

describe("Supabase place catalog migration contract", () => {
  it("Given a clean checkout, when migrations are inspected, then the catalog migration exists", async () => {
    // Given: a checkout with migrations resolved from the repository root.
    // When: the expected catalog migration is accessed.
    const accessResult = access(MIGRATION_PATH, constants.R_OK)

    // Then: the migration is readable and can be replayed by Supabase CLI.
    await expect(accessResult).resolves.toBeUndefined()
  })

  it("Given the catalog migration, when SQL is inspected, then RLS and published-read policies exist", async () => {
    // Given: the canonical catalog migration.
    const migration = await readFile(MIGRATION_PATH, "utf8")

    // When: executable SQL statements are normalized for contract inspection.
    const normalizedSql = migration.replace(/\s+/g, " ").toLowerCase()

    // Then: both tables enable RLS and expose explicitly named read-only policies.
    expect(normalizedSql).toContain("alter table public.places enable row level security")
    expect(normalizedSql).toContain("alter table public.menus enable row level security")
    expect(normalizedSql).toContain('create policy "published places are publicly readable"')
    expect(normalizedSql).toContain(
      'create policy "published menus of published places are publicly readable"',
    )
  })

  it("Given the ordered mode and hardening migrations, when SQL is inspected, then public rows retain mode and URL boundaries", async () => {
    const [catalogMigration, modeMigration, hardeningMigration] = await Promise.all([
      readFile(MIGRATION_PATH, "utf8"),
      readFile(MODE_MIGRATION_PATH, "utf8"),
      readFile(HARDENING_MIGRATION_PATH, "utf8"),
    ])
    const normalizedCatalogSql = catalogMigration.replace(/\s+/g, " ").toLowerCase()
    const normalizedModeSql = modeMigration.replace(/\s+/g, " ").toLowerCase()
    const normalizedHardeningSql = hardeningMigration.replace(/\s+/g, " ").toLowerCase()

    expect(normalizedModeSql).toContain(
      "constraint menus_place_mode_fk foreign key (place_id, data_mode)",
    )
    expect(normalizedCatalogSql).toContain("published and exists")
    expect(normalizedHardeningSql).toContain("places_production_naver_url_userinfo_check")
    expect(normalizedHardeningSql).toContain("menus_production_evidence_url_userinfo_check")
    expect(normalizedHardeningSql).toContain("strpos(split_part(split_part(naver_place_url")
    expect(normalizedHardeningSql).toContain("strpos(split_part(split_part(evidence_url")
  })

  it("Given the forward catalog snapshot migration, when inspected, then RPC and promotion security are explicit", async () => {
    const migration = await readFile(SNAPSHOT_MIGRATION_PATH, "utf8")
    const sql = migration.replace(/\s+/g, " ").toLowerCase()

    expect(sql).toContain("create type public.verification_method as enum")
    expect(sql).toContain("create or replace function public.get_public_catalog()")
    expect(sql).toContain("security invoker")
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain("revoke all on function public.get_public_catalog() from public")
    expect(sql).toContain("create schema if not exists catalog_admin")
    expect(sql).toContain("create or replace function catalog_admin.promote_catalog_batch")
    expect(sql).toContain("create table catalog_admin.place_approvals")
    expect(sql).toContain("create table catalog_admin.place_rechecks")
    expect(sql).toContain("create table catalog_admin.catalog_versions")
    expect(sql).toContain("create table catalog_admin.catalog_place_memberships")
    expect(sql).toContain("create table catalog_admin.catalog_menu_memberships")
    expect(sql).toContain(
      "manifest_place_count integer not null check (manifest_place_count >= 100)",
    )
    expect(sql).toContain("current_menu.valid_until >= current_date")
    expect(sql).toContain("menu.valid_until >= current_date")
    expect(sql).toContain("valid_until <= verified_at + 90")
    expect(sql).toContain("valid_until <= verified_at + 180")
    expect(sql).toContain("revoke all on schema catalog_admin from public, anon, authenticated")
    expect(sql).toContain("grant usage on schema catalog_admin to service_role")
    expect(sql).toContain(
      "revoke select on table public.places, public.menus from anon, authenticated",
    )
    expect(sql).toContain("create role catalog_reader nologin noinherit")
    expect(sql).toContain("create or replace function catalog_api.read_current_catalog()")
    expect(sql).not.toContain("select * into")
  })
})
