import type { z } from "zod"
import { parsePublicEnvironment } from "../../app/public-environment"
import type { PlaceIdSchema } from "../domain/contracts"
import { normalizeDiscoveryQuery } from "../domain/discovery"
import type { PilotQuery } from "../pilot/query-contract"
import {
  DiscoveryDetailEnvelopeSchema,
  DiscoveryPlacesEnvelopeSchema,
  type DiscoveryQueryRequest,
  DiscoveryReadError,
  type DiscoveryReader,
  DiscoveryRegionsEnvelopeSchema,
  type DiscoveryRpcClient,
  DiscoveryRpcErrorResponseSchema,
  type DiscoveryState,
  DiscoveryStateSchema,
} from "./contracts"

const STATE_TIMEOUT_MILLISECONDS = 1_500
const DATA_TIMEOUT_MILLISECONDS = 2_500
const TOTAL_TIMEOUT_MILLISECONDS = 4_000

export { DiscoveryReadError, type DiscoveryReader, type DiscoveryRpcClient } from "./contracts"

type PublicEndpoint = Readonly<{ readonly key: string; readonly url: string }>
type PublicEnvironment = Readonly<Record<string, string | undefined>>
type RpcRequest = Readonly<{
  readonly body: string
  readonly path: string
  readonly signal?: AbortSignal | undefined
  readonly timeoutMilliseconds: number
}>

const readRpcError = (payload: unknown): DiscoveryReadError | null => {
  const parsed = DiscoveryRpcErrorResponseSchema.safeParse(payload)
  if (!parsed.success) return null
  if (parsed.data.code === "PT400" && parsed.data.error === "invalid_request")
    return new DiscoveryReadError("invalid_request")
  if (parsed.data.code === "PT409" && parsed.data.error === "stale_state")
    return new DiscoveryReadError("stale_state")
  if (parsed.data.code === "PT409" && parsed.data.error === "stale_cursor")
    return new DiscoveryReadError("stale_cursor")
  return null
}

export const createSupabaseDiscoveryRpcClient = (
  endpoint: PublicEndpoint,
  fetchImplementation: typeof fetch = globalThis.fetch,
): DiscoveryRpcClient => {
  const request = async ({ body, path, signal, timeoutMilliseconds }: RpcRequest) => {
    if (signal?.aborted) throw new DiscoveryReadError("cancelled")
    const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds)
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let response: Response
    try {
      response = await fetchImplementation(new URL(`/rest/v1/rpc/${path}`, endpoint.url), {
        body,
        cache: "no-store",
        headers: {
          apikey: endpoint.key,
          authorization: `Bearer ${endpoint.key}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: combinedSignal,
      })
    } catch (error) {
      if (signal?.aborted) throw new DiscoveryReadError("cancelled")
      if (timeoutSignal.aborted || (error instanceof DOMException && error.name === "TimeoutError"))
        throw new DiscoveryReadError("timeout")
      throw new DiscoveryReadError("transport")
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      if (signal?.aborted) throw new DiscoveryReadError("cancelled")
      if (timeoutSignal.aborted) throw new DiscoveryReadError("timeout")
      throw new DiscoveryReadError("invalid_response")
    }
    if (!response.ok) throw readRpcError(payload) ?? new DiscoveryReadError("transport")
    return payload
  }

  return {
    getState: (signal) =>
      request({
        body: "{}",
        path: "get_discovery_state",
        signal,
        timeoutMilliseconds: STATE_TIMEOUT_MILLISECONDS,
      }),
    query: (input, signal) =>
      request({
        body: JSON.stringify({ p_request: input }),
        path: "query_discovery",
        signal,
        timeoutMilliseconds: DATA_TIMEOUT_MILLISECONDS,
      }),
    getPlace: (input, signal) =>
      request({
        body: JSON.stringify({ p_request: input }),
        path: "get_discovery_place",
        signal,
        timeoutMilliseconds: DATA_TIMEOUT_MILLISECONDS,
      }),
  }
}

const parseState = (value: unknown): DiscoveryState => {
  const parsed = DiscoveryStateSchema.safeParse(value)
  if (!parsed.success) throw new DiscoveryReadError("invalid_response")
  return parsed.data
}

const canonicalRequest = (state: DiscoveryState, query: PilotQuery): DiscoveryQueryRequest => ({
  expectedRelease: state.releaseId,
  expectedEpoch: state.eligibleEpoch,
  mode: query.mode,
  query: normalizeDiscoveryQuery(query.query),
  filter: query.filter,
  ingredient: query.ingredient,
  region: query.region,
  south: query.south,
  north: query.north,
  west: query.west,
  east: query.east,
  limit: query.limit,
  cursor: query.cursor,
})

const matchingState = (actual: DiscoveryState, expected: DiscoveryState): boolean =>
  actual.schemaVersion === expected.schemaVersion &&
  actual.releaseId === expected.releaseId &&
  actual.eligibleEpoch === expected.eligibleEpoch

const matchingCatalogVersion = (catalogVersion: string, state: DiscoveryState): boolean =>
  catalogVersion === (state.releaseId ?? "empty")

const totalBudgetSignal = (signal: AbortSignal | undefined) => {
  const timeout = AbortSignal.timeout(TOTAL_TIMEOUT_MILLISECONDS)
  return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, timeout }
}

const remapBudgetError = (
  error: unknown,
  callerSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal,
): never => {
  if (callerSignal?.aborted) throw new DiscoveryReadError("cancelled")
  if (timeoutSignal.aborted) throw new DiscoveryReadError("timeout")
  throw error
}

export const createDiscoveryReader = (client: DiscoveryRpcClient): DiscoveryReader => ({
  query: async (query, callerSignal) => {
    if (callerSignal?.aborted) throw new DiscoveryReadError("cancelled")
    const budget = totalBudgetSignal(callerSignal)
    try {
      let state = parseState(await client.getState(budget.signal))
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await client.query(canonicalRequest(state, query), budget.signal)
          const schema =
            query.mode === "regions"
              ? DiscoveryRegionsEnvelopeSchema
              : DiscoveryPlacesEnvelopeSchema
          const parsed = schema.safeParse(raw)
          if (
            !parsed.success ||
            !matchingState(parsed.data, state) ||
            !matchingCatalogVersion(parsed.data.data.catalogVersion, state)
          )
            throw new DiscoveryReadError("invalid_response")
          return parsed.data.data
        } catch (error) {
          if (
            !(error instanceof DiscoveryReadError) ||
            error.kind !== "stale_state" ||
            attempt === 1
          )
            throw error
          state = parseState(await client.getState(budget.signal))
        }
      }
      throw new DiscoveryReadError("stale_state")
    } catch (error) {
      return remapBudgetError(error, callerSignal, budget.timeout)
    }
  },
  getPlace: async (id, callerSignal) => {
    if (callerSignal?.aborted) throw new DiscoveryReadError("cancelled")
    const budget = totalBudgetSignal(callerSignal)
    try {
      let state = parseState(await client.getState(budget.signal))
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const raw = await client.getPlace(
            { expectedRelease: state.releaseId, expectedEpoch: state.eligibleEpoch, id },
            budget.signal,
          )
          const parsed = DiscoveryDetailEnvelopeSchema.safeParse(raw)
          if (
            !parsed.success ||
            !matchingState(parsed.data, state) ||
            (parsed.data.data !== null &&
              !matchingCatalogVersion(parsed.data.data.catalogVersion, state))
          )
            throw new DiscoveryReadError("invalid_response")
          return parsed.data.data
        } catch (error) {
          if (
            !(error instanceof DiscoveryReadError) ||
            error.kind !== "stale_state" ||
            attempt === 1
          )
            throw error
          state = parseState(await client.getState(budget.signal))
        }
      }
      throw new DiscoveryReadError("stale_state")
    } catch (error) {
      return remapBudgetError(error, callerSignal, budget.timeout)
    }
  },
})

export const createDiscoveryRuntimeReader = (
  environment: PublicEnvironment,
  fetchImplementation: typeof fetch = globalThis.fetch,
): DiscoveryReader => {
  const endpoint = parsePublicEnvironment(environment).catalog
  if (endpoint === null) throw new DiscoveryReadError("configuration")
  return createDiscoveryReader(createSupabaseDiscoveryRpcClient(endpoint, fetchImplementation))
}

const runtimeReader = () =>
  createDiscoveryRuntimeReader({
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  })

export const queryDiscovery = (query: PilotQuery, signal?: AbortSignal) =>
  runtimeReader().query(query, signal)

export const getDiscoveryPlace = (id: z.infer<typeof PlaceIdSchema>, signal?: AbortSignal) =>
  runtimeReader().getPlace(id, signal)
