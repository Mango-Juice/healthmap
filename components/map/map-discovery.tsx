"use client"

import { useCallback, useMemo, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import { filterPlaces, type PlaceFilter } from "../../lib/domain/filter"
import { DEFAULT_VIEW, type MapView } from "../../lib/domain/geo"
import { MapDiscoverySurface } from "./map-discovery-surface"
import { useCatalog } from "./use-catalog"
import { useDetailSelection } from "./use-detail-selection"
import { useLocationControl } from "./use-location-control"
import { useNaverMapAdapter } from "./use-naver-map-adapter"

type Properties = {
  readonly clientId?: string | undefined
  readonly directionsTargets?: Readonly<Partial<Record<Place["id"], DirectionsTarget>>> | undefined
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
  readonly initialCatalogState?: "ready" | "error" | undefined
}

export function MapDiscovery({
  clientId,
  initialMenus,
  initialPlaces,
  initialCatalogState = "ready",
  directionsTargets,
}: Properties) {
  const [filter, setFilter] = useState<PlaceFilter>("all")
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const catalog = useCatalog({
    initialMenus,
    initialPlaces,
    initialState: initialCatalogState,
  })
  const naverMap = useNaverMapAdapter({ clientId, view })
  const detail = useDetailSelection({ filter, initialPlaces, setFilter, setView, view })
  const recordLocationExploration = useCallback(
    () => detail.recordSharedExploration("location"),
    [detail.recordSharedExploration],
  )
  const location = useLocationControl({
    onInside: naverMap.recenter,
    onSharedExploration: recordLocationExploration,
    setView,
  })
  const publishedPlaces = useMemo(
    () => catalog.places.filter((place) => place.published),
    [catalog.places],
  )
  const visiblePlaces = useMemo(
    () => filterPlaces(publishedPlaces, filter),
    [filter, publishedPlaces],
  )
  const selectedPlace = useMemo(
    () => publishedPlaces.find((place) => place.slug === detail.selectedSlug),
    [detail.selectedSlug, publishedPlaces],
  )
  const isSampleCatalog = catalog.places.every((place) => place.dataMode === "mock")

  return (
    <MapDiscoverySurface
      model={{
        adapter: {
          containerRef: naverMap.containerRef,
          retry: naverMap.load,
          state: naverMap.state,
        },
        catalog: {
          isSample: isSampleCatalog,
          reload: catalog.reload,
          state: catalog.state,
          visiblePlaces,
        },
        detail: {
          clear: detail.clear,
          directionsTargets,
          finishClose: detail.finishClose,
          isMobile: detail.isMobile,
          linkNotice: detail.linkNotice,
          menus: catalog.menus,
          motion: detail.motion,
          phase: detail.phase,
          selectedPlace,
          setPhase: detail.setPhase,
          setSurfaceRef: detail.setSurfaceRef,
        },
        filter: {
          selected: filter,
          onSelect: (value) => {
            setFilter(value)
            captureProductAnalytics({ event: "filter_selected", properties: { tag: value } })
            detail.recordSharedExploration("filter")
          },
        },
        location: { request: location.request, state: location.location },
        openPlace: detail.open,
        view,
      }}
    />
  )
}
