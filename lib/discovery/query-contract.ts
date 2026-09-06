import { z } from "zod"
import { DISCOVERY_FILTERS } from "./menu-selection"

const coordinate = (min: number, max: number) =>
  z
    .union([
      z.number(),
      z
        .string()
        .regex(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/u)
        .transform(Number),
    ])
    .pipe(z.number().finite().min(min).max(max))
export const DiscoveryQuerySchema = z
  .strictObject({
    mode: z.enum(["places", "regions"]).default("places"),
    query: z.string().trim().max(200).default(""),
    filter: z.enum(DISCOVERY_FILTERS.map((option) => option.value)).default("all"),
    ingredient: z.enum(["all", "chicken", "fish", "tofu_soy"]).default("all"),
    region: z.string().trim().min(1).max(80).optional(),
    south: coordinate(-90, 90).optional(),
    north: coordinate(-90, 90).optional(),
    west: coordinate(-180, 180).optional(),
    east: coordinate(-180, 180).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(1000).optional(),
  })
  .superRefine((query, context) => {
    const bounds = [query.south, query.north, query.west, query.east]
    if (bounds.some((value) => value !== undefined) && bounds.some((value) => value === undefined))
      context.addIssue({ code: "custom", message: "All bounds are required" })
    if (
      (query.south !== undefined && query.north !== undefined && query.south > query.north) ||
      (query.west !== undefined && query.east !== undefined && query.west > query.east)
    )
      context.addIssue({ code: "custom", message: "Bounds must be ordered" })
    if (query.mode === "regions" && query.cursor !== undefined)
      context.addIssue({ code: "custom", message: "Regions do not paginate" })
  })
export type DiscoveryQuery = z.infer<typeof DiscoveryQuerySchema>
export const parseDiscoveryQuery = (params: URLSearchParams) => {
  const entries = Array.from(params.entries())
  if (
    new Set(entries.map(([key]) => key)).size !== entries.length ||
    entries.some(([, value]) => value === "")
  )
    return DiscoveryQuerySchema.safeParse({ invalid: true })
  return DiscoveryQuerySchema.safeParse(Object.fromEntries(entries))
}
