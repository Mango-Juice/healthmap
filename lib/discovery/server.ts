import type { z } from "zod"
import { parseDevelopmentPublicEnvironment } from "../../app/public-environment"
import type { PlaceIdSchema } from "../domain/contracts"
import {
  createCachedDiscoveryReader,
  getDiscoveryProviderIdentity,
  nextDiscoveryResultCache,
  passthroughDiscoveryResultCache,
} from "./cache"
import {
  DiscoveryReadError,
  type DiscoveryReader,
  type DiscoveryRpcClient,
  DiscoveryRpcErrorResponseSchema,
} from "./contracts"
import { reportDiscoveryFailure } from "./diagnostics"
import type { DiscoveryQuery } from "./query-contract"
import { DATA_TIMEOUT_MILLISECONDS, STATE_TIMEOUT_MILLISECONDS } from "./timeouts"

export { DiscoveryReadError, type DiscoveryReader, type DiscoveryRpcClient } from "./contracts"

type PublicEndpoint = Readonly<{ readonly key: string; readonly url: string }>
type PublicEnvironment = Readonly<Record<string, string | undefined>>
type RpcRequest = Readonly<{
  readonly body: string
  readonly path: "get_discovery_state" | "query_discovery" | "get_discovery_place"
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
    const startedAt = performance.now()
    const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds)
    const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    let status: number | undefined
    try {
      const response = await fetchImplementation(new URL(`/rest/v1/rpc/${path}`, endpoint.url), {
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
      status = response.status
      let payload: unknown
      try {
        payload = await response.json()
      } catch {
        // An upstream gateway may return HTML instead of a JSON RPC error.
        throw new DiscoveryReadError(response.ok ? "invalid_response" : "transport")
      }
      if (!response.ok) throw readRpcError(payload) ?? new DiscoveryReadError("transport")
      return payload
    } catch (error) {
      const timedOut =
        timeoutSignal.aborted ||
        (signal?.aborted &&
          signal.reason instanceof DOMException &&
          signal.reason.name === "TimeoutError") ||
        (error instanceof DOMException && error.name === "TimeoutError")
      const failure = timedOut
        ? new DiscoveryReadError("timeout")
        : signal?.aborted
          ? new DiscoveryReadError("cancelled")
          : error instanceof DiscoveryReadError
            ? error
            : new DiscoveryReadError("transport")
      const operation =
        path === "get_discovery_state"
          ? "state_rpc"
          : path === "query_discovery"
            ? "query_rpc"
            : "detail_rpc"
      reportDiscoveryFailure(operation, failure, startedAt, status)
      throw failure
    }
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

export const createDiscoveryReader = (client: DiscoveryRpcClient): DiscoveryReader =>
  createCachedDiscoveryReader(client, "injected-reader", {
    cache: passthroughDiscoveryResultCache,
  })

export const createDiscoveryRuntimeReader = (
  environment: PublicEnvironment,
  fetchImplementation: typeof fetch = globalThis.fetch,
): DiscoveryReader => {
  const endpoint = parseDevelopmentPublicEnvironment(environment).catalog
  if (endpoint === null) throw new DiscoveryReadError("configuration")
  return createCachedDiscoveryReader(
    createSupabaseDiscoveryRpcClient(endpoint, fetchImplementation),
    getDiscoveryProviderIdentity(endpoint.url, endpoint.key),
    { cache: nextDiscoveryResultCache },
  )
}

let configuredReader:
  | Readonly<{ readonly identity: string; readonly reader: DiscoveryReader }>
  | undefined

const runtimeReader = () => {
  const environment = {
    HEALTHMAP_ALLOW_LOCAL_DISCOVERY: process.env["HEALTHMAP_ALLOW_LOCAL_DISCOVERY"],
    NODE_ENV: process.env["NODE_ENV"],
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  }
  const endpoint = parseDevelopmentPublicEnvironment(environment).catalog
  if (endpoint === null) throw new DiscoveryReadError("configuration")
  const identity = getDiscoveryProviderIdentity(endpoint.url, endpoint.key)
  if (configuredReader?.identity === identity) return configuredReader.reader
  const reader = createCachedDiscoveryReader(createSupabaseDiscoveryRpcClient(endpoint), identity, {
    cache: nextDiscoveryResultCache,
  })
  configuredReader = { identity, reader }
  return reader
}

export const queryDiscovery = (query: DiscoveryQuery, signal?: AbortSignal) =>
  runtimeReader().query(query, signal)

export const getDiscoveryPlace = (id: z.infer<typeof PlaceIdSchema>, signal?: AbortSignal) =>
  runtimeReader().getPlace(id, signal)
