"use client"

import { useCallback, useMemo, useState } from "react"
import type { Menu, Place } from "../../lib/domain/catalog"
import { filterDiscoveryPlaces } from "../../lib/domain/discovery"
import { sortPlacesByDistance } from "../../lib/domain/distance"
import type { CookingFilter, IngredientFilter, PlaceFilter } from "../../lib/domain/filter"
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
  readonly initialIngredient?: IngredientFilter | undefined
  readonly initialCooking?: CookingFilter | undefined
  readonly serverQuery?: boolean | undefined
  readonly userLocation?: GeoPoint | undefined
}

export function useDiscoveryState({
  initialBounds,
  initialQuery = "",
  menus,
  places,
  tag,
  initialIngredient = "all",
  initialCooking = "all",
  serverQuery = false,
  userLocation,
}: Input) {
  const [query, setQuery] = useState(initialQuery)
  const [ingredient, setIngredient] = useState(initialIngredient)
  const [cooking, setCooking] = useState(initialCooking)
  const [hasArea, setHasArea] = useState(initialBounds !== undefined)
  const [viewport, setViewport] = useState(() =>
    createViewportState(initialBounds ?? DISPLAY_BOUNDS),
  )
  const [trayExpanded, setTrayExpanded] = useState(true)
  const filteredPlaces = useMemo(
    () =>
      filterDiscoveryPlaces({
        appliedBounds: serverQuery ? undefined : viewport.appliedBounds,
        menus,
        places,
        query,
        tag,
        ingredient,
        cooking,
      }),
    [menus, places, query, tag, ingredient, cooking, serverQuery, viewport.appliedBounds],
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
  const applyArea = useCallback(() => {
    setHasArea(true)
    setViewport((current) => applyCurrentViewport(current))
  }, [])
  const applyBounds = useCallback((bounds: ViewportBounds) => {
    setHasArea(true)
    setViewport(createViewportState(bounds))
  }, [])
  const recordMovement = useCallback(
    (bounds: ViewportBounds) => setViewport((current) => recordViewportMovement(current, bounds)),
    [],
  )
  const restore = useCallback(
    (state: {
      readonly appliedBounds: ViewportBounds
      readonly query: string
      readonly trayExpanded: boolean
      readonly ingredient?: IngredientFilter | undefined
      readonly cooking?: CookingFilter | undefined
    }) => {
      setQuery(state.query)
      setIngredient(state.ingredient ?? "all")
      setCooking(state.cooking ?? "all")
      setHasArea(true)
      setTrayExpanded(state.trayExpanded)
      setViewport({ appliedBounds: state.appliedBounds, currentBounds: state.appliedBounds })
    },
    [],
  )

  return {
    appliedBounds: viewport.appliedBounds,
    applyBounds,
    applyArea,
    hasArea,
    clearArea: () => setHasArea(false),
    ingredient,
    cooking,
    pending,
    query,
    recordMovement,
    results,
    restore,
    setQuery,
    setIngredient,
    setCooking,
    setTrayExpanded,
    trayExpanded,
  }
}
