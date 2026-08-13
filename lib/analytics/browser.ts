"use client"

import PostHog from "posthog-js-lite"

import { type AnalyticsEvent, parseAnalyticsEvent } from "../domain/analytics"
import {
  createPrivacySafeAnalytics,
  type PrivacySafeAnalytics,
  sanitizeAnalyticsTransportEvent,
} from "./privacy-safe"

type BrowserAnalyticsEnvironment = {
  readonly host: string | undefined
  readonly key: string | undefined
}

type AnalyticsLifecycleState = {
  analytics: PrivacySafeAnalytics | null
  client: PostHog | null
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

const createPostHogConfig = (host: string): PostHogOptions => ({
  autocapture: false,
  defaultOptIn: true,
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

    const token = event.properties?.["token"]
    const properties =
      typeof token === "string" ? { ...safeEvent.properties, token } : { ...safeEvent.properties }
    return { ...event, event: safeEvent.event, properties: toPostHogProperties(properties) }
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
      capture: (event, properties) => state.client?.capture(event, toPostHogProperties(properties)),
      optIn: () => ignoreSdkLifecycleFailure(state.client?.optIn()),
      optOut: () => ignoreSdkLifecycleFailure(state.client?.optOut()),
    },
    createId: () => crypto.randomUUID(),
  })

  state.client = new PostHog(key, createPostHogConfig(host))
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
