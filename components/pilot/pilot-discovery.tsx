"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { DEFAULT_VIEW } from "../../lib/domain/geo"
import type { ViewportBounds } from "../../lib/domain/viewport"
import type { MapViewportSnapshot } from "../../lib/map/adapter"
import type { PilotCatalog, PilotPlace } from "../../lib/pilot/catalog"
import {
  consumerPilotPlaces,
  discoveryTagsForPlace,
  filterPilotPlaces,
  markerIconForPlace,
  markerZIndex,
  type PilotDiscoveryFilter,
} from "../../lib/pilot/discovery"
import { useNaverMapAdapter } from "../map/use-naver-map-adapter"
import { ApplicationMasthead } from "../ui/application-masthead"
import { AlertTriangleIcon, LoaderIcon, RotateCcwIcon } from "../ui/health-map-icons"
import { ActionButton } from "../ui/health-map-primitives"
import { PilotDetail } from "./pilot-detail"
import styles from "./pilot-discovery.module.css"
import { PilotDrawerHandle } from "./pilot-drawer-handle"
import { PilotResults } from "./pilot-results"

type Properties = {
  readonly catalog: PilotCatalog
  readonly clientId?: string | undefined
}

export function PilotDiscovery({ catalog, clientId }: Properties) {
  const [filter, setFilter] = useState<PilotDiscoveryFilter>("all")
  const [query, setQuery] = useState("")
  const [selectedId, setSelectedId] = useState<PilotPlace["id"]>()
  const [appliedBounds, setAppliedBounds] = useState<ViewportBounds>()
  const [areaSearchIsPending, setAreaSearchIsPending] = useState(false)
  const [trayExpanded, setTrayExpanded] = useState(false)
  const currentBounds = useRef<ViewportBounds>(undefined)
  const detailTitle = useRef<HTMLHeadingElement>(null)
  const didCaptureInitialViewport = useRef(false)
  const selectedIdRef = useRef<PilotPlace["id"]>(undefined)
  const selectionTrigger = useRef<HTMLElement | null>(null)
  const pendingReturn = useRef<
    { readonly element: HTMLElement | null; readonly placeId: PilotPlace["id"] } | undefined
  >(undefined)
  const consumerPlaces = useMemo(() => consumerPilotPlaces(catalog.places), [catalog.places])
  const visiblePlaces = useMemo(
    () =>
      filterPilotPlaces({
        appliedBounds,
        catalog,
        filter,
        places: consumerPlaces,
        query,
      }),
    [appliedBounds, catalog, consumerPlaces, filter, query],
  )
  const selectedPlace = consumerPlaces.find((place) => place.id === selectedId)
  const openPlace = useCallback((placeId: PilotPlace["id"], trigger?: HTMLElement): void => {
    const activeElement = document.activeElement
    selectionTrigger.current =
      trigger ?? (activeElement instanceof HTMLElement ? activeElement : null)
    selectedIdRef.current = placeId
    setTrayExpanded(true)
    setSelectedId(placeId)
  }, [])
  const closePlace = useCallback((): void => {
    const currentSelectedId = selectedIdRef.current
    if (currentSelectedId !== undefined) {
      pendingReturn.current = { element: selectionTrigger.current, placeId: currentSelectedId }
    }
    selectedIdRef.current = undefined
    selectionTrigger.current = null
    setSelectedId(undefined)
  }, [])
  const markers = useMemo(
    () =>
      visiblePlaces.map((place) => ({
        iconUrl: markerIconForPlace(place, place.id === selectedId),
        label: `${place.name} · ${discoveryTagsForPlace(place)
          .map((tag) => (tag === "whole_grain" ? "잡곡밥" : "비건·채식"))
          .join(", ")}`,
        latitude: place.latitude,
        longitude: place.longitude,
        onSelect: () => openPlace(place.id),
        zIndex: markerZIndex(place.id === selectedId),
      })),
    [openPlace, selectedId, visiblePlaces],
  )
  const handleViewportChanged = useCallback((snapshot: MapViewportSnapshot): void => {
    currentBounds.current = snapshot.bounds
    if (!didCaptureInitialViewport.current) {
      didCaptureInitialViewport.current = true
      return
    }
    setAreaSearchIsPending(true)
  }, [])
  const applyArea = useCallback((): void => {
    if (currentBounds.current === undefined) return
    setAppliedBounds(currentBounds.current)
    setAreaSearchIsPending(false)
  }, [])
  const map = useNaverMapAdapter({
    clientId,
    markers,
    onViewportChanged: handleViewportChanged,
    view: DEFAULT_VIEW,
  })
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
    const { element, placeId } = pendingReturn.current
    pendingReturn.current = undefined
    const fallback = document.querySelector<HTMLElement>(
      `[data-pilot-place-id="${CSS.escape(placeId)}"]`,
    )
    const target = element?.isConnected ? element : fallback
    const frame = window.requestAnimationFrame(() => {
      ;(target ?? document.querySelector<HTMLElement>("[role='searchbox']"))?.focus({
        preventScroll: true,
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [selectedPlace])

  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <ApplicationMasthead
        context="강남·역삼"
        description="잡곡밥과 비건·채식 메뉴를 가까운 곳에서 찾아보세요."
        title="건강식 지도"
      />
      <div className={styles["workspace"]}>
        <aside
          aria-label="건강식 검색 결과"
          className={styles["panel"]}
          data-expanded={trayExpanded}
        >
          <PilotDrawerHandle
            count={visiblePlaces.length}
            expanded={trayExpanded}
            onExpandedChange={setTrayExpanded}
            selectedName={selectedPlace?.name}
          />
          <div className={styles["panelContent"]} id="pilot-panel-content">
            {selectedPlace ? (
              <PilotDetail
                catalog={catalog}
                onClose={closePlace}
                place={selectedPlace}
                titleRef={detailTitle}
              />
            ) : (
              <PilotResults
                catalog={catalog}
                filter={filter}
                onFilterChange={setFilter}
                onQueryChange={setQuery}
                onSelect={openPlace}
                places={visiblePlaces}
                query={query}
              />
            )}
          </div>
        </aside>
        <div className={styles["map"]} data-adapter-state={map.state} data-testid="pilot-map-stage">
          <div
            aria-label="NAVER 건강식 지도"
            className={styles["sdkMap"]}
            data-testid="pilot-naver-map"
            ref={map.containerRef}
            role="application"
          />
          {map.state === "ready" && areaSearchIsPending ? (
            <button className={styles["areaSearch"]} onClick={applyArea} type="button">
              이 지역 검색
            </button>
          ) : null}
          {map.state === "loading" ? (
            <div className={styles["mapState"]} role="status">
              <LoaderIcon />
              <strong>지도를 불러오고 있어요.</strong>
            </div>
          ) : map.state === "error" ? (
            <div className={styles["mapState"]} data-tone="error" role="alert">
              <AlertTriangleIcon />
              <strong>지도를 불러오지 못했어요.</strong>
              <ActionButton leadingIcon={<RotateCcwIcon />} onClick={map.load} variant="secondary">
                다시 시도
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
