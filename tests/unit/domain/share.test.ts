import { describe, expect, it } from "vitest"
import { PlaceSlugSchema } from "../../../lib/domain/contracts"
import {
  canonicalizeShareUrl,
  parseShareUrl,
  serializeMapShare,
  serializePlaceShare,
} from "../../../lib/domain/share"

describe("share URL codec", () => {
  it("Given place and map state, when serialized, then exact public canonical URLs are emitted", () => {
    // Given
    const slug = PlaceSlugSchema.parse("green-table-gangnam")

    // When
    const result = {
      place: serializePlaceShare(slug),
      map: serializeMapShare({ latitude: 37.50074, longitude: 127.03284 }, 15, "balanced"),
    }

    // Then
    expect(result).toEqual({
      place: "/?place=green-table-gangnam&src=place_share",
      map: "/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share",
    })
    expect(result.map).not.toContain("37.50074")
    expect(result.map).not.toContain("127.03284")
  })

  it("Given mixed valid state, when parsed, then a valid place takes precedence", () => {
    // Given
    const url = "/?place=green-table-gangnam&lat=bad&lng=127.033&z=999&tag=bad&src=unknown"

    // When
    const state = parseShareUrl(url)

    // Then
    expect(state).toEqual({ kind: "place", slug: "green-table-gangnam", source: "place_share" })
  })

  it("Given malformed, partial, or unknown-source map input, when canonicalized, then invalid pieces fall back", () => {
    // Given
    const inputs = [
      "/?lat=37.5&lng=127.03",
      "/?lat=37.5&lng=nope&z=15&tag=balanced&src=map_share",
      "/?lat=37.5&lng=127.03&z=12&tag=balanced&src=map_share",
      "/?lat=37.5&lng=127.03&z=15&tag=balanced&src=tracker",
      "/?lat=37.5&lat=37.6&lng=127.03&z=15&tag=balanced&src=map_share",
      "/?place=INVALID_%20_SLUG&referrer=https://private.example/path?q=secret",
    ]

    // When
    const canonical = inputs.map(canonicalizeShareUrl)

    // Then
    expect(canonical).toEqual(["/", "/", "/", "/", "/", "/"])
  })

  it("Given a complete valid map share, when parsed and canonicalized, then public precision is stable", () => {
    // Given
    const url = "https://health.example/?lng=127.033&tag=plant_based&z=18&lat=37.501&src=map_share"

    // When
    const result = { state: parseShareUrl(url), canonical: canonicalizeShareUrl(url) }

    // Then
    expect(result).toEqual({
      state: {
        kind: "map",
        center: { latitude: 37.501, longitude: 127.033 },
        zoom: 18,
        tag: "plant_based",
        source: "map_share",
      },
      canonical: "/?lat=37.501&lng=127.033&z=18&tag=plant_based&src=map_share",
    })
  })
})
