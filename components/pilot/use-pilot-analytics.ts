"use client"

import { useCallback, useEffect, useRef } from "react"

import { captureProductAnalytics } from "../../lib/analytics/browser"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"
import type { PilotDiscoveryFilter } from "../../lib/pilot/discovery"
import type { PilotPlaceDto as PilotPlace } from "../../lib/pilot/dto"

export type PilotLocationOutcome = "resolved" | "denied" | "unavailable" | "timeout" | "unsupported"

const resultCountBucket = (count: number): "0" | "1_5" | "6_20" | "21_plus" => {
  if (count === 0) return "0"
  if (count <= 5) return "1_5"
  if (count <= 20) return "6_20"
  return "21_plus"
}

export function usePilotAnalytics() {
  const viewed = useRef(false)
  const searchIntent = useRef("")
  const searchCaptured = useRef(false)

  useEffect(() => {
    if (viewed.current) return
    viewed.current = true
    captureProductAnalytics({ event: "map_viewed", properties: { source: "direct" } })
  }, [])

  return {
    locationResolved: useCallback((outcome: PilotLocationOutcome): void => {
      captureProductAnalytics({ event: "location_resolved", properties: { outcome } })
    }, []),
    filterSelected: useCallback((tag: PilotDiscoveryFilter): void => {
      captureProductAnalytics({ event: "filter_selected", properties: { tag } })
    }, []),
    placeOpened: useCallback((placeId: PilotPlace["id"], source: "map" | "list"): void => {
      captureProductAnalytics({ event: "place_opened", properties: { place_id: placeId, source } })
    }, []),
    directionsOpened: useCallback((placeId: PilotPlace["id"]): void => {
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
  }
}
