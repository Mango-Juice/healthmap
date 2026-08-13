import { z } from "zod"
import { HealthTagSchema, PlaceIdSchema } from "./contracts.ts"

export const ANALYTICS_EVENT_NAMES = [
  "map_viewed",
  "location_resolved",
  "filter_selected",
  "place_opened",
  "directions_opened",
  "share_invoked",
  "share_completed",
  "shared_visit_explored",
] as const

const EntrySourceSchema = z.enum(["direct", "map", "place_share", "map_share"])
const ShareTargetSchema = z.enum(["place", "map"])

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
        .object({ outcome: z.enum(["inside", "outside", "denied", "timeout", "unsupported"]) })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("filter_selected"),
      properties: z
        .object({ tag: z.union([z.literal("all"), HealthTagSchema]) })
        .strict()
        .readonly(),
    })
    .strict()
    .readonly(),
  z
    .object({
      event: z.literal("place_opened"),
      properties: z
        .object({ place_id: PlaceIdSchema, source: EntrySourceSchema })
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
])

export type AnalyticsEvent = z.infer<typeof AnalyticsEventSchema>

export const parseAnalyticsEvent = (input: unknown): AnalyticsEvent =>
  AnalyticsEventSchema.parse(input)
