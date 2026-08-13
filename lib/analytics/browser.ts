"use client"

import posthog, { type PostHogConfig } from "posthog-js/dist/module.no-external"

import { parseAnalyticsEvent } from "../domain/analytics"
import {
  createPrivacySafeAnalytics,
  POSTHOG_PRIVACY_CONFIG,
  type PrivacySafeAnalytics,
} from "./privacy-safe"

type BrowserAnalyticsEnvironment = {
  readonly host: string | undefined
  readonly key: string | undefined
}

let analytics: PrivacySafeAnalytics | null = null

const browserStorage = {
  getItem: (key: string): string | null => {
    try {
      return window.localStorage.getItem(key)
    } catch (error) {
      if (error instanceof Error) return null
      return null
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      window.localStorage.setItem(key, value)
    } catch (error) {
      if (error instanceof Error) return
      return
    }
  },
}

const asNonEmptyString = (value: string | undefined): string | null => {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? null : trimmed
}

const createPostHogConfig = (anonymousId: string, host: string): Partial<PostHogConfig> => ({
  ...POSTHOG_PRIVACY_CONFIG,
  api_host: host,
  bootstrap: { distinctID: anonymousId, isIdentifiedID: false },
  property_denylist: [...POSTHOG_PRIVACY_CONFIG.property_denylist],
  before_send: (event) => {
    if (event === null) return null

    try {
      const safeEvent = parseAnalyticsEvent({ event: event.event, properties: event.properties })
      return { event: safeEvent.event, properties: safeEvent.properties, uuid: event.uuid }
    } catch (error) {
      if (error instanceof Error) return null
      return null
    }
  },
})

export const initializeProductAnalytics = (environment: BrowserAnalyticsEnvironment): void => {
  if (analytics !== null) return

  const key = asNonEmptyString(environment.key)
  const host = asNonEmptyString(environment.host)
  if (key === null || host === null) return

  const localAnalytics = createPrivacySafeAnalytics({
    storage: browserStorage,
    transport: {
      capture: (event, properties) => posthog.capture(event, properties),
      optIn: () => posthog.opt_in_capturing(),
      optOut: () => posthog.opt_out_capturing(),
    },
    createId: () => crypto.randomUUID(),
  })

  if (localAnalytics.isOptedOut()) return

  posthog.init(key, createPostHogConfig(localAnalytics.anonymousId, host))
  analytics = localAnalytics
}

export const captureProductAnalytics = (event: unknown): void => analytics?.capture(event)

export const setProductAnalyticsOptOut = (optedOut: boolean): void => {
  if (analytics === null) {
    browserStorage.setItem("healthmap.analytics.opt-out.v1", String(optedOut))
    return
  }

  if (optedOut) analytics.optOut()
  else analytics.optIn()
}

export const getProductAnalyticsOptOut = (): boolean =>
  browserStorage.getItem("healthmap.analytics.opt-out.v1") === "true"
