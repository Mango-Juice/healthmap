import { describe, expect, it } from "vitest"
import { parsePlaceRows } from "../../../lib/domain/catalog"
import {
  buildNaverRouteDirections,
  buildProductionDirections,
} from "../../../lib/domain/directions"
import { VALID_PLACE_ROW } from "./fixtures"

describe("production directions boundary", () => {
  it("Given a validated discovery destination, when a route is built, then no stored provider response is required", () => {
    const result = buildNaverRouteDirections({
      latitude: 37.501,
      longitude: 127.033,
      name: "무지개수프",
    })

    expect(result).toEqual({
      kind: "route",
      source: "naver_route",
      url: `https://map.naver.com/index.nhn?elng=127.033&elat=37.501&etext=${encodeURIComponent("무지개수프")}&menu=route`,
    })
  })

  it("Given a production place with a complete target, when directions are built, then it returns a NAVER destination route", () => {
    // Given
    const place = parsePlaceRows([VALID_PLACE_ROW])[0]

    // When
    const result = place === undefined ? undefined : buildProductionDirections(place)

    // Then
    expect(result).toMatchObject({ kind: "route", source: "naver_route" })
    expect(result?.url).toContain("map.naver.com/index.nhn?")
    expect(result?.url).toContain("menu=route")
  })

  it("Given a production place whose route target is incomplete, when directions are built, then its stored NAVER URL is used", () => {
    // Given
    const place = parsePlaceRows([VALID_PLACE_ROW])[0]

    // When
    const result =
      place === undefined ? undefined : buildProductionDirections(place, { kind: "place" })

    // Then
    expect(result).toEqual({
      kind: "place",
      source: "naver_place",
      url: "https://map.naver.com/p/entry/place/900000",
    })
  })

  it("Given a malformed route coordinate, when directions are built, then the stored NAVER place URL is used", () => {
    // Given
    const place = parsePlaceRows([VALID_PLACE_ROW])[0]

    // When
    const result =
      place === undefined
        ? undefined
        : buildProductionDirections(place, {
            kind: "route",
            latitude: Number.NaN,
            longitude: Number.NaN,
          })

    // Then
    expect(result).toEqual({
      kind: "place",
      source: "naver_place",
      url: VALID_PLACE_ROW.naver_place_url,
    })
  })
})
