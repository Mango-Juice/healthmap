import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const MIGRATION_PATH = "supabase/migrations/20260813000000_create_public_place_catalog.sql"
const MODE_MIGRATION_PATH = "supabase/migrations/20260814000000_add_catalog_data_mode.sql"
const HARDENING_MIGRATION_PATH =
  "supabase/migrations/20260814010000_harden_public_catalog_boundaries.sql"

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
})
