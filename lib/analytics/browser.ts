"use client"

import posthog, { type PostHogConfig } from "posthog-js/dist/module.no-external"

import {
  createPrivacySafeAnalytics,
  POSTHOG_PRIVACY_CONFIG,
  type PrivacySafeAnalytics,
  sanitizeAnalyticsTransportEvent,
} from "./privacy-safe"

type BrowserAnalyticsEnvironment = {
  readonly host: string | undefined
  readonly key: string | undefined
}

let analytics: PrivacySafeAnalytics | null = null
let configuredEnvironment: BrowserAnalyticsEnvironment | null = null

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
    const safeEvent = sanitizeAnalyticsTransportEvent(event.event, event.properties)
    if (safeEvent === null) return null

    const token = event.properties["token"]
    const properties =
      typeof token === "string" ? { ...safeEvent.properties, token } : { ...safeEvent.properties }
    return { event: safeEvent.event, properties, uuid: event.uuid }
  },
})

const startConfiguredAnalytics = (): void => {
  if (analytics !== null) return

  const environment = configuredEnvironment
  if (environment === null || getProductAnalyticsOptOut()) return

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

  posthog.init(key, createPostHogConfig(localAnalytics.anonymousId, host))
  analytics = localAnalytics
}

export const initializeProductAnalytics = (environment: BrowserAnalyticsEnvironment): void => {
  configuredEnvironment = environment
  startConfiguredAnalytics()
}

export const captureProductAnalytics = (event: unknown): void => analytics?.capture(event)

export const setProductAnalyticsOptOut = (optedOut: boolean): void => {
  if (analytics === null) {
    browserStorage.setItem("healthmap.analytics.opt-out.v1", String(optedOut))
    if (!optedOut) {
      startConfiguredAnalytics()
      posthog.opt_in_capturing()
    }
    return
  }

  if (optedOut) analytics.optOut()
  else analytics.optIn()
}

export const getProductAnalyticsOptOut = (): boolean =>
  browserStorage.getItem("healthmap.analytics.opt-out.v1") === "true"
