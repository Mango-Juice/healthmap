"use client"

import { useCallback, useEffect, useRef } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"

export type SharedEntrySource = "place_share" | "map_share"
export type SharedExplorationAction = "location" | "filter" | "place_opened"

export function useSharedEntryAnalytics(didResolveEntry: boolean) {
  const sourceRef = useRef<SharedEntrySource | undefined>(undefined)

  const recordExploration = useCallback((action: SharedExplorationAction): void => {
    const source = sourceRef.current
    if (source !== undefined)
      captureProductAnalytics({
        event: "shared_visit_explored",
        properties: { source, action },
      })
  }, [])

  useEffect(() => {
    if (!didResolveEntry) return
    captureProductAnalytics({
      event: "map_viewed",
      properties: { source: sourceRef.current ?? "direct" },
    })
  }, [didResolveEntry])

  return { recordExploration, sourceRef }
}
