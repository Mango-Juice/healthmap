import { describe, expect, it } from "vitest"
import { createPublicCatalogCache } from "../../../lib/catalog/cache"
import { NEXT_PUBLIC_CATALOG_CACHE_POLICY } from "../../../lib/catalog/next-cache"
import { createPublicCatalogRepository } from "../../../lib/catalog/repository"
import { VALID_MENU_ROW, VALID_PLACE_ROW } from "./fixtures"

class TransientTestError extends Error {
  readonly name = "TransientTestError"
}

describe("public catalog repository", () => {
  it("Given Supabase client rows, when loaded, then the strict public catalog is returned", async () => {
    // Given
    const repository = createPublicCatalogRepository({
      selectPublishedPlaces: async () => [VALID_PLACE_ROW],
      selectPublishedMenus: async () => [VALID_MENU_ROW],
    })

    // When
    const catalog = await repository.getPublicCatalog()

    // Then
    expect(catalog).toMatchObject({
      places: [{ slug: "green-table-gangnam", published: true }],
      menus: [{ name: "두부 채소 한상", published: true }],
    })
  })

  it("Given leaked drafts, orphan menus, or unknown fields, when loaded, then the repository rejects them", async () => {
    // Given
    const clients = [
      {
        selectPublishedPlaces: async () => [{ ...VALID_PLACE_ROW, published: false }],
        selectPublishedMenus: async () => [VALID_MENU_ROW],
      },
      {
        selectPublishedPlaces: async () => [VALID_PLACE_ROW],
        selectPublishedMenus: async () => [
          { ...VALID_MENU_ROW, place_id: "10000000-0000-4000-8000-000000000099" },
        ],
      },
      {
        selectPublishedPlaces: async () => [{ ...VALID_PLACE_ROW, secret: "must-not-cross" }],
        selectPublishedMenus: async () => [VALID_MENU_ROW],
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
      selectPublishedPlaces: async () => [VALID_PLACE_ROW],
      selectPublishedMenus: async () => [
        {
          ...VALID_MENU_ROW,
          data_mode: "mock",
          evidence_url: "https://example.invalid/mock-evidence/mock-mode-mismatch",
        },
      ],
    })

    // When
    const attempt = repository.getPublicCatalog()

    // Then
    await expect(attempt).rejects.toBeDefined()
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
        return { places: [], menus: [] }
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
        return { places: [], menus: [] }
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
