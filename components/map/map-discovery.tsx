"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Place } from "../../lib/domain/catalog"
import { filterPlaces, type PlaceFilter } from "../../lib/domain/filter"
import {
  beginLocationRequest,
  DEFAULT_VIEW,
  LOCATION_OPTIONS,
  type LocationState,
  type MapView,
  resolveLocationOutcome,
} from "../../lib/domain/geo"
import {
  createNaverMapAdapter,
  loadNaverMaps,
  type MapAdapter,
  type MapAdapterState,
  viewLabel,
} from "../../lib/map/adapter"
import { LocateIcon, RotateCcwIcon } from "../ui/health-map-icons"
import { FilterRail, MapMarker } from "../ui/health-map-primitives"
import styles from "./map-discovery.module.css"

type Properties = {
  readonly clientId?: string | undefined
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

export function MapDiscovery({ clientId, initialPlaces }: Properties) {
  const [filter, setFilter] = useState<PlaceFilter>("all")
  const [places, setPlaces] = useState(initialPlaces)
  const [catalogState, setCatalogState] = useState<"ready" | "loading" | "error">("ready")
  const [adapterState, setAdapterState] = useState<MapAdapterState>(
    clientId ? "loading" : "fallback",
  )
  const [location, setLocation] = useState<LocationState>(beginLocationRequest)
  const [view, setView] = useState<MapView>(DEFAULT_VIEW)
  const [selected, setSelected] = useState<string>()
  const sdkContainer = useRef<HTMLDivElement>(null)
  const adapter = useRef<MapAdapter>(null)
  const sdkGeneration = useRef(0)
  const catalogGeneration = useRef(0)

  const requestLocation = useCallback(() => {
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

  useEffect(() => requestLocation(), [requestLocation])
  useEffect(() => loadSdk(), [loadSdk])
  useEffect(() => () => adapter.current?.destroy(), [])
  useEffect(
    () => captureProductAnalytics({ event: "map_viewed", properties: { source: "direct" } }),
    [],
  )

  const visiblePlaces = useMemo(() => filterPlaces(places, filter), [filter, places])
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
          return place ? [place] : []
        }),
      )
      setCatalogState("ready")
    } catch {
      if (generation === catalogGeneration.current) setCatalogState("error")
    }
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
          onClick={requestLocation}
          type="button"
        >
          <LocateIcon />
        </button>
        <output className={styles["location"]} data-location-state={location.kind}>
          {LOCATION_COPY[location.kind]}
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
                  selected={selected === place.id}
                  onSelect={() => {
                    setSelected(place.id)
                    captureProductAnalytics({
                      event: "place_opened",
                      properties: { place_id: place.id, source: "map" },
                    })
                  }}
                />
              </span>
            ))}
          </section>
        )}
        {selected ? (
          <p className={styles["selection"]} role="status">
            장소를 선택했습니다.
          </p>
        ) : null}
      </div>
    </section>
  )
}

class CatalogLoadError extends Error {
  readonly name = "CatalogLoadError"
}
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
