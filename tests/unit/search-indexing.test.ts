import { afterEach, describe, expect, it, vi } from "vitest"
import robots from "../../app/robots"
import sitemap from "../../app/sitemap"
import { getIndexableSiteUrl } from "../../lib/search-indexing"

const siteUrl = "https://healthmap-hazel.vercel.app/"

afterEach(() => vi.unstubAllEnvs())

describe("public search indexing", () => {
  it("advertises only the canonical home in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_PLAYWRIGHT_TEST", undefined)
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl)

    expect(sitemap()).toEqual([{ url: siteUrl }])
    expect(robots()).toEqual({
      host: siteUrl,
      rules: { userAgent: "*", allow: "/" },
      sitemap: `${siteUrl}sitemap.xml`,
    })
  })

  it.each([
    { NODE_ENV: "development" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "development" },
    { NEXT_PUBLIC_PLAYWRIGHT_TEST: "1" },
    { NEXT_PUBLIC_SITE_URL: undefined },
    { NEXT_PUBLIC_SITE_URL: "http://public.example" },
  ])("keeps non-public or invalid environments closed: %j", (overrides) => {
    const environment = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      NEXT_PUBLIC_SITE_URL: siteUrl,
      NEXT_PUBLIC_PLAYWRIGHT_TEST: undefined,
      ...overrides,
    }
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value)

    expect(getIndexableSiteUrl(environment)).toBeNull()
    expect(sitemap()).toEqual([])
    expect(robots()).toEqual({ rules: { userAgent: "*", disallow: "/" } })
  })

  it("supports a production server outside Vercel and normalizes the canonical URL", () => {
    expect(
      getIndexableSiteUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_SITE_URL: `${siteUrl}?q=test#map`,
      }),
    ).toBe(siteUrl)
  })
})
