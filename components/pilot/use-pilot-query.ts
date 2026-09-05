import { useEffect, useMemo, useRef, useState } from "react"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"
import type { ViewportBounds } from "../../lib/domain/viewport"
import type { PilotDiscoveryFilter, PilotIngredientFilter } from "../../lib/pilot/discovery"
import {
  type PilotPlacesResponse,
  PilotPlacesResponseSchema,
  type PilotRegionsResponse,
  PilotRegionsResponseSchema,
} from "../../lib/pilot/dto"

type Query = {
  readonly ready: boolean
  readonly bounds: ViewportBounds | undefined
  readonly region: string
  readonly query: string
  readonly filter: PilotDiscoveryFilter
  readonly ingredient: PilotIngredientFilter
  readonly onFirstPageSuccess?: ((normalizedQuery: string, resultCount: number) => void) | undefined
  readonly onFirstPageResult?:
    | ((queryKind: "browse" | "search", filter: PilotDiscoveryFilter, resultCount: number) => void)
    | undefined
  readonly onFirstPageFailure?:
    | ((queryKind: "browse" | "search", reason: "network" | "http" | "invalid_response") => void)
    | undefined
}

class PilotQueryError extends Error {
  readonly reason: "http" | "invalid_response"

  constructor(reason: "http" | "invalid_response") {
    super(reason)
    this.reason = reason
  }
}

type PilotRegionRequestConditions = Pick<Query, "filter" | "ingredient" | "query">

export const buildPilotRegionRequestUrl = (input: PilotRegionRequestConditions): string => {
  const params = new URLSearchParams({
    mode: "regions",
    filter: input.filter,
    ingredient: input.ingredient,
  })
  if (input.query.trim()) params.set("query", input.query)
  return `/api/places?${params.toString()}`
}

export function usePilotQuery(input: Query) {
  const [regions, setRegions] = useState<PilotRegionsResponse>()
  const [page, setPage] = useState<PilotPlacesResponse>()
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
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
  const regionRequestUrl = useMemo(
    () =>
      buildPilotRegionRequestUrl({
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
    void fetch(regionRequest.url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new TypeError("Pilot regions unavailable")
        const parsed = PilotRegionsResponseSchema.parse(await response.json())
        if (controller.signal.aborted || generation !== regionsActive.current) return
        setRegions(parsed)
        setRegionsLoading(false)
      })
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          !controller.signal.aborted &&
          generation === regionsActive.current
        ) {
          setRegionsFailed(true)
          setRegionsLoading(false)
        }
      })
    return () => controller.abort()
  }, [regionRequest])
  useEffect(() => {
    const generation = ++active.current
    if (!input.ready) {
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const localRequestKey = generation
    if (!requestCursor) setCursor(undefined)
    setLoading(true)
    setFailed(false)
    const url = `/api/places?${request.key}${requestCursor ? `&cursor=${encodeURIComponent(requestCursor)}` : ""}`
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new PilotQueryError("http")
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          throw new PilotQueryError("invalid_response")
        }
        const parsedResult = PilotPlacesResponseSchema.safeParse(payload)
        if (!parsedResult.success) throw new PilotQueryError("invalid_response")
        const parsed = parsedResult.data
        if (controller.signal.aborted || generation !== active.current) return
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
          setFailed(true)
          setLoading(false)
          if (!requestCursor && reportedRequest.current !== localRequestKey) {
            reportedRequest.current = localRequestKey
            input.onFirstPageFailure?.(
              normalizeDiscoveryQuery(input.query).length === 0 ? "browse" : "search",
              error instanceof PilotQueryError ? error.reason : "network",
            )
          }
        }
      })
    return () => controller.abort()
  }, [
    key,
    request,
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
    loading: input.ready && (loading || !current),
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
