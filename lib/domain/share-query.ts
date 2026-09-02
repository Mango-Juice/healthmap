import { z } from "zod"
import { HealthTagSchema } from "./contracts.ts"
import { normalizeDiscoveryQuery } from "./discovery.ts"
import type { PlaceFilter } from "./filter.ts"
import { isInsideDisplayBounds } from "./geo.ts"

const QUERY_KEYS = ["q", "tag", "lat", "lng", "z"] as const
const NumericQueryValueSchema = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u)
  .transform(Number)
const MapShareQuerySchema = z
  .object({
    q: z.string().max(200).transform(normalizeDiscoveryQuery),
    tag: z.union([z.literal("all"), HealthTagSchema]),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    z: z.number().finite().int().min(13).max(18),
  })
  .strict()
  .readonly()
  .superRefine((state, context) => {
    if (!isInsideDisplayBounds({ latitude: state.lat, longitude: state.lng }))
      context.addIssue({
        code: "custom",
        message: "map share center is outside display bounds",
        path: ["lat"],
      })
  })

const MapShareQueryInputSchema = z
  .object({
    q: z.string().max(200),
    tag: z.union([z.literal("all"), HealthTagSchema]),
    lat: NumericQueryValueSchema.pipe(z.number().finite().min(-90).max(90)),
    lng: NumericQueryValueSchema.pipe(z.number().finite().min(-180).max(180)),
    z: NumericQueryValueSchema.pipe(z.number().finite().int().min(13).max(18)),
  })
  .strict()

export type MapShareQuery = {
  readonly q: string
  readonly tag: PlaceFilter
  readonly lat: number
  readonly lng: number
  readonly z: number
}

const isMapShareKey = (key: string): boolean =>
  key === QUERY_KEYS[0] ||
  key === QUERY_KEYS[1] ||
  key === QUERY_KEYS[2] ||
  key === QUERY_KEYS[3] ||
  key === QUERY_KEYS[4]

const getSingle = (parameters: URLSearchParams, key: string): string | undefined => {
  const values = parameters.getAll(key)
  return values.length === 1 ? values[0] : undefined
}

const toParameters = (input: unknown): URLSearchParams | undefined => {
  if (typeof input !== "string") return undefined
  try {
    const url =
      input.startsWith("?") || input.includes("://") || input.startsWith("/") ? input : `?${input}`
    return new URL(url, "https://health-map.local").searchParams
  } catch (error) {
    if (error instanceof TypeError) return undefined
    throw error
  }
}

export const parseMapShareQuery = (input: unknown): MapShareQuery | null => {
  const parameters = toParameters(input)
  if (parameters === undefined || [...parameters.keys()].some((key) => !isMapShareKey(key)))
    return null
  const parsed = MapShareQueryInputSchema.safeParse({
    q: getSingle(parameters, "q"),
    tag: getSingle(parameters, "tag"),
    lat: getSingle(parameters, "lat"),
    lng: getSingle(parameters, "lng"),
    z: getSingle(parameters, "z"),
  })
  if (!parsed.success) return null
  const canonical = MapShareQuerySchema.safeParse(parsed.data)
  return canonical.success ? canonical.data : null
}

export const serializeMapShareQuery = (state: MapShareQuery): string => {
  const parsed = MapShareQuerySchema.parse(state)
  const parameters = new URLSearchParams()
  parameters.set("q", parsed.q)
  parameters.set("tag", parsed.tag)
  parameters.set("lat", String(parsed.lat))
  parameters.set("lng", String(parsed.lng))
  parameters.set("z", String(parsed.z))
  return parameters.toString()
}
