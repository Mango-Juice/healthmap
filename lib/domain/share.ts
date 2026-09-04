import { z } from "zod"
import { type HealthTag, HealthTagSchema, type PlaceSlug, PlaceSlugSchema } from "./contracts.ts"
import type { GeoPoint } from "./geo.ts"
import { isInsideLocationBounds } from "./geo.ts"

export type ShareState =
  | { readonly kind: "fallback" }
  | { readonly kind: "place"; readonly slug: PlaceSlug; readonly source: "place_share" }
  | {
      readonly kind: "map"
      readonly center: GeoPoint
      readonly zoom: number
      readonly tag: HealthTag
      readonly source: "map_share"
    }

const MapShareInputSchema = z
  .object({
    latitude: z
      .union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().finite()),
    longitude: z
      .union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().finite()),
    zoom: z
      .union([z.number(), z.string().trim().min(1).transform(Number)])
      .pipe(z.number().int().min(1).max(21)),
    tag: HealthTagSchema,
    source: z.literal("map_share"),
  })
  .strict()
  .superRefine((input, context) => {
    if (!isInsideLocationBounds(input)) {
      context.addIssue({ code: "custom", message: "map center is outside movement bounds" })
    }
  })

const FALLBACK_STATE: ShareState = { kind: "fallback" }

const getSingle = (parameters: URLSearchParams, name: string): string | null => {
  const values = parameters.getAll(name)
  return values.length === 1 ? (values[0] ?? null) : null
}

const toUrl = (input: string): URL | undefined => {
  try {
    return new URL(input, "https://health-map.local")
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

export const parseShareUrl = (input: string): ShareState => {
  const url = toUrl(input)
  if (url === undefined) return FALLBACK_STATE

  const place = PlaceSlugSchema.safeParse(getSingle(url.searchParams, "place"))
  if (place.success) return { kind: "place", slug: place.data, source: "place_share" }

  const map = MapShareInputSchema.safeParse({
    latitude: getSingle(url.searchParams, "lat"),
    longitude: getSingle(url.searchParams, "lng"),
    zoom: getSingle(url.searchParams, "z"),
    tag: getSingle(url.searchParams, "tag"),
    source: getSingle(url.searchParams, "src"),
  })
  return map.success
    ? {
        kind: "map",
        center: { latitude: map.data.latitude, longitude: map.data.longitude },
        zoom: map.data.zoom,
        tag: map.data.tag,
        source: "map_share",
      }
    : FALLBACK_STATE
}

export const serializePlaceShare = (slug: PlaceSlug): string =>
  `/?place=${encodeURIComponent(slug)}&src=place_share`

export const serializeMapShare = (center: GeoPoint, zoom: number, tag: HealthTag): string => {
  const validated = MapShareInputSchema.parse({
    latitude: center.latitude,
    longitude: center.longitude,
    zoom,
    tag,
    source: "map_share",
  })
  return `/?lat=${validated.latitude.toFixed(3)}&lng=${validated.longitude.toFixed(3)}&z=${validated.zoom}&tag=${validated.tag}&src=map_share`
}

export const canonicalizeShareUrl = (url: string): string => {
  const state = parseShareUrl(url)
  switch (state.kind) {
    case "fallback":
      return "/"
    case "place":
      return serializePlaceShare(state.slug)
    case "map":
      return serializeMapShare(state.center, state.zoom, state.tag)
    default:
      return assertNever(state)
  }
}

const assertNever = (value: never): never => value
