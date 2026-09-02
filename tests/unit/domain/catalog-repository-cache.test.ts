import { describe, expect, it } from "vitest"
import { createPublicCatalogCache } from "../../../lib/catalog/cache"
import { NEXT_PUBLIC_CATALOG_CACHE_POLICY } from "../../../lib/catalog/next-cache"
import {
  createPublicCatalogRepository,
  PublicCatalogIntegrityError,
} from "../../../lib/catalog/repository"
import { VALID_CATALOG_SNAPSHOT } from "./fixtures"

class TransientTestError extends Error {
  readonly name = "TransientTestError"
}

describe("public catalog repository", () => {
  it("Given Supabase client rows, when loaded, then the strict public catalog is returned", async () => {
    // Given
    const repository = createPublicCatalogRepository({
      getPublicCatalogSnapshot: async () => VALID_CATALOG_SNAPSHOT,
    })

    // When
    const catalog = await repository.getPublicCatalog()

    // Then
    expect(catalog).toMatchObject({
      catalogVersion: "2026-08-21.1",
      places: [{ slug: "green-table-gangnam", published: true }],
      menus: [{ name: "두부 채소 한상", published: true }],
    })
  })

  it("Given leaked drafts, orphan menus, or unknown fields, when loaded, then the repository rejects them", async () => {
    // Given
    const clients = [
      { getPublicCatalogSnapshot: async () => ({ ...VALID_CATALOG_SNAPSHOT, secret: "no" }) },
      {
        getPublicCatalogSnapshot: async () => ({
          ...VALID_CATALOG_SNAPSHOT,
          menus: [{ ...VALID_CATALOG_SNAPSHOT.menus[0], published: false }],
        }),
      },
      {
        getPublicCatalogSnapshot: async () => ({
          ...VALID_CATALOG_SNAPSHOT,
          menus: [
            {
              ...VALID_CATALOG_SNAPSHOT.menus[0],
              placeId: "10000000-0000-4000-8000-000000000099",
            },
          ],
        }),
      },
    ] as const

    // When
    const attempts = clients.map((client) =>
      createPublicCatalogRepository(client).getPublicCatalog(),
    )

    // Then
    await expect(Promise.all(attempts)).rejects.toBeDefined()
  })

  it("Given a menu with a mode distinct from its parent, when loaded, then the repository rejects it", async () => {
    // Given
    const repository = createPublicCatalogRepository({
      getPublicCatalogSnapshot: async () => ({
        ...VALID_CATALOG_SNAPSHOT,
        menus: [{ ...VALID_CATALOG_SNAPSHOT.menus[0], dataMode: "mock" }],
      }),
    })

    // When
    const attempt = repository.getPublicCatalog()

    // Then
    await expect(attempt).rejects.toBeDefined()
  })

  it("Given a returned place with no current menu, when loaded, then the repository rejects it", async () => {
    // Given
    const repository = createPublicCatalogRepository({
      getPublicCatalogSnapshot: async () => ({ ...VALID_CATALOG_SNAPSHOT, menus: [] }),
    })

    // When
    const attempt = repository.getPublicCatalog()

    // Then
    await expect(attempt).rejects.toBeInstanceOf(PublicCatalogIntegrityError)
  })
})

describe("five-minute public catalog cache", () => {
  it("Given a controllable clock, when the cache becomes stale or is invalidated, then it refetches exactly once", async () => {
    // Given
    let now = 0
    let reads = 0
    const repository = {
      getPublicCatalog: async () => {
        reads += 1
        return {
          catalogVersion: "cache-test",
          dataMode: "production" as const,
          places: [],
          menus: [],
        }
      },
    }
    const cache = createPublicCatalogCache(repository, { nowMilliseconds: () => now })

    // When
    await cache.get()
    now = 299_999
    await cache.get()
    now = 300_000
    await cache.get()
    cache.invalidate()
    await cache.get()

    // Then
    expect(reads).toBe(3)
    expect(NEXT_PUBLIC_CATALOG_CACHE_POLICY).toEqual({
      revalidateSeconds: 300,
      tag: "public-catalog",
    })
  })

  it("Given concurrent reads and a transient failure, when retried, then loads are deduplicated and failures do not poison the cache", async () => {
    // Given
    let reads = 0
    let shouldFail = true
    const repository = {
      getPublicCatalog: async () => {
        reads += 1
        if (shouldFail) throw new TransientTestError("transient test failure")
        return {
          catalogVersion: "cache-test",
          dataMode: "production" as const,
          places: [],
          menus: [],
        }
      },
    }
    const cache = createPublicCatalogCache(repository, { nowMilliseconds: () => 0 })

    // When
    const firstAttempts = Promise.all([cache.get(), cache.get()])
    await expect(firstAttempts).rejects.toThrow("transient test failure")
    shouldFail = false
    await Promise.all([cache.get(), cache.get()])

    // Then
    expect(reads).toBe(2)
  })
})
