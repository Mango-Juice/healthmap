"use client"

import { useCallback, useEffect, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import {
  beginLocationRequest,
  DEFAULT_VIEW,
  LOCATION_OPTIONS,
  type LocationState,
  type MapView,
  resolveLocationOutcome,
} from "../../lib/domain/geo"

type LocationControlInput = {
  readonly onInside: (point: MapView, zoom: number) => void
  readonly onSharedExploration: () => void
  readonly setView: (view: MapView) => void
}

export function useLocationControl({
  onInside,
  onSharedExploration,
  setView,
}: LocationControlInput) {
  const [location, setLocation] = useState<LocationState>(beginLocationRequest)

  const request = useCallback(
    (isUserRequested: boolean): void => {
      if (isUserRequested) onSharedExploration()
      setLocation(beginLocationRequest())
      if (navigator.geolocation === undefined) {
        const next = resolveLocationOutcome({ kind: "unsupported" })
        setLocation(next)
        captureProductAnalytics({ event: "location_resolved", properties: { outcome: next.kind } })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const next = resolveLocationOutcome({
            kind: "success",
            point: { latitude: position.coords.latitude, longitude: position.coords.longitude },
          })
          setLocation(next)
          captureProductAnalytics({
            event: "location_resolved",
            properties: { outcome: next.kind },
          })
          if (next.kind === "inside") {
            const view = { ...next.point, zoom: DEFAULT_VIEW.zoom }
            setView(view)
            onInside(view, DEFAULT_VIEW.zoom)
          }
        },
        (error) => {
          const next = resolveLocationOutcome({ kind: "error", code: error.code })
          setLocation(next)
          captureProductAnalytics({
            event: "location_resolved",
            properties: { outcome: next.kind },
          })
        },
        LOCATION_OPTIONS,
      )
    },
    [onInside, onSharedExploration, setView],
  )

  useEffect(() => request(false), [request])

  return { location, request }
}
