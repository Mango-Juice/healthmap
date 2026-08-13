"use client"

import posthog, { type PostHogConfig } from "posthog-js/dist/module.no-external"

import {
  createPrivacySafeAnalytics,
  POSTHOG_PRIVACY_CONFIG,
  type PrivacySafeAnalytics,
  sanitizeAnalyticsTransportEvent,
} from "./privacy-safe"
import { type AnalyticsEvent, parseAnalyticsEvent } from "../domain/analytics"

type BrowserAnalyticsEnvironment = {
  readonly host: string | undefined
  readonly key: string | undefined
}

type AnalyticsLifecycleState = {
  analytics: PrivacySafeAnalytics | null
  configuredEnvironment: BrowserAnalyticsEnvironment | null
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

const createPostHogConfig = (
  anonymousId: string,
  host: string,
  loaded: NonNullable<PostHogConfig["loaded"]>,
): Partial<PostHogConfig> => ({
  ...POSTHOG_PRIVACY_CONFIG,
  api_host: host,
  bootstrap: { distinctID: anonymousId, isIdentifiedID: false },
  property_denylist: [...POSTHOG_PRIVACY_CONFIG.property_denylist],
  loaded,
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

const flushQueuedEvents = (): void => {
  const state = getAnalyticsState()
  if (state.analytics === null || getProductAnalyticsOptOut()) return
  while (state.queuedEvents.length > 0) state.analytics.capture(state.queuedEvents.shift())
}

const enqueueOrCapture = (event: AnalyticsEvent): void => {
  const state = getAnalyticsState()
  if (getProductAnalyticsOptOut()) return
  if (state.lifecycle === "ready" && state.analytics !== null) return state.analytics.capture(event)
  if (state.queuedEvents.length < MAX_QUEUED_EVENTS) state.queuedEvents.push(event)
}

const startConfiguredAnalytics = (): Promise<void> => {
  const state = getAnalyticsState()
  if (state.lifecycle === "ready") return Promise.resolve()
  if (state.initialization !== null) return state.initialization

  const environment = state.configuredEnvironment
  if (environment === null || getProductAnalyticsOptOut()) return Promise.resolve()

  const key = asNonEmptyString(environment.key)
  const host = asNonEmptyString(environment.host)
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
      capture: (event, properties) => posthog.capture(event, properties),
      optIn: () => posthog.opt_in_capturing(),
      optOut: () => posthog.opt_out_capturing(),
    },
    createId: () => crypto.randomUUID(),
  })

  state.analytics = localAnalytics
  state.initialization = new Promise((resolve) => {
    posthog.init(
      key,
      createPostHogConfig(localAnalytics.anonymousId, host, (instance) => {
        if (state.generation !== currentGeneration || getProductAnalyticsOptOut()) {
          state.queuedEvents.length = 0
          instance.opt_out_capturing()
          resolve()
          return
        }
        posthog.opt_in_capturing({ captureEventName: false })
        state.lifecycle = "ready"
        flushQueuedEvents()
        resolve()
      }),
    )
  })
  return state.initialization
}

export const initializeProductAnalytics = (environment: BrowserAnalyticsEnvironment): void => {
  getAnalyticsState().configuredEnvironment = environment
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

export const getProductAnalyticsOptOut = (): boolean =>
  browserStorage.getItem("healthmap.analytics.opt-out.v1") === "true"
