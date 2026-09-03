"use client"

import type { LocationState } from "../../lib/domain/geo"
import { viewLabel } from "../../lib/map/adapter"
import { ApplicationMasthead } from "../ui/application-masthead"
import {
  AlertTriangleIcon,
  ChevronDownIcon,
  LoaderIcon,
  LocateIcon,
  RotateCcwIcon,
} from "../ui/health-map-icons"
import { ActionButton, FilterRail } from "../ui/health-map-primitives"
import { DetailSurface } from "./detail-surface"
import styles from "./map-discovery.module.css"
import type { MapDiscoverySurfaceModel } from "./map-discovery-model"
import { PlaceResults } from "./place-results"

const LOCATION_COPY: Record<LocationState["kind"], string> = {
  requesting: "현재 위치를 확인하고 있습니다.",
  inside: "현재 위치를 지도에 표시했습니다.",
  outside: "서비스 범위 밖입니다.",
  denied: "위치 권한이 거부되었습니다.",
  timeout: "위치 확인 시간이 초과되었습니다.",
  unsupported: "위치 기능을 지원하지 않습니다.",
}

export function MapDiscoverySurface({ model }: { readonly model: MapDiscoverySurfaceModel }) {
  const { adapter, catalog, detail, discovery, filter, location, view } = model
  const { selectedPlace } = detail
  const locationNeedsAttention = ["outside", "denied", "timeout", "unsupported"].includes(
    location.state.kind,
  )
  return (
    <section aria-label="건강식 지도" className={styles["shell"]}>
      <ApplicationMasthead
        action={
          <ActionButton leadingIcon={<RotateCcwIcon />} onClick={catalog.reload} variant="quiet">
            장소 새로고침
          </ActionButton>
        }
        context="강남·역삼"
        description="건강식 선택지를 지도에서 살펴보세요."
        title="건강식 지도"
      />
      <div
        className={styles["map"]}
        data-adapter-state={adapter.state}
        data-detail-phase={selectedPlace ? detail.phase : "closed"}
        data-location-attention={locationNeedsAttention}
        data-testid="map-stage"
      >
        <div
          aria-label="NAVER 지도"
          className={styles["sdkMap"]}
          data-testid="naver-map"
          ref={adapter.containerRef}
          role="application"
        />
        {adapter.state === "loading" ? (
          <div aria-live="polite" className={styles["mapState"]} role="status">
            <LoaderIcon className={styles["mapStateIcon"]} />
            <strong>NAVER 지도를 불러오는 중입니다.</strong>
            <span>잠시만 기다려 주세요.</span>
          </div>
        ) : adapter.state === "error" ? (
          <div aria-live="assertive" className={styles["mapState"]} data-tone="error" role="alert">
            <AlertTriangleIcon className={styles["mapStateIcon"]} />
            <strong>NAVER 지도를 불러올 수 없습니다.</strong>
            <span>Client ID, Web 서비스 URL 또는 네트워크 연결을 확인해 주세요.</span>
            <button onClick={adapter.retry} type="button">
              <RotateCcwIcon className={styles["mapStateButtonIcon"]} /> 다시 시도
            </button>
          </div>
        ) : (
          <>
            <div className={styles["filter"]}>
              <FilterRail selected={filter.selected} onSelect={filter.onSelect} />
            </div>
            {discovery.pending ? (
              <button className={styles["areaSearch"]} onClick={discovery.applyArea} type="button">
                이 지역 검색
              </button>
            ) : null}
            <div aria-live="polite" className={styles["status"]}>
              <span>NAVER 지도 연결됨</span>
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
            {catalog.state === "ready" && catalog.results.length === 0 && !discovery.query ? (
              <div className={styles["catalogFeedback"]} role="status">
                표시할 장소가 없습니다.
              </div>
            ) : catalog.results.length > 0 ? (
              <span aria-live="polite" className={styles["visuallyHidden"]}>
                지도와 목록에 장소 {catalog.results.length}곳을 표시했습니다.
              </span>
            ) : null}
            {detail.linkNotice || selectedPlace ? (
              <p
                className={styles["selection"]}
                data-selection-kind={detail.linkNotice ? "recovery" : "ordinary"}
                role="status"
              >
                {detail.linkNotice ?? "장소를 선택했습니다."}
              </p>
            ) : null}
            <button
              aria-expanded={discovery.trayExpanded}
              aria-label={`검색 결과 ${catalog.results.length}곳 ${discovery.trayExpanded ? "접기" : "보기"}`}
              className={styles["trayToggle"]}
              onClick={() => discovery.setTrayExpanded(!discovery.trayExpanded)}
              type="button"
            >
              검색 결과 {catalog.results.length}곳
              <ChevronDownIcon />
            </button>
            {selectedPlace ? (
              <DetailSurface model={model} place={selectedPlace} />
            ) : (
              <aside
                aria-label="검색 결과 패널"
                className={styles["discoverySurface"]}
                data-expanded={discovery.trayExpanded}
              >
                <PlaceResults
                  menus={catalog.menus}
                  onQueryChange={discovery.setQuery}
                  onSearchCommit={discovery.onSearchCommit}
                  onSelect={(place, trigger) => detail.onSelectPlace(place, "list", trigger)}
                  query={discovery.query}
                  results={catalog.results}
                />
              </aside>
            )}
          </>
        )}
      </div>
    </section>
  )
}
