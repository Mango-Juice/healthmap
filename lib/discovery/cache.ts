import { unstable_cache } from "next/cache"
import {
  assertDiscoveryEnvelopeState,
  createDiscoveryInitialQueryRequest,
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
import type { DiscoveryQuery } from "./query-contract"
import {
  DATA_TIMEOUT_MILLISECONDS,
  STATE_TIMEOUT_MILLISECONDS,
  TOTAL_TIMEOUT_MILLISECONDS,
} from "./timeouts"

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

type QueryEnvelope = ReturnType<typeof parseDiscoveryQueryEnvelope>
type InitialQuery = Readonly<{ readonly entry: StateEntry; readonly envelope: QueryEnvelope }>

type Attempt = Readonly<{
  readonly callerSignal?: AbortSignal | undefined
  readonly entry: StateEntry
  readonly totalSignal: AbortSignal
  readonly useCache: boolean
  readonly prefetched?: QueryEnvelope | undefined
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
  let initialQuery:
    | Readonly<{ readonly key: string; readonly promise: Promise<InitialQuery> }>
    | undefined

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
    const awaitingQueryState = initialQuery !== undefined
    return refreshState().catch((error: unknown) => {
      // A bad cursor or query response must not fail unrelated queries/details
      // that only joined the initial request to learn the catalog state.
      if (
        awaitingQueryState &&
        error instanceof DiscoveryReadError &&
        (error.kind === "stale_cursor" ||
          error.kind === "invalid_request" ||
          error.kind === "invalid_response")
      )
        return refreshState()
      throw error
    })
  }

  const finishInitialQuery = async (
    pending: Promise<InitialQuery>,
    receiveEnvelope: (envelope: QueryEnvelope) => void,
  ): Promise<StateEntry> => {
    try {
      const result = await pending
      receiveEnvelope(result.envelope)
      return result.entry
    } catch (error) {
      // Older database deployments require explicit state. Fall back once to
      // that supported protocol; a rejected explicit query is still surfaced.
      if (error instanceof DiscoveryReadError && error.kind === "invalid_request")
        return readState(false)
      throw error
    }
  }

  const readQueryState = async (
    query: DiscoveryQuery,
    receiveEnvelope: (envelope: QueryEnvelope) => void,
  ): Promise<StateEntry> => {
    const request = createDiscoveryInitialQueryRequest(query)
    const key = JSON.stringify(request)
    if (initialQuery?.key === key) return finishInitialQuery(initialQuery.promise, receiveEnvelope)
    if (stateEntry !== undefined || refreshPromise !== undefined) return readState(false)

    // The first query returns its state and data together. Shared callers keep the
    // same cancellation isolation as the existing state refresh.
    const requestStart = clock.now()
    const pending = client
      .query(request, AbortSignal.timeout(DATA_TIMEOUT_MILLISECONDS))
      .then((raw) => {
        const envelope = parseDiscoveryQueryEnvelope(raw, request)
        const { data, ...rawState } = envelope
        const state = parseState(rawState)
        assertDiscoveryEnvelopeState(envelope, state)
        if (data.catalogVersion !== (state.releaseId ?? "empty"))
          throw new DiscoveryReadError("invalid_response")
        const entry = { deadline: requestStart + stateDuration(state), state }
        if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
        stateEntry = entry
        return { entry, envelope }
      })
    initialQuery = { key, promise: pending }
    const statePending = pending.then(({ entry }) => entry)
    refreshPromise = statePending
    const clear = () => {
      if (initialQuery?.promise === pending) initialQuery = undefined
      if (refreshPromise === statePending) refreshPromise = undefined
    }
    statePending.then(clear, clear)
    return finishInitialQuery(pending, receiveEnvelope)
  }

  const queryAttempt = async (
    query: DiscoveryQuery,
    { callerSignal, entry, totalSignal, useCache, prefetched }: Attempt,
  ) => {
    if (clock.now() >= entry.deadline) throw new DiscoveryReadError("stale_state")
    const request = createDiscoveryQueryRequest(entry.state, query)
    const load = async () => {
      const raw =
        prefetched ?? (await client.query(request, AbortSignal.timeout(DATA_TIMEOUT_MILLISECONDS)))
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
    initialState: () => Promise<StateEntry> = () => readState(false),
  ): Promise<Value> => {
    if (callerSignal?.aborted) throw new DiscoveryReadError("cancelled")
    const totalSignal = AbortSignal.timeout(TOTAL_TIMEOUT_MILLISECONDS)
    try {
      const entry = await awaitWithinBudget(initialState(), callerSignal, totalSignal)
      return await operation(entry, true, totalSignal)
    } catch (error) {
      if (!(error instanceof DiscoveryReadError) || error.kind !== "stale_state") throw error
      const entry = await awaitWithinBudget(readState(true), callerSignal, totalSignal)
      return operation(entry, false, totalSignal)
    }
  }

  return {
    query: (query, signal) => {
      let prefetched: QueryEnvelope | undefined
      return withRetry(
        (entry, useCache, totalSignal) => {
          const envelope = prefetched
          prefetched = undefined
          return queryAttempt(query, {
            callerSignal: signal,
            entry,
            totalSignal,
            useCache,
            prefetched: envelope,
          })
        },
        signal,
        () => readQueryState(query, (envelope) => (prefetched = envelope)),
      )
    },
    getPlace: (id, signal) =>
      withRetry(
        (entry, useCache, totalSignal) =>
          detailAttempt(id, { callerSignal: signal, entry, totalSignal, useCache }),
        signal,
      ),
  }
}
