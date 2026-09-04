import { describe, expect, it } from "vitest"
import type { Place } from "../../../lib/domain/catalog"
import { parsePlaceRows } from "../../../lib/domain/catalog"
import { filterPlaces } from "../../../lib/domain/filter"
import {
  beginLocationRequest,
  DEFAULT_VIEW,
  isInsideDisplayBounds,
  isInsideLocationBounds,
  LOCATION_OPTIONS,
  resolveLocationOutcome,
} from "../../../lib/domain/geo"
import { VALID_PLACE_ROW } from "./fixtures"

describe("map geography", () => {
  it("Given exact contract constants and inclusive edges, when checked, then center, zoom, options, and bounds match", () => {
    // Given
    const displayEdges = [
      { latitude: 37.492, longitude: 127.02 },
      { latitude: 37.5085, longitude: 127.0445 },
    ] as const
    const locationEdges = [
      { latitude: 37.482, longitude: 127.01 },
      { latitude: 37.5185, longitude: 127.0545 },
    ] as const

    // When
    const result = {
      display: displayEdges.map(isInsideDisplayBounds),
      location: locationEdges.map(isInsideLocationBounds),
    }

    // Then
    expect(DEFAULT_VIEW).toEqual({ latitude: 37.5007, longitude: 127.0328, zoom: 15 })
    expect(LOCATION_OPTIONS).toEqual({
      enableHighAccuracy: false,
      timeout: 5000,
      maximumAge: 300000,
    })
    expect(result).toEqual({ display: [true, true], location: [true, true] })
    expect(isInsideLocationBounds({ latitude: -91, longitude: 127.0328 })).toBe(false)
    expect(beginLocationRequest()).toEqual({ kind: "requesting" })
  })

  it("Given browser outcomes, when resolved, then only an in-bounds success requests marker and recenter", () => {
    // Given
    const outcomes = [
      { kind: "success", point: { latitude: 37.5, longitude: 127.0328 } },
      { kind: "success", point: { latitude: 91, longitude: 127.0328 } },
      { kind: "error", code: 1 },
      { kind: "error", code: 3 },
      { kind: "unsupported" },
    ] as const

    // When
    const states = outcomes.map(resolveLocationOutcome)

    // Then
    expect(states).toEqual([
      {
        kind: "inside",
        point: { latitude: 37.5, longitude: 127.0328 },
        recenter: true,
        marker: true,
      },
      { kind: "outside", recenter: false, marker: false },
      { kind: "denied", recenter: false, marker: false },
      { kind: "timeout", recenter: false, marker: false },
      { kind: "unsupported", recenter: false, marker: false },
    ])
  })
})

describe("health tag filtering", () => {
  it("Given multi-tag places, when filtering or resetting, then any matching tag and all places are returned", () => {
    // Given
    const places: readonly Place[] = parsePlaceRows([
      VALID_PLACE_ROW,
      {
        ...VALID_PLACE_ROW,
        id: "bede62e8-6e4d-4d3b-8227-34b73451b3a4",
        slug: "protein-kitchen",
        primary_tag: "protein",
        health_tags: ["protein"],
      },
    ])

    // When
    const result = {
      vegetables: filterPlaces(places, "vegetables").map((place) => place.slug),
      protein: filterPlaces(places, "protein").map((place) => place.slug),
      all: filterPlaces(places, "all").map((place) => place.slug),
    }

    // Then
    expect(result).toEqual({
      vegetables: ["green-table-gangnam"],
      protein: ["protein-kitchen"],
      all: ["green-table-gangnam", "protein-kitchen"],
    })
  })
})
