import { useCallback, useEffect, useRef, useState } from "react"
import type { GeoPoint, MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import type { MapViewportSnapshot } from "../../lib/map/adapter"
import { PILOT_NATIONAL_VIEW, PILOT_START_VIEW, pilotBoundsAround } from "../../lib/pilot/viewport"

export function usePilotViewport(point: GeoPoint | undefined) {
  const [view, setView] = useState(PILOT_START_VIEW)
  const [bounds, setBounds] = useState<ViewportBounds | undefined>(
    pilotBoundsAround(PILOT_START_VIEW),
  )
  const [region, setRegion] = useState("")
  const [pending, setPending] = useState(false)
  const followLocation = useRef(true)
  const userMoved = useRef(false)
  const requestedView = useRef(view)
  const currentViewport = useRef<MapViewportSnapshot>(undefined)
  const interact = useCallback(() => {
    followLocation.current = false
  }, [])
  const requestLocation = useCallback(() => {
    followLocation.current = true
    userMoved.current = false
    setPending(false)
  }, [])
  const markUserMovement = useCallback(() => {
    interact()
    userMoved.current = true
  }, [interact])
  const moveTo = useCallback((next: MapView) => {
    requestedView.current = next
    userMoved.current = false
    setView(next)
    setPending(false)
  }, [])
  useEffect(() => {
    if (!point || !followLocation.current) return
    setRegion("")
    setBounds(pilotBoundsAround(point))
    moveTo({ ...point, zoom: 14 })
  }, [point, moveTo])
  const onViewportChanged = useCallback((snapshot: MapViewportSnapshot) => {
    currentViewport.current = snapshot
    if (!userMoved.current) return
    const expected = requestedView.current
    const { southWest, northEast } = snapshot.bounds
    setPending(
      snapshot.view.zoom !== expected.zoom ||
        Math.abs(snapshot.view.latitude - expected.latitude) >
          (northEast.latitude - southWest.latitude) * 0.08 ||
        Math.abs(snapshot.view.longitude - expected.longitude) >
          (northEast.longitude - southWest.longitude) * 0.08,
    )
  }, [])
  const applyArea = useCallback(() => {
    if (!currentViewport.current) return
    interact()
    setRegion("")
    setBounds(currentViewport.current.bounds)
    requestedView.current = currentViewport.current.view
    userMoved.current = false
    setPending(false)
  }, [interact])
  const chooseRegion = useCallback(
    (id: string, area: ViewportBounds | undefined) => {
      interact()
      setRegion(id)
      setBounds(undefined)
      moveTo(
        area
          ? {
              latitude: (area.southWest.latitude + area.northEast.latitude) / 2,
              longitude: (area.southWest.longitude + area.northEast.longitude) / 2,
              zoom:
                Math.max(
                  area.northEast.latitude - area.southWest.latitude,
                  area.northEast.longitude - area.southWest.longitude,
                ) < 0.2
                  ? 13
                  : 11,
            }
          : PILOT_NATIONAL_VIEW,
      )
    },
    [interact, moveTo],
  )
  return {
    view,
    bounds,
    region,
    pending,
    interact,
    markUserMovement,
    requestLocation,
    onViewportChanged,
    applyArea,
    chooseRegion,
  }
}
