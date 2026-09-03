"use client"

import { useCallback, useMemo, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import { normalizeDiscoveryQuery } from "../../lib/domain/discovery"
import type { PlaceFilter } from "../../lib/domain/filter"
import { DEFAULT_VIEW, type GeoPoint, type MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import { MapDiscoverySurface } from "./map-discovery-surface"
import { useCatalog } from "./use-catalog"
import { useDetailSelection } from "./use-detail-selection"
import { useDiscoveryState } from "./use-discovery-state"
import { useLocationControl } from "./use-location-control"
import { useNaverMapAdapter } from "./use-naver-map-adapter"

export type MapShareState = {
  readonly appliedBounds?: ViewportBounds | undefined
  readonly center: GeoPoint
  readonly query: string
  readonly tag: PlaceFilter
  readonly zoom: number
}

type Properties = {
  readonly clientId?: string | undefined
  readonly directionsTargets?: Readonly<Partial<Record<Place["id"], DirectionsTarget>>> | undefined
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
  readonly initialCatalogState?: "ready" | "error" | undefined
  readonly initialMapState?: MapShareState | undefined
  readonly initialSelectedSlug?: string | undefined
  readonly initialSelectionSource?: "shared_link" | undefined
}

export function MapDiscovery({
  clientId,
  initialMenus,
  initialPlaces,
  initialCatalogState = "ready",
  initialMapState,
  initialSelectedSlug,
  initialSelectionSource,
  directionsTargets,
}: Properties) {
  const [filter, setFilter] = useState<PlaceFilter>(initialMapState?.tag ?? "all")
  const [view, setView] = useState<MapView>(
    initialMapState ? { ...initialMapState.center, zoom: initialMapState.zoom } : DEFAULT_VIEW,
  )
  const catalog = useCatalog({
    initialMenus,
    initialPlaces,
    initialState: initialCatalogState,
  })
  const publishedPlaces = useMemo(
    () => catalog.places.filter((place) => place.published),
    [catalog.places],
  )
  const [userLocation, setUserLocation] = useState<GeoPoint>()
  const discovery = useDiscoveryState({
    initialBounds: initialMapState?.appliedBounds,
    initialQuery: initialMapState?.query,
    menus: catalog.menus,
    places: publishedPlaces,
    tag: filter,
    userLocation,
  })
  const discoverySnapshot = useMemo(
    () => ({
      appliedBounds: discovery.appliedBounds,
      query: discovery.query,
      trayExpanded: discovery.trayExpanded,
    }),
    [discovery.appliedBounds, discovery.query, discovery.trayExpanded],
  )
  const visiblePlaceSlugs = useMemo(
    () => new Set(discovery.results.map(({ place }) => place.slug)),
    [discovery.results],
  )
  const detail = useDetailSelection({
    catalogState: catalog.state,
    discoverySnapshot,
    filter,
    initialPlaces: publishedPlaces,
    initialSelectedSlug,
    initialSelectionSource,
    restoreDiscovery: discovery.restore,
    setFilter,
    setView,
    view,
    visiblePlaceSlugs,
  })
  const selectedPlace = useMemo(
    () => publishedPlaces.find((place) => place.slug === detail.selectedSlug),
    [detail.selectedSlug, publishedPlaces],
  )
  const markers = useMemo(
    () =>
      discovery.results.map(({ place }) => ({
        iconUrl:
          selectedPlace?.id === place.id
            ? "/markers/marker-selected.svg"
            : "/markers/marker-health.svg",
        label: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        onSelect: () => detail.open(place, "map"),
      })),
    [detail.open, discovery.results, selectedPlace?.id],
  )
  const handleViewportChanged = useCallback(
    (snapshot: { readonly bounds: ViewportBounds; readonly view: MapView }): void => {
      discovery.recordMovement(snapshot.bounds)
      setView(snapshot.view)
    },
    [discovery.recordMovement],
  )
  const naverMap = useNaverMapAdapter({
    clientId,
    markers,
    onViewportChanged: handleViewportChanged,
    view,
  })
  const recordLocationExploration = useCallback(
    () => detail.recordSharedExploration("location"),
    [detail.recordSharedExploration],
  )
  const handleLocationInside = useCallback(
    (point: GeoPoint, zoom: number, shouldRecenter: boolean): void => {
      setUserLocation(point)
      if (shouldRecenter) naverMap.recenter(point, zoom)
    },
    [naverMap.recenter],
  )
  const location = useLocationControl({
    onInside: handleLocationInside,
    onSharedExploration: recordLocationExploration,
    preserveInitialView: initialMapState !== undefined,
    setView,
  })
  const resultCountBucket =
    discovery.results.length === 0
      ? "0"
      : discovery.results.length <= 5
        ? "1_5"
        : discovery.results.length <= 20
          ? "6_20"
          : "21_plus"

  return (
    <MapDiscoverySurface
      model={{
        adapter: {
          containerRef: naverMap.containerRef,
          retry: naverMap.load,
          state: naverMap.state,
        },
        catalog: {
          reload: catalog.reload,
          state: catalog.state,
          menus: catalog.menus,
          results: discovery.results,
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
          onSelectPlace: detail.open,
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
        discovery: {
          applyArea: () => {
            discovery.applyArea()
            captureProductAnalytics({ event: "search_area_applied", properties: {} })
          },
          onSearchCommit: () => {
            if (normalizeDiscoveryQuery(discovery.query).length === 0) return
            captureProductAnalytics({
              event: "search_used",
              properties: { result_count_bucket: resultCountBucket },
            })
          },
          pending: discovery.pending,
          query: discovery.query,
          setQuery: discovery.setQuery,
          setTrayExpanded: (expanded) => {
            discovery.setTrayExpanded(expanded)
            if (expanded) captureProductAnalytics({ event: "result_list_opened", properties: {} })
          },
          trayExpanded: discovery.trayExpanded,
        },
        location: { request: location.request, state: location.location },
        view,
      }}
    />
  )
}
