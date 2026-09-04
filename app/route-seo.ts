import type { Metadata, MetadataRoute } from "next"

import type { PublicCatalog } from "../lib/catalog/repository.ts"
import type { Menu, Place } from "../lib/domain/catalog.ts"
import { PlaceSlugSchema } from "../lib/domain/contracts.ts"
import { parseMapShareQuery, serializeMapShareQuery } from "../lib/domain/share-query.ts"
import { buildAbsolutePlaceShareUrl, buildAbsoluteSiteUrl } from "../lib/share-links.ts"

type SearchParameterValue = string | readonly string[] | undefined
export type RootSearchParameters = Readonly<Record<string, SearchParameterValue>>

export type RootRouteDecision =
  | {
      readonly kind: "render"
      readonly initialMapState: null | {
        readonly center: { readonly latitude: number; readonly longitude: number }
        readonly query: string
        readonly tag: NonNullable<ReturnType<typeof parseMapShareQuery>>["tag"]
        readonly ingredient?: NonNullable<ReturnType<typeof parseMapShareQuery>>["ingredient"]
        readonly cooking?: NonNullable<ReturnType<typeof parseMapShareQuery>>["cooking"]
        readonly appliedBounds: {
          readonly southWest: { readonly latitude: number; readonly longitude: number }
          readonly northEast: { readonly latitude: number; readonly longitude: number }
        }
        readonly zoom: number
      }
    }
  | { readonly kind: "redirect"; readonly destination: string }

type SiteEnvironment = Readonly<Record<string, string | undefined>>

const toSearchParameters = (input: RootSearchParameters): URLSearchParams => {
  const parameters = new URLSearchParams()
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string") parameters.append(key, value)
    else if (value !== undefined) for (const item of value) parameters.append(key, item)
  }
  return parameters
}

export const resolvePublishedPlace = (catalog: PublicCatalog, input: unknown): Place | null => {
  const slug = PlaceSlugSchema.safeParse(input)
  if (!slug.success) return null
  return catalog.places.find((place) => place.published && place.slug === slug.data) ?? null
}

export const resolveRootRoute = (
  searchParameters: RootSearchParameters,
  catalog: PublicCatalog,
): RootRouteDecision => {
  const parameters = toSearchParameters(searchParameters)
  if (parameters.size === 0) return { kind: "render", initialMapState: null }

  if ([...parameters.keys()].every((key) => key === "place")) {
    const values = parameters.getAll("place")
    const value = values[0]
    if (values.length !== 1 || value === undefined) return { kind: "redirect", destination: "/" }

    const slug = PlaceSlugSchema.safeParse(value)
    if (!slug.success) return { kind: "redirect", destination: "/" }

    const place = catalog.places.find(
      (candidate) => candidate.published && candidate.slug === slug.data,
    )
    return place === undefined
      ? { kind: "render", initialMapState: null }
      : { kind: "redirect", destination: `/places/${encodeURIComponent(place.slug)}` }
  }

  const parsed = parseMapShareQuery(`?${parameters.toString()}`)
  if (parsed === null) return { kind: "redirect", destination: "/" }
  const destination = `/?${serializeMapShareQuery(parsed)}`
  return destination === `/?${parameters.toString()}`
    ? {
        kind: "render",
        initialMapState: {
          center: { latitude: parsed.lat, longitude: parsed.lng },
          query: parsed.q,
          tag: parsed.tag,
          zoom: parsed.z,
          ingredient: parsed.ingredient,
          cooking: parsed.cooking,
          appliedBounds: {
            southWest: {
              latitude: Math.max(-90, parsed.lat - 0.04),
              longitude: Math.max(-180, parsed.lng - 0.04),
            },
            northEast: {
              latitude: Math.min(90, parsed.lat + 0.04),
              longitude: Math.min(180, parsed.lng + 0.04),
            },
          },
        },
      }
    : { kind: "redirect", destination }
}

export const getPublishedPlaceMenus = (
  menus: readonly Menu[],
  place: Place,
  today: string,
): readonly Menu[] =>
  [...menus]
    .filter((menu) => menu.published && menu.placeId === place.id && menu.validUntil >= today)
    .sort((left, right) => left.displayOrder - right.displayOrder)

export const buildPlaceMetadata = (
  place: Place,
  menus: readonly Menu[],
  environment: SiteEnvironment,
): Metadata => {
  const canonical = buildAbsolutePlaceShareUrl(place.slug, environment)
  const today = new Date().toISOString().slice(0, 10)
  const representativeMenu = [...menus]
    .filter((menu) => menu.published && menu.placeId === place.id && menu.validUntil >= today)
    .sort((left, right) => left.displayOrder - right.displayOrder)[0]
  const description = representativeMenu
    ? `${place.name}의 검증된 건강식 메뉴 ${representativeMenu.name}과 장소 정보를 확인하세요.`
    : `${place.name}의 검증된 건강식 장소 정보를 확인하세요.`

  return {
    title: `${place.name} | 건강식 지도`,
    description,
    ...(canonical === null
      ? { robots: { follow: false, index: false } }
      : {
          alternates: { canonical },
          openGraph: {
            description,
            locale: "ko_KR",
            siteName: "건강식 지도",
            title: `${place.name} | 건강식 지도`,
            type: "website",
            url: canonical,
          },
        }),
  }
}

export const buildSitemapEntries = (
  catalog: PublicCatalog,
  environment: SiteEnvironment,
): MetadataRoute.Sitemap => {
  const root = buildAbsoluteSiteUrl("", environment)
  const about = buildAbsoluteSiteUrl("about", environment)
  const privacy = buildAbsoluteSiteUrl("privacy", environment)
  if (root === null || about === null || privacy === null) return []

  const places = catalog.places.flatMap((place) => {
    if (!place.published) return []
    const url = buildAbsolutePlaceShareUrl(place.slug, environment)
    return url === null ? [] : [{ url, changeFrequency: "weekly" as const, priority: 0.8 }]
  })
  return [
    { url: root, changeFrequency: "daily", priority: 1 },
    { url: about, changeFrequency: "yearly", priority: 0.5 },
    { url: privacy, changeFrequency: "yearly", priority: 0.3 },
    ...places,
  ]
}
