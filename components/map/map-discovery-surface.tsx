"use client"

import type {
  KeyboardEvent as ReactKeyboardEvent,
  TransitionEvent as ReactTransitionEvent,
  RefObject,
} from "react"
import type { Menu, Place } from "../../lib/domain/catalog"
import type { DirectionsTarget } from "../../lib/domain/directions"
import type { PlaceFilter } from "../../lib/domain/filter"
import type { LocationState, MapView } from "../../lib/domain/geo"
import type { MapAdapterState } from "../../lib/map/adapter"
import { viewLabel } from "../../lib/map/adapter"
import { LocateIcon, RotateCcwIcon } from "../ui/health-map-icons"
import { FilterRail, MapMarker } from "../ui/health-map-primitives"
import { FallbackFieldGuide } from "./fallback-field-guide"
import styles from "./map-discovery.module.css"
import { PlaceDetail } from "./place-detail"
import type { CatalogState } from "./use-catalog"
import type { DetailMotion, DetailPhase } from "./use-detail-selection"

const LOCATION_COPY: Record<LocationState["kind"], string> = {
  requesting: "현재 위치를 확인하고 있습니다.",
  inside: "현재 위치를 지도에 표시했습니다.",
  outside: "서비스 범위 밖입니다. 기본 지도를 유지합니다.",
  denied: "위치 권한이 거부되었습니다. 기본 지도를 유지합니다.",
  timeout: "위치 확인 시간이 초과되었습니다. 다시 시도할 수 있습니다.",
  unsupported: "이 브라우저에서는 위치 기능을 지원하지 않습니다.",
}

type MapDiscoverySurfaceModel = {
  readonly adapter: {
    readonly containerRef: RefObject<HTMLDivElement | null>
    readonly retry: () => void
    readonly state: MapAdapterState
  }
  readonly catalog: {
    readonly isSample: boolean
    readonly reload: () => void
    readonly state: CatalogState
    readonly visiblePlaces: readonly Place[]
  }
  readonly detail: {
    readonly clear: () => void
    readonly directionsTargets?:
      | Readonly<Partial<Record<Place["id"], DirectionsTarget>>>
      | undefined
    readonly finishClose: () => void
    readonly isMobile: boolean
    readonly linkNotice: string | undefined
    readonly menus: readonly Menu[]
    readonly motion: DetailMotion
    readonly phase: DetailPhase
    readonly selectedPlace: Place | undefined
    readonly setPhase: (phase: DetailPhase) => void
    readonly setSurfaceRef: (element: HTMLElement | null) => void
  }
  readonly filter: {
    readonly onSelect: (filter: PlaceFilter) => void
    readonly selected: PlaceFilter
  }
  readonly location: {
    readonly request: (isUserRequested: boolean) => void
    readonly state: LocationState
  }
  readonly openPlace: (place: Place) => void
  readonly view: MapView
}

type DetailSurfaceProperties = {
  readonly model: MapDiscoverySurfaceModel
  readonly place: Place
}

function DetailSurface({ model, place }: DetailSurfaceProperties) {
  const { detail, filter, view } = model
  const content = (
    <PlaceDetail
      key={place.slug}
      directionsTarget={detail.directionsTargets?.[place.id]}
      menus={detail.menus}
      onClose={detail.clear}
      place={place}
      shareMap={{
        latitude: view.latitude,
        longitude: view.longitude,
        zoom: view.zoom,
        tag: filter.selected === "all" ? "balanced" : filter.selected,
      }}
    />
  )
  const handleTransitionEnd = (event: ReactTransitionEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return
    if (detail.phase === "closing") detail.finishClose()
    if (detail.phase === "opening" && event.propertyName === "opacity") detail.setPhase("open")
  }

  if (!detail.isMobile)
    return (
      <aside
        aria-label="장소 상세"
        className={styles["detailSurface"]}
        data-detail-motion={detail.motion}
        data-detail-phase={detail.phase}
        ref={detail.setSurfaceRef}
        onTransitionEnd={handleTransitionEnd}
      >
        {content}
      </aside>
    )

  return (
    <div
      aria-label="장소 상세"
      aria-modal="true"
      className={styles["detailSurface"]}
      data-detail-motion={detail.motion}
      data-detail-phase={detail.phase}
      ref={detail.setSurfaceRef}
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
      onTransitionEnd={handleTransitionEnd}
      role="dialog"
    >
      {content}
    </div>
  )
}

export function MapDiscoverySurface({ model }: { readonly model: MapDiscoverySurfaceModel }) {
  const { adapter, catalog, detail, filter, location, openPlace, view } = model
  const { selectedPlace } = detail
  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <header className={styles["header"]}>
        <div>
          <h1>건강식 지도</h1>
          <p>강남·역삼 주변의 건강식 선택지를 지도에서 살펴보세요.</p>
        </div>
        {catalog.isSample ? <strong className={styles["sample"]}>샘플 데이터</strong> : null}
        <button onClick={catalog.reload} type="button">
          장소 새로고침
        </button>
      </header>
      <div
        className={styles["map"]}
        data-adapter-state={adapter.state}
        data-detail-phase={selectedPlace ? detail.phase : "closed"}
        data-testid="map-stage"
      >
        <FallbackFieldGuide />
        <div aria-hidden="true" className={styles["sdkMap"]} ref={adapter.containerRef} />
        <div className={styles["filter"]}>
          <FilterRail selected={filter.selected} onSelect={filter.onSelect} />
        </div>
        <div aria-live="polite" className={styles["status"]}>
          <span>
            {adapter.state === "ready"
              ? "NAVER 지도 연결됨"
              : adapter.state === "loading"
                ? "NAVER 지도 불러오는 중"
                : adapter.state === "error"
                  ? "NAVER 지도를 불러오지 못했습니다."
                  : "기본 지도로 표시 중"}
          </span>
          {adapter.state === "error" ? (
            <button onClick={adapter.retry} type="button">
              지도 다시 시도
            </button>
          ) : null}
        </div>
        <button
          aria-label="현재 위치 다시 찾기"
          className={styles["locate"]}
          onClick={() => location.request(true)}
          type="button"
        >
          <LocateIcon />
        </button>
        <output className={styles["location"]} data-location-state={location.state.kind}>
          <span>{LOCATION_COPY[location.state.kind]}</span>
        </output>
        <span className={styles["view"]} data-testid="map-view">
          {viewLabel(view)}
        </span>
        {location.state.kind === "inside" ? (
          <span aria-label="내 위치" className={styles["userMarker"]} role="img" />
        ) : null}
        {catalog.state === "loading" ? (
          <div className={styles["catalogFeedback"]} role="status">
            장소 데이터를 불러오는 중입니다.
          </div>
        ) : catalog.state === "error" ? (
          <div className={styles["catalogFeedback"]} role="alert">
            <span>장소 데이터를 불러오지 못했습니다.</span>
            <button onClick={catalog.reload} type="button">
              <RotateCcwIcon /> 다시 시도
            </button>
          </div>
        ) : null}
        {catalog.visiblePlaces.length === 0 ? (
          <div className={styles["catalogFeedback"]} role="status">
            {catalog.isSample ? "표시할 샘플 장소가 없습니다." : "표시할 장소가 없습니다."}
          </div>
        ) : (
          <section
            aria-label={`${catalog.isSample ? "샘플 장소" : "장소"} ${catalog.visiblePlaces.length}곳`}
            className={styles["markers"]}
          >
            {catalog.visiblePlaces.map((place) => (
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
        {detail.linkNotice || selectedPlace ? (
          <p className={styles["selection"]} role="status">
            {detail.linkNotice ?? "장소를 선택했습니다."}
          </p>
        ) : null}
        {selectedPlace ? <DetailSurface model={model} place={selectedPlace} /> : null}
      </div>
    </section>
  )
}
