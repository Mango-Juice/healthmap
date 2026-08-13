import { constants } from "node:fs"
import { access, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

const MIGRATION_PATH = "supabase/migrations/20260813000000_create_public_place_catalog.sql"

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
})
