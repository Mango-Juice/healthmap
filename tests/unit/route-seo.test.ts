import { describe, expect, it } from "vitest"
import {
  buildPlaceMetadata,
  buildSitemapEntries,
  resolvePublishedPlace,
  resolveRootRoute,
} from "../../app/route-seo"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog"
import { e2eCatalog } from "../fixtures/e2e-catalog"

const environment = { NEXT_PUBLIC_SITE_URL: "https://healthmap.example" }
const catalog = PublicCatalogSnapshotSchema.parse(e2eCatalog)

describe("canonical route and SEO contract", () => {
  it("Given canonical and legacy root inputs, when resolved, then valid state is canonicalized and unsafe state is discarded", () => {
    // Given
    const inputs = [
      {},
      { place: "test-sprout-square" },
      { q: " 두부 ", tag: "balanced", lat: "37.500", lng: "127.030", z: "15" },
      { q: "두부", tag: "balanced", lat: "37.5", lng: "127.03", z: "15" },
      { q: ["두부", "샐러드"], tag: "balanced", lat: "37.5", lng: "127.03", z: "15" },
      { q: "두부", tag: "balanced", lat: "37.5", lng: "127.03", z: "15", ref: "private" },
    ] as const

    // When
    const decisions = inputs.map((input) => resolveRootRoute(input, catalog))

    // Then
    expect(decisions).toMatchObject([
      { kind: "render", initialMapState: null },
      { kind: "redirect", destination: "/places/test-sprout-square" },
      {
        kind: "redirect",
        destination: "/?q=%EB%91%90%EB%B6%80&tag=balanced&lat=37.5&lng=127.03&z=15",
      },
      {
        kind: "render",
        initialMapState: {
          center: { latitude: 37.5, longitude: 127.03 },
          query: "두부",
          tag: "balanced",
          zoom: 15,
        },
      },
      { kind: "redirect", destination: "/" },
      { kind: "redirect", destination: "/" },
    ])
  })

  it("Given a single unavailable legacy place slug, when the root route resolves, then it renders for client recovery", () => {
    // Given
    const unavailableLegacyPlace = { place: "not-published" }

    // When
    const decision = resolveRootRoute(unavailableLegacyPlace, catalog)

    // Then
    expect(decision).toEqual({ kind: "render", initialMapState: null })
  })

  it("Given valid nationwide map share centers, when the root route resolves, then it preserves the shared view", () => {
    // Given
    const inputs = [
      { q: "", tag: "all", lat: "0", lng: "0", z: "15" },
      { q: "", tag: "all", lat: "37.4919", lng: "127.02", z: "15" },
    ] as const

    // When
    const decisions = inputs.map((input) => resolveRootRoute(input, catalog))

    // Then
    expect(decisions).toMatchObject([
      { kind: "render", initialMapState: { center: { latitude: 0, longitude: 0 } } },
      { kind: "render", initialMapState: { center: { latitude: 37.4919, longitude: 127.02 } } },
    ])
  })

  it("Given published and unknown slugs, when resolved, then only the published place is returned", () => {
    // Given
    const slugs = ["test-sprout-square", "INVALID SLUG", "missing-place"]

    // When
    const resolved = slugs.map((slug) => resolvePublishedPlace(catalog, slug))

    // Then
    expect(resolved.map((place) => place?.slug ?? null)).toEqual(["test-sprout-square", null, null])
  })

  it("Given a published place, when metadata is built, then Korean canonical and OG fields are absolute", () => {
    // Given
    const place = resolvePublishedPlace(catalog, "test-sprout-square")

    // When
    const metadata = place && buildPlaceMetadata(place, catalog.menus, environment)

    // Then
    expect(metadata).toMatchObject({
      title: "새싹 네모식당 | 건강식 지도",
      alternates: { canonical: "https://healthmap.example/places/test-sprout-square" },
      openGraph: {
        locale: "ko_KR",
        type: "website",
        url: "https://healthmap.example/places/test-sprout-square",
      },
    })
  })

  it("Given a production snapshot, when sitemap entries are built, then public trust routes and published canonical places appear", () => {
    // Given
    const catalogWithUnpublished = PublicCatalogSnapshotSchema.parse({
      ...e2eCatalog,
      places: [...e2eCatalog.places, { ...e2eCatalog.places[0], slug: "hidden", published: false }],
    })

    // When
    const entries = buildSitemapEntries(catalogWithUnpublished, environment)

    // Then
    expect(entries.map(({ url }) => url)).toEqual([
      "https://healthmap.example/",
      "https://healthmap.example/about",
      "https://healthmap.example/privacy",
      ...e2eCatalog.places.map(({ slug }) => `https://healthmap.example/places/${slug}`),
    ])
    expect(entries.some(({ url }) => url.includes("?"))).toBe(false)
  })
})

it("Given a canonical v2 shared query, when resolved, then ingredient, cooking and bounded search area survive", () => {
  const result = resolveRootRoute(
    {
      q: "",
      tag: "main_dish",
      lat: "35.1",
      lng: "129.03",
      z: "15",
      ingredient: "fish",
      cooking: "grilled",
    },
    catalog,
  )
  expect(result).toMatchObject({
    kind: "render",
    initialMapState: {
      ingredient: "fish",
      cooking: "grilled",
      appliedBounds: {
        southWest: { latitude: 35.1 - 0.04, longitude: 129.03 - 0.04 },
        northEast: { latitude: 35.1 + 0.04, longitude: 129.03 + 0.04 },
      },
    },
  })
})
