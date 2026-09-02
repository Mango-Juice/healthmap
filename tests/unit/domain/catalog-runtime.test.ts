import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPublicCatalogRuntimeProvider,
  createSupabasePublicCatalogClient,
  getPublicCatalogCacheIdentity,
  PublicCatalogConfigurationError,
} from "../../../lib/catalog/runtime"
import { VALID_CATALOG_SNAPSHOT } from "./fixtures"

afterEach(() => vi.restoreAllMocks())

describe("public catalog runtime provider", () => {
  it("Given no public Supabase configuration, when creating the provider, then it fails closed", () => {
    expect(() => createPublicCatalogRuntimeProvider({})).toThrow(PublicCatalogConfigurationError)
  })

  it("Given a whitespace-only Supabase URL without a key, when creating the provider, then it rejects configuration", () => {
    // Given
    const environment = { NEXT_PUBLIC_SUPABASE_URL: "   " }

    // When
    const create = () => createPublicCatalogRuntimeProvider(environment)

    // Then
    expect(create).toThrow(PublicCatalogConfigurationError)
  })

  it("Given partial or malformed public Supabase configuration, when creating the provider, then it rejects configuration", () => {
    // Given
    const environments = [
      { NEXT_PUBLIC_SUPABASE_URL: "https://catalog.example.test" },
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable" },
      {
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
      },
      {
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        NEXT_PUBLIC_SUPABASE_URL: "http://catalog.example.test",
      },
    ] as const

    // When
    const create = () =>
      environments.map((environment) => createPublicCatalogRuntimeProvider(environment))

    // Then
    expect(create).toThrow(PublicCatalogConfigurationError)
  })

  it("Given a loopback public Supabase origin, when the provider is created, then it rejects the non-HTTPS runtime endpoint", () => {
    // Given
    const environment = {
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    }

    // When
    const create = () => createPublicCatalogRuntimeProvider(environment)

    // Then
    expect(create).toThrow(PublicCatalogConfigurationError)
  })

  it("Given configured Supabase credentials, when the catalog is read, then one RPC snapshot is requested without wildcard selectors", async () => {
    // Given
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(VALID_CATALOG_SNAPSHOT)))
    const client = createSupabasePublicCatalogClient("https://catalog.example.test", "publishable")

    // When
    await client.getPublicCatalogSnapshot()

    // Then
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    for (const [url, options] of fetchSpy.mock.calls) {
      expect(url.toString()).toBe("https://catalog.example.test/rest/v1/rpc/get_public_catalog")
      expect(url.toString()).not.toContain("select=*")
      expect(options?.method).toBe("POST")
      expect(options?.headers).toEqual({
        apikey: "publishable",
        authorization: "Bearer publishable",
        "content-type": "application/json",
      })
    }
  })

  it("Given configured catalog origins and key rotation, when cache identities are derived, then origin changes isolate cache while credentials do not", () => {
    // Given
    const firstOrigin = "https://first-catalog.example.test/"
    const secondOrigin = "https://second-catalog.example.test/"

    // When
    const firstIdentity = getPublicCatalogCacheIdentity(firstOrigin)
    const rotatedKeyIdentity = getPublicCatalogCacheIdentity(firstOrigin)
    const secondIdentity = getPublicCatalogCacheIdentity(secondOrigin)

    // Then
    expect(firstIdentity).toBe(rotatedKeyIdentity)
    expect(firstIdentity).not.toBe(secondIdentity)
    expect(firstIdentity).not.toContain("first-catalog.example.test")
  })
})
