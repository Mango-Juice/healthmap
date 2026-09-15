"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  DiscoveryPlaceDto as DiscoveryPlace,
  DiscoveryRegionDto,
} from "../../lib/discovery/dto"
import {
  type DiscoveryFilter,
  type DiscoveryIngredientFilter,
  markerIconForMenus,
  markerZIndex,
} from "../../lib/discovery/menu-selection"
import { AnalyticsSettings } from "../analytics/analytics-settings"
import { ApplicationMasthead } from "../ui/application-masthead"
import { PlusIcon } from "../ui/health-map-icons"
import { FoodMapAreaRecovery } from "./food-map-area-recovery"
import { FoodMapControls } from "./food-map-controls"
import { FoodMapDetail } from "./food-map-detail"
import styles from "./food-map-discovery.module.css"
import { FoodMapDock } from "./food-map-dock"
import { FoodMapDrawerHandle } from "./food-map-drawer-handle"
import { FoodMapFilters } from "./food-map-filters"
import { FoodMapResults } from "./food-map-results"
import { FoodMapSearchControls } from "./food-map-search-controls"
import { useFoodMapAnalytics } from "./use-food-map-analytics"
import { useFoodMapGesture } from "./use-food-map-gesture"
import { useFoodMapLocation } from "./use-food-map-location"
import { useFoodMapQuery } from "./use-food-map-query"
import { useFoodMapSheetMotion } from "./use-food-map-sheet-motion"
import { useFoodMapViewport } from "./use-food-map-viewport"
import { useNaverMapAdapter } from "./use-naver-map-adapter"

type Properties = {
  readonly clientId?: string | undefined
}

type SelectionOrigin = "list" | "map"

export function FoodMap({ clientId }: Properties) {
  const analytics = useFoodMapAnalytics()
  const [filter, setFilter] = useState<DiscoveryFilter>("all")
  const [ingredient, setIngredient] = useState<DiscoveryIngredientFilter>("all")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<DiscoveryPlace["id"]>()
  const [trayExpanded, setTrayExpanded] = useState(false)
  const [locationRequest, setLocationRequest] = useState(0)
  const [compactMarkers, setCompactMarkers] = useState(false)
  const expireLocationFailure = useCallback(() => setLocationRequest(0), [])
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const recoveryHeading = useRef<HTMLHeadingElement>(null)
  const resultsHeading = useRef<HTMLHeadingElement>(null)
  const resultsScroll = useRef<HTMLDivElement>(null)
  const emptyHeading = useRef<HTMLElement>(null)
  const pendingRecovery = useRef<string | undefined>(undefined)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [focusRecoveredResults, setFocusRecoveredResults] = useState(false)
  const selectedIdRef = useRef<DiscoveryPlace["id"]>(undefined)
  const selectionTrigger = useRef<HTMLElement | null>(null)
  const selectionScrollTop = useRef(0)
  const selectionOrigin = useRef<SelectionOrigin>("map")
  const pendingReturn = useRef<
    | {
        readonly element: HTMLElement | null
        readonly origin: SelectionOrigin
        readonly placeId: DiscoveryPlace["id"]
        readonly queryKey: string
        readonly scrollTop: number
      }
    | undefined
  >(undefined)
  const location = useFoodMapLocation({ onOutcome: analytics.locationResolved })
  const viewport = useFoodMapViewport(location.point)
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = () => setCompactMarkers(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  const catalog = useFoodMapQuery({
    ready: true,
    bounds: viewport.bounds,
    region: viewport.region,
    query,
    filter,
    ingredient,
    onFirstPageFailure: analytics.catalogRequestFailed,
    onFirstPageResult: analytics.catalogResultReceived,
    onFirstPageSuccess: analytics.searchSucceeded,
  })
  const visibleResults = catalog.results
  const queryKey = `${query}\u0000${filter}\u0000${ingredient}\u0000${viewport.region ?? ""}\u0000${viewport.bounds ? JSON.stringify(viewport.bounds) : ""}`
  const empty = !catalog.loading && !catalog.failed && catalog.total === 0
  const outsideRegions = catalog.regions?.regions ?? []
  const outsideCount = catalog.regions?.total
  const canRecover =
    empty &&
    !catalog.regionsLoading &&
    !catalog.regionsFailed &&
    outsideCount !== undefined &&
    outsideCount > 0
  const emptyHint = query.trim()
    ? "검색어를 바꿔보세요."
    : filter !== "all" || ingredient !== "all"
      ? "필터를 바꿔보세요."
      : "지도를 옮겨보세요."
  useEffect(() => {
    if (empty) setTrayExpanded(false)
  }, [empty])
  const selectedResult = visibleResults.find((result) => result.place.id === selectedId)
  const selectedPlace = selectedResult?.place
  const sheet = useFoodMapSheetMotion({
    expanded: trayExpanded,
    onExpandedChange: (expanded) => {
      if (expanded && !trayExpanded && selectedPlace === undefined) analytics.resultListOpened()
      setTrayExpanded(expanded)
    },
    selectedId: selectedPlace?.id,
  })
  const openPlace = useCallback(
    (placeId: DiscoveryPlace["id"], origin: SelectionOrigin, trigger?: HTMLElement): void => {
      viewport.interact()
      const activeElement = document.activeElement
      selectionTrigger.current =
        origin === "list"
          ? (trigger ?? null)
          : activeElement instanceof HTMLElement
            ? activeElement
            : null
      selectionOrigin.current = origin
      selectionScrollTop.current = origin === "list" ? (resultsScroll.current?.scrollTop ?? 0) : 0
      selectedIdRef.current = placeId
      setTrayExpanded(false)
      setSelectedId(placeId)
      analytics.placeOpened(placeId, origin)
    },
    [analytics, viewport.interact],
  )
  const closePlace = useCallback((): void => {
    const currentSelectedId = selectedIdRef.current
    const origin = selectionOrigin.current
    if (currentSelectedId !== undefined) {
      pendingReturn.current = {
        element: selectionTrigger.current,
        origin,
        placeId: currentSelectedId,
        queryKey,
        scrollTop: selectionScrollTop.current,
      }
    }
    selectedIdRef.current = undefined
    selectionTrigger.current = null
    setSelectedId(undefined)
    setTrayExpanded(origin === "list")
  }, [queryKey])
  const markers = useMemo(
    () =>
      visibleResults.map((result) => ({
        compactIcon: compactMarkers,
        id: result.place.id,
        iconUrl: markerIconForMenus(
          result.menus,
          result.place.id === selectedId,
          filter,
          result.place.brandId,
        ),
        label: result.place.name,
        latitude: result.place.latitude,
        longitude: result.place.longitude,
        onSelect: () => openPlace(result.place.id, "map"),
        zIndex: markerZIndex(result.place.id === selectedId),
      })),
    [compactMarkers, filter, openPlace, selectedId, visibleResults],
  )
  const map = useNaverMapAdapter({
    clientId,
    markers,
    onViewportChanged: viewport.onViewportChanged,
    view: viewport.view,
  })
  const mapGesture = useFoodMapGesture({
    interact: viewport.interact,
    move: () => {
      viewport.markUserMovement()
      setTrayExpanded(false)
    },
  })
  useEffect(() => {
    if (map.state === "ready") {
      map.recenter(viewport.view, viewport.view.zoom)
    }
  }, [viewport.view, map.recenter, map.state])
  useEffect(() => {
    if (
      pendingRecovery.current === undefined ||
      pendingRecovery.current !== viewport.region ||
      catalog.loading ||
      catalog.failed
    )
      return
    pendingRecovery.current = undefined
    if (catalog.results.length > 0 && map.state === "ready") {
      const mapRect = map.containerRef.current?.getBoundingClientRect()
      const panelRect = sheet.panelRef.current?.getBoundingClientRect()
      const panelOverlap =
        mapRect && panelRect && window.matchMedia("(max-width: 899px)").matches
          ? Math.min(mapRect.height, panelRect.height)
          : 0
      map.fitBounds(
        catalog.results.map((result) => result.place),
        { top: 24, right: 24, bottom: Math.max(24, panelOverlap + 12), left: 24 },
      )
    }
    setTrayExpanded(true)
    setFocusRecoveredResults(true)
  }, [catalog.failed, catalog.loading, catalog.results, map, sheet.panelRef, viewport.region])
  useEffect(() => {
    if (!focusRecoveredResults || !trayExpanded) return
    const timer = window.setTimeout(() => {
      const target = window.matchMedia("(max-width: 899px)").matches
        ? document.querySelector<HTMLButtonElement>(
            "[data-testid='food-map-drawer-handle'] button:first-child",
          )
        : resultsHeading.current
      target?.focus({ preventScroll: true })
      setFocusRecoveredResults(false)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [focusRecoveredResults, trayExpanded])
  const selectRecoveryRegion = (region: DiscoveryRegionDto): void => {
    pendingRecovery.current = region.id
    setRecoveryOpen(false)
    viewport.chooseRegion(region.id, region.bounds)
    setSelectedId(undefined)
  }
  const openOutsideResults = (): void => {
    const onlyRegion = outsideRegions.length === 1 ? outsideRegions[0] : undefined
    if (onlyRegion) {
      selectRecoveryRegion(onlyRegion)
      return
    }
    setRecoveryOpen(true)
    setTrayExpanded(true)
    window.requestAnimationFrame(() => recoveryHeading.current?.focus({ preventScroll: true }))
  }
  const chooseRegion = (id: string): void => {
    const regionBounds = catalog.regions?.regions.find((entry) => entry.id === id)?.bounds
    viewport.chooseRegion(id, regionBounds)
    setSelectedId(undefined)
  }
  const changeQuery = (value: string): void => {
    viewport.interact()
    analytics.searchIntentChanged(value)
    setQuery(value)
    setSelectedId(undefined)
    setRecoveryOpen(false)
    pendingRecovery.current = undefined
    setTrayExpanded(true)
  }
  const changeFilter = (value: DiscoveryFilter): void => {
    viewport.interact()
    setFilter(value)
    setSelectedId(undefined)
    setRecoveryOpen(false)
    pendingRecovery.current = undefined
    analytics.filterSelected(value)
  }
  const changeIngredient = (value: DiscoveryIngredientFilter): void => {
    viewport.interact()
    setIngredient(value)
    setSelectedId(undefined)
    setRecoveryOpen(false)
    pendingRecovery.current = undefined
  }
  useEffect(() => {
    if (selectedPlace !== undefined) detailTitle.current?.focus({ preventScroll: true })
  }, [selectedPlace])

  useEffect(() => {
    if (selectedPlace === undefined) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return
      event.preventDefault()
      closePlace()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [closePlace, selectedPlace])

  useEffect(() => {
    if (selectedPlace !== undefined || pendingReturn.current === undefined) return
    const { element, origin, placeId, queryKey: returnQueryKey, scrollTop } = pendingReturn.current
    pendingReturn.current = undefined
    const listResult = document.querySelector<HTMLElement>(
      `[data-food-map-place-id="${CSS.escape(placeId)}"]`,
    )
    const isVisible = (target: HTMLElement | null): target is HTMLElement =>
      target?.isConnected === true &&
      target.getClientRects().length > 0 &&
      getComputedStyle(target).visibility !== "hidden"
    let settleFrame: number | undefined
    const frame = window.requestAnimationFrame(() => {
      const target = origin === "list" ? listResult : element
      const visibleTarget = isVisible(target)
        ? target
        : document.querySelector<HTMLElement>("[data-testid='food-map-drawer-handle'] button")
      ;(visibleTarget ?? document.querySelector<HTMLElement>("input[type='search']"))?.focus({
        preventScroll: true,
      })
      if (origin === "list" && returnQueryKey === queryKey) {
        settleFrame = window.requestAnimationFrame(() => {
          if (resultsScroll.current) resultsScroll.current.scrollTop = scrollTop
        })
      }
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (settleFrame !== undefined) window.cancelAnimationFrame(settleFrame)
    }
  }, [queryKey, selectedPlace])

  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <ApplicationMasthead
        compact
        action={
          <>
            <AnalyticsSettings onOptIn={analytics.mapViewed} />
            <Link className={styles["suggestAction"]} href="/suggest">
              <PlusIcon />
              <span>제안하기</span>
            </Link>
          </>
        }
        context="나를 위한 한 끼"
        description="잘 먹고 싶은 날, 가까운 곳부터 둘러봐요."
        title="건강식 지도"
      />
      <div className={styles["exploreHeader"]}>
        <FoodMapSearchControls query={query} onQueryChange={changeQuery} />
        <FoodMapFilters onSelect={changeFilter} selected={filter} />
      </div>
      <div className={styles["workspace"]}>
        <div className={styles["panelStack"]} ref={sheet.stackRef}>
          <FoodMapDock
            emptyHint={empty ? emptyHint : undefined}
            locationFailure={
              locationRequest > 0 && location.status === "unavailable" ? locationRequest : undefined
            }
            onLocationFailureExpire={expireLocationFailure}
            pending={map.state === "ready" && viewport.pending}
            onArea={() => {
              viewport.applyArea()
              analytics.searchAreaApplied()
            }}
            outsideCount={canRecover ? outsideCount : undefined}
            onOutside={canRecover ? openOutsideResults : undefined}
          />
          <section
            ref={sheet.panelRef}
            aria-label="건강식 검색 결과"
            className={styles["panel"]}
            data-expanded={trayExpanded}
            data-selected={selectedPlace !== undefined}
          >
            <FoodMapDrawerHandle
              count={catalog.total}
              loading={catalog.loading}
              expanded={trayExpanded}
              toggleProps={sheet.toggleProps}
              onClose={closePlace}
              selectedName={selectedPlace?.name}
              selectedStoreOnly={selectedPlace?.listingKind === "store_only"}
            />
            <div className={styles["panelContent"]} id="food-map-panel-content">
              {selectedResult ? (
                <FoodMapDetail
                  key={selectedResult.place.id}
                  expanded={trayExpanded}
                  onClose={closePlace}
                  onDirectionsOpen={analytics.directionsOpened}
                  result={selectedResult}
                  titleRef={detailTitle}
                />
              ) : (
                <FoodMapResults
                  headingRef={resultsHeading}
                  scrollRef={resultsScroll}
                  sortBasis={catalog.sortBasis}
                  sortOrigin={catalog.sortOrigin}
                  filter={filter}
                  ingredient={ingredient}
                  onIngredientChange={changeIngredient}
                  onFilterChange={changeFilter}
                  onClearArea={
                    viewport.bounds || viewport.region ? () => chooseRegion("") : undefined
                  }
                  onQueryChange={changeQuery}
                  onSelect={(placeId, trigger) => openPlace(placeId, "list", trigger)}
                  total={catalog.total}
                  loading={catalog.loading}
                  failed={catalog.failed}
                  onRetry={catalog.retry}
                  onLoadMore={catalog.loadMore}
                  results={visibleResults}
                  query={query}
                  emptyHeadingRef={emptyHeading}
                  recovery={
                    empty && (recoveryOpen || catalog.regionsFailed || catalog.regionsLoading) ? (
                      <FoodMapAreaRecovery
                        failed={catalog.regionsFailed}
                        headingRef={recoveryHeading}
                        loading={catalog.regionsLoading}
                        onRetry={catalog.retryRegions}
                        onSelect={selectRecoveryRegion}
                        regions={outsideRegions}
                      />
                    ) : undefined
                  }
                />
              )}
            </div>
          </section>
        </div>
        <div
          className={styles["map"]}
          data-adapter-state={map.state}
          data-testid="food-map-stage"
          {...mapGesture}
        >
          <div
            aria-label="NAVER 건강식 지도"
            className={styles["sdkMap"]}
            data-testid="food-map-naver-map"
            ref={map.containerRef}
            role="application"
          />
          <FoodMapControls
            state={map.state}
            onRetry={map.load}
            locating={location.status === "requesting"}
            onLocate={() => {
              setLocationRequest((attempt) => attempt + 1)
              viewport.requestLocation()
              location.request()
              setSelectedId(undefined)
              setTrayExpanded(false)
            }}
          />
        </div>
      </div>
    </section>
  )
}
