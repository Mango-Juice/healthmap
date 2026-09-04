"use client"

import { useCallback, useMemo, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { PlaceFilter } from "../../lib/domain/filter"
import { DEFAULT_VIEW, type GeoPoint, type MapView } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import { recordDiscoverySearch } from "./discovery-analytics"
import type { MapDiscoveryProperties } from "./map-discovery-props"
import { MapDiscoverySurface } from "./map-discovery-surface"
import { useCatalog } from "./use-catalog"
import { useDetailSelection } from "./use-detail-selection"
import { useDiscoveryMarkers } from "./use-discovery-markers"
import { useDiscoveryState } from "./use-discovery-state"
import { useLocationControl } from "./use-location-control"
import { useNaverMapAdapter } from "./use-naver-map-adapter"
import { usePublicDiscoveryQuery } from "./use-public-discovery-query"
import { useSelectablePlaces } from "./use-selectable-places"

export type { MapShareState } from "./map-discovery-props"

export function MapDiscovery({
  clientId,
  initialMenus,
  initialCatalogQuery,
  initialPlaces,
  initialRegions,
  initialTotal,
  initialNextCursor,
  initialCatalogState = "ready",
  initialMapState,
  initialSelectedSlug,
  initialSelectedPlace,
  initialSelectionSource,
  directionsTargets,
}: MapDiscoveryProperties) {
  const [filter, setFilter] = useState<PlaceFilter>(initialMapState?.tag ?? "all")
  const [view, setView] = useState<MapView>(
    initialMapState
      ? { ...initialMapState.center, zoom: initialMapState.zoom }
      : initialRegions !== undefined
        ? { latitude: 36.2, longitude: 127.8, zoom: 7 }
        : DEFAULT_VIEW,
  )
  const catalog = useCatalog({
    initialMenus,
    initialPlaces,
    initialState: initialCatalogState,
    ...(initialCatalogQuery === undefined ? {} : { initialQuery: initialCatalogQuery }),
    ...(initialRegions === undefined ? {} : { initialRegions }),
    ...(initialTotal === undefined ? {} : { initialTotal }),
    ...(initialNextCursor === undefined ? {} : { initialNextCursor }),
  })
  const { publishedPlaces, selectablePlaces } = useSelectablePlaces(
    catalog.places,
    initialSelectedPlace,
  )
  const [userLocation, setUserLocation] = useState<GeoPoint>()
  const discovery = useDiscoveryState({
    initialBounds: initialMapState?.appliedBounds,
    initialQuery: initialMapState?.query,
    menus: catalog.menus,
    places: publishedPlaces,
    tag: filter,
    userLocation,
    initialIngredient: initialMapState?.ingredient,
    initialCooking: initialMapState?.cooking,
    serverQuery: initialRegions !== undefined,
  })
  usePublicDiscoveryQuery({
    enabled: initialRegions !== undefined,
    hasArea: discovery.hasArea,
    bounds: discovery.appliedBounds,
    queryCatalog: catalog.queryCatalog,
    query: discovery.query,
    tag: filter,
    ingredient: discovery.ingredient,
    cooking: discovery.cooking,
  })
  const discoverySnapshot = useMemo(
    () => ({
      appliedBounds: discovery.appliedBounds,
      query: discovery.query,
      trayExpanded: discovery.trayExpanded,
      ingredient: discovery.ingredient,
      cooking: discovery.cooking,
    }),
    [
      discovery.appliedBounds,
      discovery.query,
      discovery.trayExpanded,
      discovery.ingredient,
      discovery.cooking,
    ],
  )
  const visiblePlaceSlugs = useMemo(
    () => new Set(discovery.results.map(({ place }) => place.slug)),
    [discovery.results],
  )
  const detail = useDetailSelection({
    catalogState: catalog.state,
    discoverySnapshot,
    filter,
    initialPlaces: selectablePlaces,
    initialSelectedSlug,
    initialSelectionSource,
    restoreDiscovery: discovery.restore,
    setFilter,
    setView,
    view,
    visiblePlaceSlugs,
  })
  const selectedPlace = selectablePlaces.find(({ slug }) => slug === detail.selectedSlug)
  const conditions = {
    query: discovery.query,
    tag: filter,
    ingredient: discovery.ingredient,
    cooking: discovery.cooking,
  }
  const markers = useDiscoveryMarkers({
    results: discovery.results,
    menus: catalog.menus,
    selectedPlace,
    open: detail.open,
    conditions,
  })
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
      if (shouldRecenter) {
        naverMap.recenter(point, zoom)
        if (initialRegions !== undefined)
          discovery.applyBounds({
            southWest: {
              latitude: Math.max(-90, point.latitude - 0.04),
              longitude: Math.max(-180, point.longitude - 0.04),
            },
            northEast: {
              latitude: Math.min(90, point.latitude + 0.04),
              longitude: Math.min(180, point.longitude + 0.04),
            },
          })
      }
    },
    [naverMap.recenter, initialRegions, discovery.applyBounds],
  )
  const location = useLocationControl({
    onInside: handleLocationInside,
    onSharedExploration: recordLocationExploration,
    preserveInitialView: initialMapState !== undefined,
    setView,
  })

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
          regions: catalog.regions,
          total: catalog.total,
          legacyFacets: catalog.facets,
          distanceFromUser: userLocation !== undefined,
          loadMore:
            catalog.nextCursor === null || catalog.state !== "ready" ? undefined : catalog.loadMore,
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
          legacy:
            initialRegions === undefined &&
            catalog.places.every((place) => place.schemaVersion !== "2.0.0"),
          onSelect: (value) => {
            setFilter(value)
            captureProductAnalytics({ event: "filter_selected", properties: { tag: value } })
            detail.recordSharedExploration("filter")
          },
        },
        discovery: {
          resetRegion: () => {
            discovery.clearArea()
            discovery.setQuery("")
            setView({ latitude: 36.2, longitude: 127.8, zoom: 7 })
          },
          ingredient: discovery.ingredient,
          cooking: discovery.cooking,
          setIngredient: discovery.setIngredient,
          setCooking: discovery.setCooking,
          selectRegion: (bounds) => {
            discovery.applyBounds(bounds)
            const center = {
              latitude: (bounds.southWest.latitude + bounds.northEast.latitude) / 2,
              longitude: (bounds.southWest.longitude + bounds.northEast.longitude) / 2,
            }
            setView({ ...center, zoom: 11 })
          },
          applyArea: () => {
            discovery.applyArea()
            captureProductAnalytics({ event: "search_area_applied", properties: {} })
          },
          onSearchCommit: () => recordDiscoverySearch(discovery.query, discovery.results.length),
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
