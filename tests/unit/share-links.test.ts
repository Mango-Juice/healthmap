import { describe, expect, it } from "vitest"
import { buildAbsoluteSiteUrl, getValidatedSiteUrl } from "../../lib/share-links"

describe("absolute public site links", () => {
  it("Given a missing or unsafe site URL, when parsed or shared, then URL generation fails closed", () => {
    // Given
    const unsafe = { NEXT_PUBLIC_SITE_URL: "http://public.example" }

    // When
    const result = {
      missing: getValidatedSiteUrl({}),
      unsafe: getValidatedSiteUrl(unsafe),
      site: buildAbsoluteSiteUrl("privacy", unsafe),
    }

    // Then
    expect(result).toEqual({ missing: null, unsafe: null, site: null })
  })
})
