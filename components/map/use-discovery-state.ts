"use client"

import { useCallback, useMemo, useState } from "react"
import type { Menu, Place } from "../../lib/domain/catalog"
import { filterDiscoveryPlaces } from "../../lib/domain/discovery"
import { sortPlacesByDistance } from "../../lib/domain/distance"
import type { PlaceFilter } from "../../lib/domain/filter"
import { DISPLAY_BOUNDS, type GeoPoint } from "../../lib/domain/geo"
import {
  applyCurrentViewport,
  createViewportState,
  recordViewportMovement,
  type ViewportBounds,
} from "../../lib/domain/viewport"

type Input = {
  readonly initialBounds?: ViewportBounds | undefined
  readonly initialQuery?: string | undefined
  readonly menus: readonly Menu[]
  readonly places: readonly Place[]
  readonly tag: PlaceFilter
  readonly userLocation?: GeoPoint | undefined
}

export function useDiscoveryState({
  initialBounds,
  initialQuery = "",
  menus,
  places,
  tag,
  userLocation,
}: Input) {
  const [query, setQuery] = useState(initialQuery)
  const [viewport, setViewport] = useState(() =>
    createViewportState(initialBounds ?? DISPLAY_BOUNDS),
  )
  const [trayExpanded, setTrayExpanded] = useState(true)
  const filteredPlaces = useMemo(
    () =>
      filterDiscoveryPlaces({
        appliedBounds: viewport.appliedBounds,
        menus,
        places,
        query,
        tag,
      }),
    [menus, places, query, tag, viewport.appliedBounds],
  )
  const results = useMemo(
    () =>
      sortPlacesByDistance({
        appliedBounds: viewport.appliedBounds,
        places: filteredPlaces,
        ...(userLocation === undefined ? {} : { userLocation }),
      }),
    [filteredPlaces, userLocation, viewport.appliedBounds],
  )
  const pending = viewport.currentBounds !== viewport.appliedBounds
  const applyArea = useCallback(() => setViewport((current) => applyCurrentViewport(current)), [])
  const recordMovement = useCallback(
    (bounds: ViewportBounds) => setViewport((current) => recordViewportMovement(current, bounds)),
    [],
  )
  const restore = useCallback(
    (state: {
      readonly appliedBounds: ViewportBounds
      readonly query: string
      readonly trayExpanded: boolean
    }) => {
      setQuery(state.query)
      setTrayExpanded(state.trayExpanded)
      setViewport({ appliedBounds: state.appliedBounds, currentBounds: state.appliedBounds })
    },
    [],
  )

  return {
    appliedBounds: viewport.appliedBounds,
    applyArea,
    pending,
    query,
    recordMovement,
    results,
    restore,
    setQuery,
    setTrayExpanded,
    trayExpanded,
  }
}
