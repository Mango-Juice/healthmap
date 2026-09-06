import { createHash } from "node:crypto"
import { normalizeDiscoveryQuery } from "../domain/discovery"
import {
  DISCOVERY_SCHEMA_VERSION,
  DiscoveryPlacesEnvelopeSchema,
  type DiscoveryQueryRequest,
  DiscoveryReadError,
  DiscoveryRegionsEnvelopeSchema,
  type DiscoveryState,
} from "./contracts"
import type { DiscoveryQuery } from "./query-contract"

const assertNever = (value: never): never => value

export const getDiscoveryProviderIdentity = (url: string, key: string): string => {
  const endpoint = new URL(url)
  const normalized = `${endpoint.protocol}//${endpoint.host}${endpoint.pathname.replace(/\/$/u, "")}`
  return createHash("sha256").update(`${normalized}\n${key}`).digest("hex")
}

export const createDiscoveryQueryRequest = (
  state: DiscoveryState,
  query: DiscoveryQuery,
): DiscoveryQueryRequest => ({
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

const requestDigest = (request: DiscoveryQueryRequest): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        mode: request.mode,
        query: request.query,
        filter: request.filter,
        ingredient: request.ingredient,
        region: request.region ?? null,
        south: request.south ?? null,
        north: request.north ?? null,
        west: request.west ?? null,
        east: request.east ?? null,
        limit: request.limit,
        cursor: request.cursor ?? null,
      }),
    )
    .digest("hex")

type CacheKeyInput = Readonly<{
  readonly identity: string
  readonly kind: "detail" | "query"
  readonly providerIdentity: string
  readonly state: DiscoveryState
}>

const cacheKey = ({ identity, kind, providerIdentity, state }: CacheKeyInput): string =>
  [
    DISCOVERY_SCHEMA_VERSION,
    providerIdentity,
    kind,
    state.releaseId ?? "empty",
    state.eligibleEpoch,
    state.nextBoundary ?? "none",
    identity,
  ].join(":")

export const queryCacheKey = (
  providerIdentity: string,
  state: DiscoveryState,
  request: DiscoveryQueryRequest,
): string => cacheKey({ providerIdentity, kind: "query", state, identity: requestDigest(request) })

export const detailCacheKey = (
  providerIdentity: string,
  state: DiscoveryState,
  id: string,
): string => cacheKey({ providerIdentity, kind: "detail", state, identity: id })

export const assertDiscoveryEnvelopeState = (
  actual: DiscoveryState,
  expected: DiscoveryState,
): void => {
  if (
    actual.schemaVersion !== expected.schemaVersion ||
    actual.releaseId !== expected.releaseId ||
    actual.eligibleEpoch !== expected.eligibleEpoch ||
    actual.nextBoundary !== expected.nextBoundary
  )
    throw new DiscoveryReadError("stale_state")
  if (
    actual.nextBoundary !== null &&
    Date.parse(actual.evaluatedAt) >= Date.parse(actual.nextBoundary)
  )
    throw new DiscoveryReadError("invalid_response")
}

export const parseDiscoveryQueryEnvelope = (value: unknown, request: DiscoveryQueryRequest) => {
  switch (request.mode) {
    case "places": {
      const parsed = DiscoveryPlacesEnvelopeSchema.safeParse(value)
      if (!parsed.success) throw new DiscoveryReadError("invalid_response")
      return parsed.data
    }
    case "regions": {
      const parsed = DiscoveryRegionsEnvelopeSchema.safeParse(value)
      if (!parsed.success) throw new DiscoveryReadError("invalid_response")
      return parsed.data
    }
    default:
      return assertNever(request.mode)
  }
}
