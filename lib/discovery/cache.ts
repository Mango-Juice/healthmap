import { unstable_cache } from "next/cache"
import type { PilotQuery } from "../pilot/query-contract"
import {
  assertDiscoveryEnvelopeState,
  createDiscoveryQueryRequest,
  detailCacheKey,
  parseDiscoveryQueryEnvelope,
  queryCacheKey,
} from "./cache-key"
import {
  DiscoveryDetailEnvelopeSchema,
  DiscoveryReadError,
  type DiscoveryReader,
  type DiscoveryRpcClient,
  type DiscoveryState,
  DiscoveryStateSchema,
} from "./contracts"

const STATE_TIMEOUT_MILLISECONDS = 1_500
const DATA_TIMEOUT_MILLISECONDS = 2_500
const TOTAL_TIMEOUT_MILLISECONDS = 4_000
const MAXIMUM_STATE_AGE_MILLISECONDS = 60_000

export interface MonotonicClock {
  now(): number
}

export interface DiscoveryResultCache {
  read(key: string, load: () => Promise<unknown>): Promise<unknown>
}

type CacheOptions = Readonly<{
  readonly cache: DiscoveryResultCache
  readonly clock: MonotonicClock
}>

type StateEntry = Readonly<{
  readonly deadline: number
  readonly state: DiscoveryState
}>

type Attempt = Readonly<{
  readonly callerSignal?: AbortSignal | undefined
  readonly entry: StateEntry
  readonly totalSignal: AbortSignal
  readonly useCache: boolean
}>

const systemClock: MonotonicClock = { now: () => performance.now() }

export const nextDiscoveryResultCache: DiscoveryResultCache = {
  read: (key, load) => unstable_cache(load, ["discovery-safe-envelope", key], { revalidate: 60 })(),
}

export const passthroughDiscoveryResultCache: DiscoveryResultCache = {
  read: (_key, load) => load(),
}

export { getDiscoveryProviderIdentity } from "./cache-key"

const parseState = (value: unknown): DiscoveryState => {
  const parsed = DiscoveryStateSchema.safeParse(value)
  if (!parsed.success) throw new DiscoveryReadError("invalid_response")
  return parsed.data
}

const stateDuration = (state: DiscoveryState): number => {
  if (state.nextBoundary === null) return MAXIMUM_STATE_AGE_MILLISECONDS
  return Math.max(
    0,
    Math.min(
      MAXIMUM_STATE_AGE_MILLISECONDS,
      Date.parse(state.nextBoundary) - Date.parse(state.evaluatedAt),
    ),
  )
}

const abortError = (callerSignal: AbortSignal | undefined): DiscoveryReadError =>
  new DiscoveryReadError(callerSignal?.aborted ? "cancelled" : "timeout")

const awaitWithinBudget = async <Value>(
  promise: Promise<Value>,
  callerSignal: AbortSignal | undefined,
  totalSignal: AbortSignal,
): Promise<Value> => {
  const signal = callerSignal ? AbortSignal.any([callerSignal, totalSignal]) : totalSignal
  if (signal.aborted) throw abortError(callerSignal)
  return new Promise<Value>((resolve, reject) => {
    const onAbort = () => reject(abortError(callerSignal))
    signal.addEventListener("abort", onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort)
        reject(error)
      },
    )
  })
}

export const createCachedDiscoveryReader = (
  client: DiscoveryRpcClient,
  providerIdentity: string,
  options: Partial<CacheOptions> = {},
): DiscoveryReader => {
  const cache = options.cache ?? nextDiscoveryResultCache
  const clock = options.clock ?? systemClock
  let stateEntry: StateEntry | undefined
  let refreshPromise: Promise<StateEntry> | undefined

  const refreshState = (): Promise<StateEntry> => {
    if (refreshPromise !== undefined) return refreshPromise
    const requestStart = clock.now()
    const pending = client.getState(AbortSignal.timeout(STATE_TIMEOUT_MILLISECONDS)).then((raw) => {
      const state = parseState(raw)
      const entry = { deadline: requestStart + stateDuration(state), state }
      if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
      stateEntry = entry
      return entry
    })
    refreshPromise = pending
    const clear = () => {
      if (refreshPromise === pending) refreshPromise = undefined
    }
    pending.then(clear, clear)
    return pending
  }

  const readState = (force: boolean): Promise<StateEntry> => {
    if (force) stateEntry = undefined
    if (stateEntry !== undefined && clock.now() < stateEntry.deadline)
      return Promise.resolve(stateEntry)
    return refreshState()
  }

  const queryAttempt = async (
    query: PilotQuery,
    { callerSignal, entry, totalSignal, useCache }: Attempt,
  ) => {
    if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
    const request = createDiscoveryQueryRequest(entry.state, query)
    const load = async () => {
      const raw = await client.query(request, AbortSignal.timeout(DATA_TIMEOUT_MILLISECONDS))
      const envelope = parseDiscoveryQueryEnvelope(raw, request)
      assertDiscoveryEnvelopeState(envelope, entry.state)
      if (envelope.data.catalogVersion !== (entry.state.releaseId ?? "empty"))
        throw new DiscoveryReadError("invalid_response")
      return envelope
    }
    const pending = useCache
      ? cache.read(queryCacheKey(providerIdentity, entry.state, request), load)
      : load()
    const envelope = parseDiscoveryQueryEnvelope(
      await awaitWithinBudget(pending, callerSignal, totalSignal),
      request,
    )
    assertDiscoveryEnvelopeState(envelope, entry.state)
    if (envelope.data.catalogVersion !== (entry.state.releaseId ?? "empty"))
      throw new DiscoveryReadError("invalid_response")
    if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
    return envelope.data
  }

  const detailAttempt = async (
    id: Parameters<DiscoveryReader["getPlace"]>[0],
    { callerSignal, entry, totalSignal, useCache }: Attempt,
  ) => {
    if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
    const request = {
      expectedRelease: entry.state.releaseId,
      expectedEpoch: entry.state.eligibleEpoch,
      id,
    }
    const load = async () => {
      const raw = await client.getPlace(request, AbortSignal.timeout(DATA_TIMEOUT_MILLISECONDS))
      const parsed = DiscoveryDetailEnvelopeSchema.safeParse(raw)
      if (!parsed.success) throw new DiscoveryReadError("invalid_response")
      assertDiscoveryEnvelopeState(parsed.data, entry.state)
      if (
        parsed.data.data !== null &&
        (parsed.data.data.catalogVersion !== (entry.state.releaseId ?? "empty") ||
          parsed.data.data.place.id !== id)
      )
        throw new DiscoveryReadError("invalid_response")
      return parsed.data
    }
    const pending = useCache
      ? cache.read(detailCacheKey(providerIdentity, entry.state, id), load)
      : load()
    const parsed = DiscoveryDetailEnvelopeSchema.safeParse(
      await awaitWithinBudget(pending, callerSignal, totalSignal),
    )
    if (!parsed.success) throw new DiscoveryReadError("invalid_response")
    assertDiscoveryEnvelopeState(parsed.data, entry.state)
    if (
      parsed.data.data !== null &&
      (parsed.data.data.catalogVersion !== (entry.state.releaseId ?? "empty") ||
        parsed.data.data.place.id !== id)
    )
      throw new DiscoveryReadError("invalid_response")
    if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
    return parsed.data.data
  }

  const withRetry = async <Value>(
    operation: (entry: StateEntry, useCache: boolean, totalSignal: AbortSignal) => Promise<Value>,
    callerSignal: AbortSignal | undefined,
  ): Promise<Value> => {
    if (callerSignal?.aborted) throw new DiscoveryReadError("cancelled")
    const totalSignal = AbortSignal.timeout(TOTAL_TIMEOUT_MILLISECONDS)
    try {
      const entry = await awaitWithinBudget(readState(false), callerSignal, totalSignal)
      return await operation(entry, true, totalSignal)
    } catch (error) {
      if (!(error instanceof DiscoveryReadError) || error.kind !== "stale_state") throw error
      const entry = await awaitWithinBudget(readState(true), callerSignal, totalSignal)
      return operation(entry, false, totalSignal)
    }
  }

  return {
    query: (query, signal) =>
      withRetry(
        (entry, useCache, totalSignal) =>
          queryAttempt(query, { callerSignal: signal, entry, totalSignal, useCache }),
        signal,
      ),
    getPlace: (id, signal) =>
      withRetry(
        (entry, useCache, totalSignal) =>
          detailAttempt(id, { callerSignal: signal, entry, totalSignal, useCache }),
        signal,
      ),
  }
}
