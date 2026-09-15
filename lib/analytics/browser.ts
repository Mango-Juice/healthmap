"use client"

import PostHog from "posthog-js-lite"

import { parsePlaywrightPublicEnvironment } from "../../app/public-environment.ts"
import { type AnalyticsEvent, parseAnalyticsEvent } from "../domain/analytics"
import {
  ANALYTICS_OPT_OUT_STORAGE_KEY,
  createPrivacySafeAnalytics,
  type PrivacySafeAnalytics,
  sanitizeAnalyticsTransportEvent,
} from "./privacy-safe"

type BrowserAnalyticsEnvironment = Readonly<Record<string, string | undefined>>

type ConfiguredBrowserAnalyticsEnvironment = Readonly<{
  readonly host: string
  readonly key: string
}>

type AnalyticsLifecycleState = {
  analytics: PrivacySafeAnalytics | null
  client: PostHog | null
  configuredEnvironment: ConfiguredBrowserAnalyticsEnvironment | null
  generation: number
  initialization: Promise<void> | null
  lifecycle: "idle" | "starting" | "ready"
  queuedEvents: AnalyticsEvent[]
}

declare global {
  var healthmapAnalyticsLifecycle: AnalyticsLifecycleState | undefined
}

const getAnalyticsState = (): AnalyticsLifecycleState => {
  if (globalThis.healthmapAnalyticsLifecycle === undefined) {
    globalThis.healthmapAnalyticsLifecycle = {
      analytics: null,
      client: null,
      configuredEnvironment: null,
      generation: 0,
      initialization: null,
      lifecycle: "idle",
      queuedEvents: [],
    }
  }
  return globalThis.healthmapAnalyticsLifecycle
}

const MAX_QUEUED_EVENTS = 32
type PostHogOptions = NonNullable<ConstructorParameters<typeof PostHog>[1]>
type PostHogBeforeSend = Extract<PostHogOptions["before_send"], (...args: never[]) => unknown>
type PostHogBeforeSendEvent = Parameters<PostHogBeforeSend>[0]

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

const toPostHogProperties = (
  properties: Readonly<Record<string, unknown>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(properties).flatMap(([key, value]) =>
      typeof value === "string" ? [[key, value]] : [],
    ),
  )

const ignoreSdkLifecycleFailure = (operation: Promise<void> | undefined): void => {
  void operation?.catch(() => undefined)
}

const createPostHogConfig = (host: string, anonymousId: string): PostHogOptions => ({
  autocapture: false,
  bootstrap: { distinctId: anonymousId },
  defaultOptIn: false,
  disableGeoip: true,
  disableRemoteFeatureFlags: true,
  flushAt: 1,
  flushInterval: 0,
  host,
  persistence: "memory" as const,
  personProfiles: "never" as const,
  preloadFeatureFlags: false,
  before_send: (event: PostHogBeforeSendEvent) => {
    if (event === null) return null
    const safeEvent = sanitizeAnalyticsTransportEvent(event.event, event.properties ?? {})
    if (safeEvent === null) return null

    return {
      ...event,
      event: safeEvent.event,
      properties: { ...toPostHogProperties(safeEvent.properties), $geoip_disable: true },
    }
  },
})

const flushQueuedEvents = (): void => {
  const state = getAnalyticsState()
  if (state.analytics === null || getProductAnalyticsOptOut()) return
  while (state.queuedEvents.length > 0) state.analytics.capture(state.queuedEvents.shift())
}

const enqueueOrCapture = (event: AnalyticsEvent): void => {
  const state = getAnalyticsState()
  if (getProductAnalyticsOptOut()) return
  if (state.lifecycle === "ready" && state.analytics !== null) {
    state.analytics.capture(event)
    return
  }
  if (state.queuedEvents.length < MAX_QUEUED_EVENTS) state.queuedEvents.push(event)
}

const startConfiguredAnalytics = (): Promise<void> => {
  const state = getAnalyticsState()
  if (state.lifecycle === "ready") return Promise.resolve()
  if (state.initialization !== null) return state.initialization

  const environment = state.configuredEnvironment
  if (environment === null || getProductAnalyticsOptOut()) return Promise.resolve()

  const key = asNonEmptyString(environment["key"])
  const host = asNonEmptyString(environment["host"])
  if (key === null || host === null) {
    state.queuedEvents.length = 0
    return Promise.resolve()
  }

  const currentGeneration = state.generation + 1
  state.generation = currentGeneration
  state.lifecycle = "starting"

  const localAnalytics = createPrivacySafeAnalytics({
    storage: browserStorage,
    transport: {
      capture: (event, properties) => state.client?.capture(event, toPostHogProperties(properties)),
      optIn: () => ignoreSdkLifecycleFailure(state.client?.optIn()),
      optOut: () => ignoreSdkLifecycleFailure(state.client?.optOut()),
    },
    createId: () => crypto.randomUUID(),
  })

  state.client = new PostHog(key, createPostHogConfig(host, localAnalytics.anonymousId))
  ignoreSdkLifecycleFailure(state.client.optIn())
  state.analytics = localAnalytics
  state.initialization = Promise.resolve().then(() => {
    if (state.generation !== currentGeneration || getProductAnalyticsOptOut()) {
      state.queuedEvents.length = 0
      return
    }
    state.lifecycle = "ready"
    flushQueuedEvents()
  })
  return state.initialization
}

export const initializeProductAnalytics = (environment: BrowserAnalyticsEnvironment): void => {
  const parsed = parsePlaywrightPublicEnvironment({
    NEXT_PUBLIC_POSTHOG_HOST: environment["host"],
    NEXT_PUBLIC_POSTHOG_KEY: environment["key"],
    NEXT_PUBLIC_PLAYWRIGHT_TEST: environment["playwrightTest"],
    NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK: environment["testAllowHttpLoopback"],
  })
  getAnalyticsState().configuredEnvironment =
    parsed.analytics === null ? null : { host: parsed.analytics.url, key: parsed.analytics.key }
  void startConfiguredAnalytics()
}

export const captureProductAnalytics = (event: unknown): void => {
  try {
    enqueueOrCapture(parseAnalyticsEvent(event))
  } catch {
    return
  }
}

export const setProductAnalyticsOptOut = async (optedOut: boolean): Promise<void> => {
  const state = getAnalyticsState()
  if (state.analytics === null) {
    browserStorage.setItem("healthmap.analytics.opt-out.v1", String(optedOut))
    if (!optedOut) {
      await startConfiguredAnalytics()
    }
    return
  }

  if (optedOut) {
    state.generation += 1
    state.lifecycle = "idle"
    state.initialization = null
    state.queuedEvents.length = 0
    state.analytics.optOut()
  } else {
    state.analytics.optIn()
    state.lifecycle = "ready"
    flushQueuedEvents()
  }
}

export const getProductAnalyticsConsent = (): "granted" | "denied" | null => {
  const stored = browserStorage.getItem(ANALYTICS_OPT_OUT_STORAGE_KEY)
  return stored === "false" ? "granted" : stored === "true" ? "denied" : null
}

export const getProductAnalyticsOptOut = (): boolean => getProductAnalyticsConsent() !== "granted"
