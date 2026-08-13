import { z } from "zod"

import { type AnalyticsEvent, parseAnalyticsEvent } from "../domain/analytics"

export const ANALYTICS_ANONYMOUS_ID_STORAGE_KEY = "healthmap.analytics.anonymous-id.v1"
export const ANALYTICS_OPT_OUT_STORAGE_KEY = "healthmap.analytics.opt-out.v1"

const AnonymousIdSchema = z.uuid()

export const POSTHOG_PRIVACY_CONFIG = {
  autocapture: false,
  capture_dead_clicks: false,
  capture_exceptions: false,
  capture_heatmaps: false,
  capture_pageleave: false,
  capture_pageview: false,
  capture_performance: false,
  disable_persistence: true,
  disable_session_recording: true,
  disable_surveys: true,
  advanced_disable_flags: true,
  mask_all_element_attributes: true,
  mask_all_text: true,
  opt_out_useragent_filter: true,
  person_profiles: "never",
  persistence: "memory",
  property_denylist: [
    "$current_url",
    "$referrer",
    "$referring_domain",
    "$pathname",
    "$search_engine",
    "$search_keyword",
    "$browser_version",
    "$os_version",
  ],
  rageclick: false,
} as const

export interface AnalyticsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface AnalyticsTransport {
  capture(event: string, properties: Readonly<Record<string, unknown>>): void
  optIn(): void
  optOut(): void
}

type PrivacySafeAnalyticsOptions = {
  readonly storage: AnalyticsStorage
  readonly transport: AnalyticsTransport
  readonly createId: () => string
}

export type PrivacySafeAnalytics = {
  readonly anonymousId: string
  readonly capture: (input: unknown) => void
  readonly isOptedOut: () => boolean
  readonly optIn: () => void
  readonly optOut: () => void
}

const getAnonymousId = (storage: AnalyticsStorage, createId: () => string): string => {
  const storedId = storage.getItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY)
  const parsedStoredId = AnonymousIdSchema.safeParse(storedId)
  if (parsedStoredId.success) return parsedStoredId.data

  const generatedId = createId()
  const parsedGeneratedId = AnonymousIdSchema.parse(generatedId)
  storage.setItem(ANALYTICS_ANONYMOUS_ID_STORAGE_KEY, parsedGeneratedId)
  return parsedGeneratedId
}

const isStoredOptOut = (storage: AnalyticsStorage): boolean =>
  storage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY) === "true"

const toOutboundEvent = (input: unknown): AnalyticsEvent | null => {
  try {
    return parseAnalyticsEvent(input)
  } catch (error) {
    if (error instanceof z.ZodError) return null
    throw error
  }
}

const isPropertyRecord = (input: unknown): input is Readonly<Record<string, unknown>> =>
  typeof input === "object" && input !== null && !Array.isArray(input)

export const sanitizeAnalyticsTransportEvent = (
  event: unknown,
  properties: unknown,
): AnalyticsEvent | null => {
  if (!isPropertyRecord(properties)) return null

  switch (event) {
    case "map_viewed":
      return toOutboundEvent({ event, properties: { source: properties["source"] } })
    case "location_resolved":
      return toOutboundEvent({ event, properties: { outcome: properties["outcome"] } })
    case "filter_selected":
      return toOutboundEvent({ event, properties: { tag: properties["tag"] } })
    case "place_opened":
      return toOutboundEvent({
        event,
        properties: { place_id: properties["place_id"], source: properties["source"] },
      })
    case "directions_opened":
      return toOutboundEvent({
        event,
        properties: { place_id: properties["place_id"], source: properties["source"] },
      })
    case "share_invoked":
      return toOutboundEvent({ event, properties: { target: properties["target"] } })
    case "share_completed":
      return toOutboundEvent({
        event,
        properties: { target: properties["target"], outcome: properties["outcome"] },
      })
    case "shared_visit_explored":
      return toOutboundEvent({
        event,
        properties: { source: properties["source"], action: properties["action"] },
      })
    default:
      return null
  }
}

export const createPrivacySafeAnalytics = ({
  storage,
  transport,
  createId,
}: PrivacySafeAnalyticsOptions): PrivacySafeAnalytics => {
  const anonymousId = getAnonymousId(storage, createId)

  return {
    anonymousId,
    capture: (input) => {
      if (isStoredOptOut(storage)) return

      const event = toOutboundEvent(input)
      if (event === null) return

      try {
        transport.capture(event.event, event.properties)
      } catch (error) {
        if (error instanceof Error) return
        return
      }
    },
    isOptedOut: () => isStoredOptOut(storage),
    optIn: () => {
      storage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "false")
      try {
        transport.optIn()
      } catch (error) {
        if (error instanceof Error) return
        return
      }
    },
    optOut: () => {
      storage.setItem(ANALYTICS_OPT_OUT_STORAGE_KEY, "true")
      try {
        transport.optOut()
      } catch (error) {
        if (error instanceof Error) return
        return
      }
    },
  }
}
