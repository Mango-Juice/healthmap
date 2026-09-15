"use client"

import { useCallback, useEffect, useRef } from "react"

import { captureProductAnalytics, getProductAnalyticsOptOut } from "../../lib/analytics/browser"
import type { DiscoveryPlaceDto as DiscoveryPlace } from "../../lib/discovery/dto"
import type { DiscoveryFilter } from "../../lib/discovery/menu-selection"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"

export type DiscoveryLocationOutcome =
  | "resolved"
  | "denied"
  | "unavailable"
  | "timeout"
  | "unsupported"

const resultCountBucket = (count: number): "0" | "1_5" | "6_20" | "21_plus" => {
  if (count === 0) return "0"
  if (count <= 5) return "1_5"
  if (count <= 20) return "6_20"
  return "21_plus"
}

export function useFoodMapAnalytics() {
  const viewed = useRef(false)
  const searchIntent = useRef("")
  const searchCaptured = useRef(false)

  const mapViewed = useCallback(() => {
    if (viewed.current || getProductAnalyticsOptOut()) return
    viewed.current = true
    captureProductAnalytics({ event: "map_viewed", properties: { source: "direct" } })
  }, [])

  useEffect(mapViewed, [mapViewed])

  return {
    mapViewed,
    locationResolved: useCallback((outcome: DiscoveryLocationOutcome): void => {
      captureProductAnalytics({ event: "location_resolved", properties: { outcome } })
    }, []),
    filterSelected: useCallback((tag: DiscoveryFilter): void => {
      captureProductAnalytics({ event: "filter_selected", properties: { tag } })
    }, []),
    placeOpened: useCallback((placeId: DiscoveryPlace["id"], source: "map" | "list"): void => {
      captureProductAnalytics({ event: "place_opened", properties: { place_id: placeId, source } })
    }, []),
    directionsOpened: useCallback((placeId: DiscoveryPlace["id"]): void => {
      captureProductAnalytics({
        event: "directions_opened",
        properties: { place_id: placeId, source: "naver_route" },
      })
    }, []),
    resultListOpened: useCallback((): void => {
      captureProductAnalytics({ event: "result_list_opened", properties: {} })
    }, []),
    searchAreaApplied: useCallback((): void => {
      captureProductAnalytics({ event: "search_area_applied", properties: {} })
    }, []),
    searchIntentChanged: useCallback((query: string): void => {
      const normalizedQuery = normalizeDiscoveryQuery(query)
      if (normalizedQuery === searchIntent.current) return
      searchIntent.current = normalizedQuery
      searchCaptured.current = false
    }, []),
    searchSucceeded: useCallback((normalizedQuery: string, resultCount: number): void => {
      if (
        normalizedQuery !== searchIntent.current ||
        normalizedQuery.length === 0 ||
        searchCaptured.current
      )
        return
      searchCaptured.current = true
      captureProductAnalytics({
        event: "search_used",
        properties: { result_count_bucket: resultCountBucket(resultCount) },
      })
    }, []),
    catalogResultReceived: useCallback(
      (queryKind: "browse" | "search", filter: DiscoveryFilter, resultCount: number): void => {
        captureProductAnalytics({
          event: "catalog_result_received",
          properties: {
            query_kind: queryKind,
            filter,
            result_count_bucket: resultCountBucket(resultCount),
          },
        })
      },
      [],
    ),
    catalogRequestFailed: useCallback(
      (queryKind: "browse" | "search", reason: "network" | "http" | "invalid_response"): void => {
        captureProductAnalytics({
          event: "catalog_request_failed",
          properties: { query_kind: queryKind, reason },
        })
      },
      [],
    ),
  }
}
