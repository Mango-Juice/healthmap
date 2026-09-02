import { describe, expect, it } from "vitest"
import { PlaceSlugSchema } from "../../lib/domain/contracts"
import type { MapShareQuery } from "../../lib/domain/share-query"
import {
  buildAbsoluteMapShareUrl,
  buildAbsolutePlaceShareUrl,
  getValidatedSiteUrl,
} from "../../lib/share-links"

const productionEnvironment = {
  NEXT_PUBLIC_SITE_URL: "https://healthmap.example/base/",
}

describe("absolute public share links", () => {
  it("Given a validated public site URL, when a place link is built, then it is absolute and canonical", () => {
    // Given
    const slug = PlaceSlugSchema.parse("green-table-gangnam")

    // When
    const result = buildAbsolutePlaceShareUrl(slug, productionEnvironment)

    // Then
    expect(result).toBe("https://healthmap.example/base/places/green-table-gangnam")
  })

  it("Given a validated public site URL, when a map link is built, then only canonical discovery keys are emitted", () => {
    // Given
    const state = {
      q: "  두부   BOWL ",
      tag: "balanced",
      lat: 37.5,
      lng: 127.03,
      z: 15,
    } satisfies MapShareQuery

    // When
    const result = buildAbsoluteMapShareUrl(state, productionEnvironment)

    // Then
    expect(result).toBe(
      "https://healthmap.example/base/?q=%EB%91%90%EB%B6%80+bowl&tag=balanced&lat=37.5&lng=127.03&z=15",
    )
  })

  it("Given a missing or unsafe site URL, when parsed or shared, then URL generation fails closed", () => {
    // Given
    const unsafe = { NEXT_PUBLIC_SITE_URL: "http://public.example" }

    // When
    const result = {
      missing: getValidatedSiteUrl({}),
      unsafe: getValidatedSiteUrl(unsafe),
      share: buildAbsolutePlaceShareUrl(PlaceSlugSchema.parse("green-table-gangnam"), unsafe),
    }

    // Then
    expect(result).toEqual({ missing: null, unsafe: null, share: null })
  })
})
