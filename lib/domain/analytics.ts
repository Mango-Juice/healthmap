import { z } from "zod"
import { PlaceIdSchema } from "./contracts.ts"
import { PLACE_FILTERS } from "./filter.ts"

export const ANALYTICS_EVENT_NAMES = [
  "map_viewed",
  "location_resolved",
  "filter_selected",
  "place_opened",
  "directions_opened",
  "share_invoked",
  "share_completed",
  "shared_visit_explored",
  "search_used",
  "search_area_applied",
  "result_list_opened",
  "catalog_result_received",
  "catalog_request_failed",
] as const

const EntrySourceSchema = z.enum(["direct", "map", "place_share", "map_share"])
const ShareTargetSchema = z.enum(["place", "map"])
const ResultCountBucketSchema = z.enum(["0", "1_5", "6_20", "21_plus"])
const AnalyticsFilterSchema = z.enum([...PLACE_FILTERS, "grilled_steamed"])
const CatalogFilterSchema = z.enum([
  "all",
  "salad_poke",
  "grilled_steamed",
  "whole_grain",
  "plant_based",
  "rice",
])
const CatalogQueryKindSchema = z.enum(["browse", "search"])

const AnalyticsEventSchema = z.discriminatedUnion("event", [
  z
    .object({
      event: z.literal("map_viewed"),
      properties: z.object({ source: EntrySourceSchema }).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("location_resolved"),
      properties: z
        .object({
          outcome: z.enum([
            "inside",
            "outside",
            "resolved",
            "denied",
            "unavailable",
            "timeout",
            "unsupported",
          ]),
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("filter_selected"),
      properties: z.object({ tag: AnalyticsFilterSchema }).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("place_opened"),
      properties: z
        .object({ place_id: PlaceIdSchema, source: z.enum(["map", "list", "shared_link"]) })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("directions_opened"),
      properties: z
        .object({ place_id: PlaceIdSchema, source: z.enum(["naver_route", "naver_place"]) })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("share_invoked"),
      properties: z.object({ target: ShareTargetSchema }).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("share_completed"),
      properties: z
        .object({
          target: ShareTargetSchema,
          outcome: z.enum(["web_share", "clipboard", "manual"]),
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("shared_visit_explored"),
      properties: z
        .object({
          source: z.enum(["place_share", "map_share"]),
          action: z.enum(["filter", "place_opened", "location"]),
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("search_used"),
      properties: z.object({ result_count_bucket: ResultCountBucketSchema }).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("search_area_applied"),
      properties: z.object({}).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("result_list_opened"),
      properties: z.object({}).strict().readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("catalog_result_received"),
      properties: z
        .object({
          query_kind: CatalogQueryKindSchema,
          filter: CatalogFilterSchema,
          result_count_bucket: ResultCountBucketSchema,
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("catalog_request_failed"),
      properties: z
        .object({
          query_kind: CatalogQueryKindSchema,
          reason: z.enum(["network", "http", "invalid_response"]),
        })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
])

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>

export const parseAnalyticsEvent = (input: unknown): AnalyticsEvent =>
  AnalyticsEventSchema.parse(input)
