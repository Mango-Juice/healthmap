"use client"

import {
  type KeyboardEvent as ReactKeyboardEvent,
  type TransitionEvent as ReactTransitionEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import { loadPublicCatalog } from "../../lib/catalog/public-catalog-client"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import { filterPlaces, type PlaceFilter } from "../../lib/domain/filter"
import {
  beginLocationRequest,
  DEFAULT_VIEW,
  LOCATION_OPTIONS,
  type LocationState,
  type MapView,
  resolveLocationOutcome,
} from "../../lib/domain/geo"
import { canonicalizeShareUrl, parseShareUrl, serializePlaceShare } from "../../lib/domain/share"
import {
  cancelNaverMapsLoad,
  createNaverMapAdapter,
  loadNaverMaps,
  type MapAdapter,
  type MapAdapterState,
  viewLabel,
} from "../../lib/map/adapter"
import { LocateIcon, RotateCcwIcon } from "../ui/health-map-icons"
import { FilterRail, MapMarker } from "../ui/health-map-primitives"
import { FallbackFieldGuide } from "./fallback-field-guide"
import styles from "./map-discovery.module.css"
import { PlaceDetail } from "./place-detail"

type Properties = {
  readonly clientId?: string | undefined
  readonly directionsTargets?: Readonly<Partial<Record<Place["id"], DirectionsTarget>>> | undefined
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
  readonly initialCatalogState?: "ready" | "error" | undefined
}

const LOCATION_COPY: Record<LocationState["kind"], string> = {
  requesting: "현재 위치를 확인하고 있습니다.",
  inside: "현재 위치를 지도에 표시했습니다.",
  outside: "서비스 범위 밖입니다. 기본 지도를 유지합니다.",
  denied: "위치 권한이 거부되었습니다. 기본 지도를 유지합니다.",
  timeout: "위치 확인 시간이 초과되었습니다. 다시 시도할 수 있습니다.",
  unsupported: "이 브라우저에서는 위치 기능을 지원하지 않습니다.",
}

type HistorySnapshot = {
  readonly filter: PlaceFilter
  readonly url: string
  readonly view: MapView
}

type DetailPhase = "closed" | "opening" | "open" | "closing"
type DetailMotion = "start" | "settled"
const DETAIL_TRANSITION_BUFFER_MS = 48

const isHistorySnapshot = (value: unknown): value is HistorySnapshot =>
  typeof value === "object" &&
  value !== null &&
  "filter" in value &&
  (value.filter === "all" ||
    value.filter === "vegetables" ||
    value.filter === "protein" ||
    value.filter === "balanced" ||
    value.filter === "plant_based") &&
  "view" in value &&
  typeof value.view === "object" &&
  value.view !== null &&
  "latitude" in value.view &&
  typeof value.view.latitude === "number" &&
  "longitude" in value.view &&
  typeof value.view.longitude === "number" &&
  "zoom" in value.view &&
  typeof value.view.zoom === "number" &&
  "url" in value &&
  typeof value.url === "string"

const MAP_SNAPSHOT_KEY = "healthmap.selection-map.v1"

const readMapSnapshot = (): HistorySnapshot | undefined => {
  const raw = window.sessionStorage.getItem(MAP_SNAPSHOT_KEY)
  window.sessionStorage.removeItem(MAP_SNAPSHOT_KEY)
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    return isHistorySnapshot(parsed) ? parsed : undefined
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

export function MapDiscovery({
  clientId,
  initialMenus,
  initialPlaces,
  initialCatalogState = "ready",
  directionsTargets,
}: Properties) {
  const [filter, setFilter] = useState<PlaceFilter>("all")
  const [places, setPlaces] = useState(initialPlaces)
  const [menus, setMenus] = useState(initialMenus)
  const [catalogState, setCatalogState] = useState<"ready" | "loading" | "error">(
    initialCatalogState,
  )
  const [adapterState, setAdapterState] = useState<MapAdapterState>(
    clientId ? "loading" : "fallback",
  )
  const isSampleCatalog = places.every((place) => place.dataMode === "mock")
  const [location, setLocation] = useState<LocationState>(beginLocationRequest)
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const [selectedSlug, setSelectedSlug] = useState<string>()
  const [linkNotice, setLinkNotice] = useState<string>()
  const sdkContainer = useRef<HTMLDivElement>(null)
  const adapter = useRef<MapAdapter>(null)
  const sdkGeneration = useRef(0)
  const catalogGeneration = useRef(0)
  const didInitializeUrl = useRef(false)
  const mapSnapshot = useRef<HistorySnapshot | undefined>(undefined)
  const sharedEntrySource = useRef<"place_share" | "map_share" | undefined>(undefined)
  const selectionTrigger = useRef<HTMLElement | undefined>(undefined)
  const selectedSlugRef = useRef<string | undefined>(undefined)
  const detailPhaseRef = useRef<DetailPhase>("closed")
  const [didResolveEntry, setDidResolveEntry] = useState(false)
  const [isMobileDetail, setIsMobileDetail] = useState(false)
  const [detailPhase, setDetailPhase] = useState<DetailPhase>("closed")
  const [detailMotion, setDetailMotion] = useState<DetailMotion>("settled")
  const openingFrame = useRef<number | undefined>(undefined)
  const closingFrame = useRef<number | undefined>(undefined)
  const closeSafetyTimer = useRef<number | undefined>(undefined)
  const detailSurfaceRef = useRef<HTMLElement>(null)
  const setDetailSurfaceRef = useCallback((element: HTMLElement | null): void => {
    detailSurfaceRef.current = element
  }, [])

  const requestLocation = useCallback((isUserRequested: boolean) => {
    const source = sharedEntrySource.current
    if (isUserRequested && source !== undefined)
      captureProductAnalytics({
        event: "shared_visit_explored",
        properties: { source, action: "location" },
      })
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
        captureProductAnalytics({ event: "location_resolved", properties: { outcome: next.kind } })
        if (next.kind === "inside") {
          setView({ ...next.point, zoom: DEFAULT_VIEW.zoom })
          adapter.current?.recenter(next.point, DEFAULT_VIEW.zoom)
        }
      },
      (error) => {
        const next = resolveLocationOutcome({ kind: "error", code: error.code })
        setLocation(next)
        captureProductAnalytics({ event: "location_resolved", properties: { outcome: next.kind } })
      },
      LOCATION_OPTIONS,
    )
  }, [])

  const loadSdk = useCallback(() => {
    const generation = sdkGeneration.current + 1
    sdkGeneration.current = generation
    if (!clientId) {
      setAdapterState("fallback")
      return
    }
    setAdapterState("loading")
    loadNaverMaps(clientId).then(
      () => {
        if (generation !== sdkGeneration.current) return
        const container = sdkContainer.current
        if (!container) return setAdapterState("error")
        try {
          adapter.current?.destroy()
          adapter.current = createNaverMapAdapter(container, view)
          setAdapterState("ready")
        } catch {
          setAdapterState("error")
        }
      },
      () => {
        if (generation === sdkGeneration.current) setAdapterState("error")
      },
    )
  }, [clientId, view])

  useEffect(() => requestLocation(false), [requestLocation])
  useEffect(() => loadSdk(), [loadSdk])
  useEffect(
    () => () => {
      cancelNaverMapsLoad()
      adapter.current?.destroy()
    },
    [],
  )

  const finishDetailClose = useCallback(() => {
    if (closeSafetyTimer.current !== undefined) {
      window.clearTimeout(closeSafetyTimer.current)
      closeSafetyTimer.current = undefined
    }
    detailPhaseRef.current = "closed"
    const triggerSlug = selectedSlugRef.current
    selectedSlugRef.current = undefined
    setDetailPhase("closed")
    setSelectedSlug(undefined)
    const trigger = selectionTrigger.current
    selectionTrigger.current = undefined
    if (trigger?.isConnected) {
      trigger.focus({ preventScroll: true })
    } else if (triggerSlug !== undefined) {
      document
        .querySelector<HTMLElement>(`[data-place-slug="${triggerSlug}"]`)
        ?.querySelector<HTMLElement>("button")
        ?.focus({ preventScroll: true })
    }
  }, [])

  const beginDetailClose = useCallback(() => {
    const currentSlug = selectedSlugRef.current
    const currentPhase = detailPhaseRef.current
    if (currentSlug === undefined || currentPhase === "closing") return
    if (openingFrame.current !== undefined) window.cancelAnimationFrame(openingFrame.current)
    if (closingFrame.current !== undefined) window.cancelAnimationFrame(closingFrame.current)
    setDetailMotion("settled")
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishDetailClose()
      return
    }
    if (currentPhase === "opening") {
      detailPhaseRef.current = "open"
      setDetailPhase("open")
      closingFrame.current = window.requestAnimationFrame(() => {
        detailPhaseRef.current = "closing"
        setDetailPhase("closing")
      })
    } else {
      detailPhaseRef.current = "closing"
      setDetailPhase("closing")
    }
    const surface = detailSurfaceRef.current
    const duration = surface
      ? Number.parseFloat(getComputedStyle(surface).transitionDuration.split(",")[0] ?? "") * 1000
      : 240
    closeSafetyTimer.current = window.setTimeout(
      finishDetailClose,
      Math.max(0, duration) + DETAIL_TRANSITION_BUFFER_MS,
    )
  }, [finishDetailClose])

  const clearSelection = useCallback(() => {
    if (selectedSlugRef.current === undefined || detailPhaseRef.current === "closing") return
    window.history.replaceState({}, "", "/")
    beginDetailClose()
  }, [beginDetailClose])

  useEffect(() => {
    selectedSlugRef.current = selectedSlug
    detailPhaseRef.current = detailPhase
  }, [detailPhase, selectedSlug])

  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)")
    const update = (): void => setIsMobileDetail(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    const recoverFromUrl = (): void => {
      const wasSelected = selectedSlugRef.current !== undefined
      const shareState = parseShareUrl(window.location.href)
      switch (shareState.kind) {
        case "place": {
          const place = initialPlaces.find(
            (candidate) => candidate.slug === shareState.slug && candidate.published,
          )
          if (place === undefined) {
            sharedEntrySource.current = undefined
            if (wasSelected) {
              beginDetailClose()
            } else {
              setSelectedSlug(undefined)
              setDetailPhase("closed")
            }
            setLinkNotice("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
            return
          }
          setSelectedSlug(place.slug)
          setDetailPhase("opening")
          setDetailMotion("start")
          sharedEntrySource.current = shareState.source
          window.history.replaceState({}, "", canonicalizeShareUrl(window.location.href))
          return
        }
        case "map": {
          if (wasSelected) {
            beginDetailClose()
          } else {
            setSelectedSlug(undefined)
            setDetailPhase("closed")
          }
          sharedEntrySource.current = shareState.source
          mapSnapshot.current ??= readMapSnapshot()
          const browserSnapshot = window.history.state
          if (mapSnapshot.current === undefined && isHistorySnapshot(browserSnapshot)) {
            mapSnapshot.current = browserSnapshot
          }
          if (mapSnapshot.current?.url === `${window.location.pathname}${window.location.search}`) {
            setFilter(mapSnapshot.current.filter)
            setView(mapSnapshot.current.view)
            return
          }
          if (didInitializeUrl.current) {
            if (isHistorySnapshot(window.history.state)) {
              setFilter(window.history.state.filter)
              setView(window.history.state.view)
            }
            return
          }
          setFilter(shareState.tag)
          setView({ ...shareState.center, zoom: shareState.zoom })
          window.history.replaceState({}, "", canonicalizeShareUrl(window.location.href))
          return
        }
        case "fallback":
          sharedEntrySource.current = undefined
          if (wasSelected) {
            beginDetailClose()
          } else {
            setSelectedSlug(undefined)
            setDetailPhase("closed")
          }
          if (window.location.search.length > 0) {
            setLinkNotice("유효하지 않은 공유 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
          }
          return
        default:
          assertNever(shareState)
          return
      }
    }
    recoverFromUrl()
    didInitializeUrl.current = true
    setDidResolveEntry(true)
    window.addEventListener("popstate", recoverFromUrl)
    return () => window.removeEventListener("popstate", recoverFromUrl)
  }, [beginDetailClose, initialPlaces])

  useEffect(() => {
    if (selectedSlug === undefined || detailPhase !== "opening") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDetailMotion("settled")
      setDetailPhase("open")
      return
    }
    openingFrame.current = window.requestAnimationFrame(() => {
      openingFrame.current = window.requestAnimationFrame(() => {
        openingFrame.current = window.requestAnimationFrame(() => setDetailMotion("settled"))
      })
    })
    return () => {
      if (openingFrame.current !== undefined) window.cancelAnimationFrame(openingFrame.current)
    }
  }, [detailPhase, selectedSlug])

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && selectedSlug !== undefined) clearSelection()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [clearSelection, selectedSlug])
  useEffect(() => {
    if (!didResolveEntry) return
    captureProductAnalytics({
      event: "map_viewed",
      properties: { source: sharedEntrySource.current ?? "direct" },
    })
  }, [didResolveEntry])

  const publishedPlaces = useMemo(() => places.filter((place) => place.published), [places])
  const visiblePlaces = useMemo(
    () => filterPlaces(publishedPlaces, filter),
    [filter, publishedPlaces],
  )
  const selectedPlace = useMemo(
    () => publishedPlaces.find((place) => place.slug === selectedSlug),
    [publishedPlaces, selectedSlug],
  )
  const openPlace = (place: Place): void => {
    if (closingFrame.current !== undefined) window.cancelAnimationFrame(closingFrame.current)
    if (closeSafetyTimer.current !== undefined) {
      window.clearTimeout(closeSafetyTimer.current)
      closeSafetyTimer.current = undefined
    }
    const activeElement = document.activeElement
    selectionTrigger.current = activeElement instanceof HTMLElement ? activeElement : undefined
    setLinkNotice(undefined)
    const snapshot = { filter, url: `${window.location.pathname}${window.location.search}`, view }
    window.sessionStorage.setItem(MAP_SNAPSHOT_KEY, JSON.stringify(snapshot))
    window.history.replaceState(snapshot, "", window.location.href)
    selectedSlugRef.current = place.slug
    detailPhaseRef.current = "opening"
    setSelectedSlug(place.slug)
    setDetailPhase("opening")
    setDetailMotion("start")
    window.history.pushState({}, "", serializePlaceShare(place.slug))
    captureProductAnalytics({
      event: "place_opened",
      properties: { place_id: place.id, source: "map" },
    })
    const source = sharedEntrySource.current
    if (source !== undefined)
      captureProductAnalytics({
        event: "shared_visit_explored",
        properties: { source, action: "place_opened" },
      })
  }
  const reloadCatalog = async () => {
    const generation = catalogGeneration.current + 1
    catalogGeneration.current = generation
    setCatalogState("loading")
    try {
      const payload = await loadPublicCatalog()
      if (generation !== catalogGeneration.current) return
      setPlaces(payload.places)
      setMenus(payload.menus)
      setCatalogState("ready")
    } catch {
      if (generation === catalogGeneration.current) setCatalogState("error")
    }
  }

  const renderDetailSurface = (place: Place, isModal: boolean) => {
    const detail = (
      <PlaceDetail
        key={place.slug}
        directionsTarget={directionsTargets?.[place.id]}
        menus={menus}
        onClose={clearSelection}
        place={place}
        shareMap={{
          latitude: view.latitude,
          longitude: view.longitude,
          zoom: view.zoom,
          tag: filter === "all" ? "balanced" : filter,
        }}
      />
    )
    return isModal ? (
      <div
        aria-label="장소 상세"
        aria-modal="true"
        className={styles["detailSurface"]}
        data-detail-phase={detailPhase}
        data-detail-motion={detailMotion}
        ref={setDetailSurfaceRef}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key !== "Tab") return
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
            ),
          ).filter((element) => element.getClientRects().length > 0)
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (first === undefined || last === undefined) return
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }}
        onTransitionEnd={(event: ReactTransitionEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget) return
          if (detailPhase === "closing") finishDetailClose()
          if (detailPhase === "opening" && event.propertyName === "opacity") setDetailPhase("open")
        }}
        role="dialog"
      >
        {detail}
      </div>
    ) : (
      <aside
        aria-label="장소 상세"
        className={styles["detailSurface"]}
        data-detail-phase={detailPhase}
        data-detail-motion={detailMotion}
        ref={setDetailSurfaceRef}
        onTransitionEnd={(event: ReactTransitionEvent<HTMLElement>) => {
          if (event.target !== event.currentTarget) return
          if (detailPhase === "closing") finishDetailClose()
          if (detailPhase === "opening" && event.propertyName === "opacity") setDetailPhase("open")
        }}
      >
        {detail}
      </aside>
    )
  }

  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <header className={styles["header"]}>
        <div>
          <h1>건강식 지도</h1>
          <p>강남·역삼 주변의 건강식 선택지를 지도에서 살펴보세요.</p>
        </div>
        {isSampleCatalog ? <strong className={styles["sample"]}>샘플 데이터</strong> : null}
        <button onClick={reloadCatalog} type="button">
          장소 새로고침
        </button>
      </header>
      <div
        className={styles["map"]}
        data-adapter-state={adapterState}
        data-detail-phase={selectedPlace ? detailPhase : "closed"}
        data-testid="map-stage"
      >
        <FallbackFieldGuide />
        <div aria-hidden="true" className={styles["sdkMap"]} ref={sdkContainer} />
        <div className={styles["filter"]}>
          <FilterRail
            selected={filter}
            onSelect={(value) => {
              setFilter(value)
              captureProductAnalytics({ event: "filter_selected", properties: { tag: value } })
              const source = sharedEntrySource.current
              if (source !== undefined)
                captureProductAnalytics({
                  event: "shared_visit_explored",
                  properties: { source, action: "filter" },
                })
            }}
          />
        </div>
        <div aria-live="polite" className={styles["status"]}>
          <span>
            {adapterState === "ready"
              ? "NAVER 지도 연결됨"
              : adapterState === "loading"
                ? "NAVER 지도 불러오는 중"
                : adapterState === "error"
                  ? "NAVER 지도를 불러오지 못했습니다."
                  : "기본 지도로 표시 중"}
          </span>
          {adapterState === "error" ? (
            <button onClick={loadSdk} type="button">
              지도 다시 시도
            </button>
          ) : null}
        </div>
        <button
          aria-label="현재 위치 다시 찾기"
          className={styles["locate"]}
          onClick={() => requestLocation(true)}
          type="button"
        >
          <LocateIcon />
        </button>
        <output className={styles["location"]} data-location-state={location.kind}>
          <span>{LOCATION_COPY[location.kind]}</span>
        </output>
        <span className={styles["view"]} data-testid="map-view">
          {viewLabel(view)}
        </span>
        {location.kind === "inside" ? (
          <span aria-label="내 위치" className={styles["userMarker"]} role="img" />
        ) : null}
        {catalogState === "loading" ? (
          <div className={styles["catalogFeedback"]} role="status">
            장소 데이터를 불러오는 중입니다.
          </div>
        ) : catalogState === "error" ? (
          <div className={styles["catalogFeedback"]} role="alert">
            <span>장소 데이터를 불러오지 못했습니다.</span>
            <button onClick={reloadCatalog} type="button">
              <RotateCcwIcon /> 다시 시도
            </button>
          </div>
        ) : null}
        {visiblePlaces.length === 0 ? (
          <div className={styles["catalogFeedback"]} role="status">
            {isSampleCatalog ? "표시할 샘플 장소가 없습니다." : "표시할 장소가 없습니다."}
          </div>
        ) : (
          <section
            aria-label={`${isSampleCatalog ? "샘플 장소" : "장소"} ${visiblePlaces.length}곳`}
            className={styles["markers"]}
          >
            {visiblePlaces.map((place) => (
              <span data-place-slug={place.slug} key={place.id}>
                <MapMarker
                  category={place.primaryTag}
                  label={place.name}
                  selected={selectedPlace?.id === place.id}
                  onSelect={() => openPlace(place)}
                />
              </span>
            ))}
          </section>
        )}
        {linkNotice || selectedPlace ? (
          <p className={styles["selection"]} role="status">
            {linkNotice ?? "장소를 선택했습니다."}
          </p>
        ) : null}
        {selectedPlace
          ? isMobileDetail
            ? renderDetailSurface(selectedPlace, true)
            : renderDetailSurface(selectedPlace, false)
          : null}
      </div>
    </section>
  )
}

const assertNever = (value: never): never => value
