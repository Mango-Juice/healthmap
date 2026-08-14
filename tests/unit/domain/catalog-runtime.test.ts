import { afterEach, describe, expect, it, vi } from "vitest"
import {
  createPublicCatalogRuntimeProvider,
  createSupabasePublicCatalogClient,
  PublicCatalogConfigurationError,
} from "../../../lib/catalog/runtime"
import { VALID_MENU_ROW, VALID_PLACE_ROW } from "./fixtures"

afterEach(() => vi.restoreAllMocks())

describe("public catalog runtime provider", () => {
  it("Given no public Supabase configuration, when read, then it returns exactly the committed mock catalog", async () => {
    // Given
    const provider = createPublicCatalogRuntimeProvider({})

    // When
    const catalog = await provider.read()

    // Then
    expect(provider.mode).toBe("mock")
    expect(catalog.places).toHaveLength(5)
    expect(catalog.places.every((place) => place.dataMode === "mock")).toBe(true)
    expect(catalog.menus.every((menu) => menu.dataMode === "mock")).toBe(true)
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
    ] as const

    // When
    const create = () =>
      environments.map((environment) => createPublicCatalogRuntimeProvider(environment))

    // Then
    expect(create).toThrow(PublicCatalogConfigurationError)
  })

  it("Given configured Supabase credentials, when published rows are selected, then the REST contract carries only public queries and auth headers", async () => {
    // Given
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify([VALID_PLACE_ROW])))
      .mockResolvedValueOnce(new Response(JSON.stringify([VALID_MENU_ROW])))
    const client = createSupabasePublicCatalogClient("https://catalog.example.test", "publishable")

    // When
    await Promise.all([client.selectPublishedPlaces(), client.selectPublishedMenus()])

    // Then
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    for (const [url, options] of fetchSpy.mock.calls) {
      expect(url.toString()).toContain("/rest/v1/")
      expect(url.toString()).toContain("published=eq.true")
      expect(options?.headers).toEqual({
        apikey: "publishable",
        authorization: "Bearer publishable",
      })
    }
  })
})
