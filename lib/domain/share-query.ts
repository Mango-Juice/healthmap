import { z } from "zod"
import { normalizeDiscoveryQuery } from "./discovery.ts"
import {
  type CookingFilter,
  CookingFilterSchema,
  type IngredientFilter,
  IngredientFilterSchema,
  type PlaceFilter,
  PlaceFilterSchema,
} from "./filter.ts"

const QUERY_KEYS = ["q", "tag", "lat", "lng", "z", "ingredient", "cooking"] as const
const NumericQueryValueSchema = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/u)
  .transform(Number)
const MapShareQuerySchema = z
  .object({
    q: z.string().max(200).transform(normalizeDiscoveryQuery),
    tag: PlaceFilterSchema,
    ingredient: IngredientFilterSchema.optional(),
    cooking: CookingFilterSchema.optional(),
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    z: z.number().finite().int().min(1).max(21),
  })
  .strict()
  .readonly()

const MapShareQueryInputSchema = z
  .object({
    q: z.string().max(200),
    tag: PlaceFilterSchema,
    ingredient: IngredientFilterSchema.optional(),
    cooking: CookingFilterSchema.optional(),
    lat: NumericQueryValueSchema.pipe(z.number().finite().min(-90).max(90)),
    lng: NumericQueryValueSchema.pipe(z.number().finite().min(-180).max(180)),
    z: NumericQueryValueSchema.pipe(z.number().finite().int().min(1).max(21)),
  })
  .strict()

export type MapShareQuery = {
  readonly q: string
  readonly tag: PlaceFilter
  readonly ingredient?: IngredientFilter | undefined
  readonly cooking?: CookingFilter | undefined
  readonly lat: number
  readonly lng: number
  readonly z: number
}

const isMapShareKey = (key: string): boolean => QUERY_KEYS.some((allowed) => key === allowed)

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
  if (
    parameters === undefined ||
    [...parameters.keys()].some((key) => !isMapShareKey(key) || parameters.getAll(key).length !== 1)
  )
    return null
  const parsed = MapShareQueryInputSchema.safeParse({
    q: getSingle(parameters, "q"),
    tag: getSingle(parameters, "tag"),
    ...(parameters.has("ingredient") ? { ingredient: getSingle(parameters, "ingredient") } : {}),
    ...(parameters.has("cooking") ? { cooking: getSingle(parameters, "cooking") } : {}),
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
  if (parsed.ingredient !== undefined) parameters.set("ingredient", parsed.ingredient)
  if (parsed.cooking !== undefined) parameters.set("cooking", parsed.cooking)
  return parameters.toString()
}
