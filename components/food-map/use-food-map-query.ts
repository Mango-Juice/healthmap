import { useEffect, useMemo, useRef, useState } from "react"
import {
  type DiscoveryPlacesResponse,
  DiscoveryPlacesResponseSchema,
  type DiscoveryRegionsResponse,
  DiscoveryRegionsResponseSchema,
} from "../../lib/discovery/dto"
import type { DiscoveryFilter, DiscoveryIngredientFilter } from "../../lib/discovery/menu-selection"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"
import type { ViewportBounds } from "../../lib/domain/viewport"
import { fetchWithTransientRetry } from "../../lib/http/fetch-with-transient-retry"

const REQUEST_TIMEOUT_MS = 10_000

type Query = {
  readonly ready: boolean
  readonly bounds: ViewportBounds | undefined
  readonly region: string
  readonly query: string
  readonly filter: DiscoveryFilter
  readonly ingredient: DiscoveryIngredientFilter
  readonly onFirstPageSuccess?: ((normalizedQuery: string, resultCount: number) => void) | undefined
  readonly onFirstPageResult?:
    | ((queryKind: "browse" | "search", filter: DiscoveryFilter, resultCount: number) => void)
    | undefined
  readonly onFirstPageFailure?:
    | ((queryKind: "browse" | "search", reason: "network" | "http" | "invalid_response") => void)
    | undefined
}

class DiscoveryQueryError extends Error {
  readonly reason: "http" | "invalid_response"

  constructor(reason: "http" | "invalid_response") {
    super(reason)
    this.reason = reason
  }
}

type DiscoveryRegionRequestConditions = Pick<Query, "filter" | "ingredient" | "query">

export const buildDiscoveryRegionRequestUrl = (input: DiscoveryRegionRequestConditions): string => {
  const params = new URLSearchParams({
    mode: "regions",
    filter: input.filter,
    ingredient: input.ingredient,
  })
  if (input.query.trim()) params.set("query", input.query)
  return `/api/places?${params.toString()}`
}

export function useFoodMapQuery(input: Query) {
  const [regions, setRegions] = useState<DiscoveryRegionsResponse>()
  const [page, setPage] = useState<DiscoveryPlacesResponse>()
  const [loading, setLoading] = useState(true)
  const [failedRequestId, setFailedRequestId] = useState<string>()
  const [regionsFailed, setRegionsFailed] = useState(false)
  const [regionsLoading, setRegionsLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [cursor, setCursor] = useState<{ readonly key: string; readonly value: string }>()
  const active = useRef(0)
  const reportedRequest = useRef(0)
  const regionsActive = useRef(0)
  const params = new URLSearchParams({
    mode: "places",
    filter: input.filter,
    ingredient: input.ingredient,
    limit: "50",
  })
  if (input.query.trim()) params.set("query", input.query)
  if (input.region) params.set("region", input.region)
  if (input.bounds) {
    params.set("south", String(input.bounds.southWest.latitude))
    params.set("west", String(input.bounds.southWest.longitude))
    params.set("north", String(input.bounds.northEast.latitude))
    params.set("east", String(input.bounds.northEast.longitude))
  }
  const key = params.toString()
  const request = useMemo(() => ({ key, retry }), [key, retry])
  const requestId = `${key}\u0000${retry}`
  const failed = failedRequestId === requestId
  const regionRequestUrl = useMemo(
    () =>
      buildDiscoveryRegionRequestUrl({
        query: input.query,
        filter: input.filter,
        ingredient: input.ingredient,
      }),
    [input.filter, input.ingredient, input.query],
  )
  const regionRequest = useMemo(() => ({ url: regionRequestUrl, retry }), [regionRequestUrl, retry])
  const [loadedKey, setLoadedKey] = useState(key)
  const current = loadedKey === key
  const requestCursor = cursor?.key === key ? cursor.value : undefined
  useEffect(() => {
    const controller = new AbortController()
    const generation = ++regionsActive.current
    setRegions(undefined)
    setRegionsFailed(false)
    setRegionsLoading(true)
    const timeout = window.setTimeout(() => {
      if (controller.signal.aborted || generation !== regionsActive.current) return
      setRegionsFailed(true)
      setRegionsLoading(false)
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
    void fetchWithTransientRetry(regionRequest.url, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new TypeError("Discovery regions unavailable")
        const parsed = DiscoveryRegionsResponseSchema.parse(await response.json())
        if (controller.signal.aborted || generation !== regionsActive.current) return
        window.clearTimeout(timeout)
        setRegions(parsed)
        setRegionsLoading(false)
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          !controller.signal.aborted &&
          generation === regionsActive.current
        ) {
          window.clearTimeout(timeout)
          setRegionsFailed(true)
          setRegionsLoading(false)
        }
      })
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [regionRequest])
  useEffect(() => {
    const generation = ++active.current
    if (!input.ready) {
      setFailedRequestId(undefined)
      return
    }
    const controller = new AbortController()
    const localRequestKey = generation
    if (!requestCursor) setCursor(undefined)
    setLoading(true)
    setFailedRequestId(undefined)
    const timeout = window.setTimeout(() => {
      if (controller.signal.aborted || generation !== active.current) return
      setFailedRequestId(requestId)
      setLoading(false)
      controller.abort()
      if (!requestCursor && reportedRequest.current !== localRequestKey) {
        reportedRequest.current = localRequestKey
        input.onFirstPageFailure?.(
          normalizeDiscoveryQuery(input.query).length === 0 ? "browse" : "search",
          "network",
        )
      }
    }, REQUEST_TIMEOUT_MS)
    const url = `/api/places?${request.key}${requestCursor ? `&cursor=${encodeURIComponent(requestCursor)}` : ""}`
    void fetchWithTransientRetry(url, controller.signal)
      .then(async (response) => {
        if (!response.ok) throw new DiscoveryQueryError("http")
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          throw new DiscoveryQueryError("invalid_response")
        }
        const parsedResult = DiscoveryPlacesResponseSchema.safeParse(payload)
        if (!parsedResult.success) throw new DiscoveryQueryError("invalid_response")
        const parsed = parsedResult.data
        if (controller.signal.aborted || generation !== active.current) return
        window.clearTimeout(timeout)
        setPage((previous) =>
          requestCursor && previous
            ? { ...parsed, results: [...previous.results, ...parsed.results] }
            : parsed,
        )
        setLoadedKey(key)
        setLoading(false)
        const normalizedQuery = normalizeDiscoveryQuery(input.query)
        if (!requestCursor && reportedRequest.current !== localRequestKey) {
          reportedRequest.current = localRequestKey
          const queryKind = normalizedQuery.length === 0 ? "browse" : "search"
          input.onFirstPageResult?.(queryKind, input.filter, parsed.total)
          if (normalizedQuery) input.onFirstPageSuccess?.(normalizedQuery, parsed.total)
        }
      })
      .catch((error: unknown) => {
        if (error instanceof Error && !controller.signal.aborted && generation === active.current) {
          window.clearTimeout(timeout)
          setFailedRequestId(requestId)
          setLoading(false)
          if (!requestCursor && reportedRequest.current !== localRequestKey) {
            reportedRequest.current = localRequestKey
            input.onFirstPageFailure?.(
              normalizeDiscoveryQuery(input.query).length === 0 ? "browse" : "search",
              error instanceof DiscoveryQueryError ? error.reason : "network",
            )
          }
        }
      })
    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [
    key,
    request,
    requestId,
    input.ready,
    input.filter,
    input.onFirstPageFailure,
    input.onFirstPageResult,
    input.onFirstPageSuccess,
    input.query,
    requestCursor,
  ])
  return {
    regions,
    sortBasis: input.ready && current ? page?.sortBasis : undefined,
    sortOrigin: input.ready && current ? page?.sortOrigin : undefined,
    results: input.ready && current ? (page?.results ?? []) : [],
    total: input.ready ? (current ? (page?.total ?? 0) : 0) : (regions?.total ?? 0),
    loading: input.ready && !failed && (loading || !current),
    failed,
    regionsFailed,
    regionsLoading,
    loadMore:
      input.ready && current && page?.nextCursor
        ? () => {
            if (page.nextCursor) setCursor({ key, value: page.nextCursor })
          }
        : undefined,
    retry: () => {
      setCursor(undefined)
      setRetry((value) => value + 1)
    },
    retryRegions: () => setRetry((value) => value + 1),
  }
}
