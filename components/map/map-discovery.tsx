"use client"

import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Menu, Place } from "../../lib/domain/catalog"
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
import styles from "./map-discovery.module.css"
import { PlaceDetail } from "./place-detail"

type Properties = {
  readonly clientId?: string | undefined
  readonly storedPlaceFallbackSlugs?: readonly string[] | undefined
  readonly initialMenus: readonly Menu[]
  readonly initialPlaces: readonly Place[]
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
  storedPlaceFallbackSlugs,
}: Properties) {
  const [filter, setFilter] = useState<PlaceFilter>("all")
  const [places, setPlaces] = useState(initialPlaces)
  const [catalogState, setCatalogState] = useState<"ready" | "loading" | "error">("ready")
  const [adapterState, setAdapterState] = useState<MapAdapterState>(
    clientId ? "loading" : "fallback",
  )
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
  const [didResolveEntry, setDidResolveEntry] = useState(false)
  const [isMobileDetail, setIsMobileDetail] = useState(false)

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

  const clearSelection = useCallback(() => {
    setSelectedSlug(undefined)
    window.history.replaceState({}, "", "/")
    window.setTimeout(() => selectionTrigger.current?.focus())
  }, [])

  useEffect(() => {
    selectedSlugRef.current = selectedSlug
  }, [selectedSlug])

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
            setSelectedSlug(undefined)
            setLinkNotice("유효하지 않은 장소 링크를 기본 지도로 복구했습니다.")
            window.history.replaceState({}, "", "/")
            return
          }
          setSelectedSlug(place.slug)
          sharedEntrySource.current = shareState.source
          window.history.replaceState({}, "", canonicalizeShareUrl(window.location.href))
          return
        }
        case "map": {
          setSelectedSlug(undefined)
          if (wasSelected) window.setTimeout(() => selectionTrigger.current?.focus())
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
          setSelectedSlug(undefined)
          if (wasSelected) window.setTimeout(() => selectionTrigger.current?.focus())
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
  }, [initialPlaces])

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
    const activeElement = document.activeElement
    selectionTrigger.current = activeElement instanceof HTMLElement ? activeElement : undefined
    setLinkNotice(undefined)
    const snapshot = { filter, url: `${window.location.pathname}${window.location.search}`, view }
    window.sessionStorage.setItem(MAP_SNAPSHOT_KEY, JSON.stringify(snapshot))
    window.history.replaceState(snapshot, "", window.location.href)
    setSelectedSlug(place.slug)
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
      const response = await fetch("/api/map-catalog", { cache: "no-store" })
      if (!response.ok) throw new CatalogLoadError()
      const payload: unknown = await response.json()
      if (!isCatalogPayload(payload)) throw new CatalogLoadError()
      if (generation !== catalogGeneration.current) return
      setPlaces(
        payload.places.flatMap(({ slug }) => {
          const place = initialPlaces.find((candidate) => candidate.slug === slug)
          return place?.published ? [place] : []
        }),
      )
      setCatalogState("ready")
    } catch {
      if (generation === catalogGeneration.current) setCatalogState("error")
    }
  }

  const renderDetailSurface = (place: Place, isModal: boolean) => {
    const detail = (
      <PlaceDetail
        key={place.slug}
        directionsTarget={
          storedPlaceFallbackSlugs?.includes(place.slug) ? { kind: "place" } : undefined
        }
        menus={initialMenus}
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
        role="dialog"
      >
        {detail}
      </div>
    ) : (
      <div className={styles["detailSurface"]}>{detail}</div>
    )
  }

  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <header className={styles["header"]}>
        <div>
          <h1>건강식 지도</h1>
          <p>강남·역삼 주변의 건강식 선택지를 지도에서 살펴보세요.</p>
        </div>
        <strong className={styles["sample"]}>샘플 데이터</strong>
        <button onClick={reloadCatalog} type="button">
          장소 새로고침
        </button>
      </header>
      <div className={styles["map"]} data-adapter-state={adapterState} data-testid="map-stage">
        <div aria-hidden="true" className={styles["paperMap"]} />
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
        ) : visiblePlaces.length === 0 ? (
          <div className={styles["catalogFeedback"]} role="status">
            표시할 샘플 장소가 없습니다.
          </div>
        ) : (
          <section aria-label={`샘플 장소 ${visiblePlaces.length}곳`} className={styles["markers"]}>
            {visiblePlaces.map((place) => (
              <span key={place.id}>
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

class CatalogLoadError extends Error {
  readonly name = "CatalogLoadError"
}
const assertNever = (value: never): never => value
const isCatalogPayload = (
  value: unknown,
): value is { readonly places: readonly { readonly slug: string }[] } =>
  typeof value === "object" &&
  value !== null &&
  "places" in value &&
  Array.isArray(value.places) &&
  value.places.every(
    (place) =>
      typeof place === "object" &&
      place !== null &&
      "slug" in place &&
      typeof place.slug === "string",
  )
