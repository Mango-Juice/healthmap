"use client"

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { LeafIcon, LocateIcon, NavigationIcon, XIcon } from "../../components/ui/health-map-icons"
import type { FilterValue } from "../../components/ui/health-map-options"
import { ActionButton, FilterRail, MapMarker } from "../../components/ui/health-map-primitives"
import detailStyles from "./detail-surface.module.css"
import mapStyles from "./map-shell.module.css"
import styles from "./showcase.module.css"

const MOBILE_MEDIA_QUERY = "(max-width: 767px)"
const DETAIL_CLOSE_DURATION_MS = 240
const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function subscribeToMobileViewport(onChange: () => void) {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY)
  mediaQuery.addEventListener("change", onChange)
  return () => mediaQuery.removeEventListener("change", onChange)
}

function useMobileViewport() {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => false,
  )
}

function MapDrawing() {
  return (
    <svg
      aria-hidden="true"
      className={mapStyles["mapDrawing"]}
      preserveAspectRatio="none"
      viewBox="0 0 900 560"
    >
      <rect className={mapStyles["mapLand"]} height="132" rx="8" width="170" x="82" y="70" />
      <rect className={mapStyles["mapLand"]} height="144" rx="8" width="210" x="610" y="90" />
      <rect className={mapStyles["mapLand"]} height="120" rx="8" width="190" x="420" y="330" />
      <path d="M-20 390C140 300 240 330 370 210S690 80 930 150" />
      <path d="M90-20c40 150 120 240 260 310s280 70 590 40" />
      <path d="M-20 180c220-20 340 20 470 140s260 130 470 90" />
      <path d="M570-20c-80 150-90 280 10 590" />
      <path d="M220-20c10 150-60 280-240 430" />
    </svg>
  )
}

type DetailContentProperties = { readonly onClose: () => void }

function DetailContent({ onClose }: DetailContentProperties) {
  return (
    <>
      <header className={detailStyles["detailHeader"]}>
        <div>
          <span className={detailStyles["detailKicker"]}>균형식 · 도보 5분</span>
          <h2 id="showcase-place-title" tabIndex={-1}>
            그린테이블 강남점
          </h2>
        </div>
        <ActionButton
          aria-label="상세 닫기"
          className={mapStyles["iconButton"]}
          onClick={onClose}
          variant="quiet"
        >
          <XIcon />
        </ActionButton>
      </header>
      <div className={detailStyles["detailBody"]}>
        <div className={detailStyles["placeFact"]}>
          <LeafIcon />
          <span>채소 · 단백질 · 균형식</span>
        </div>
        <div className={detailStyles["placeFact"]}>
          <LocateIcon />
          <span>서울 강남구 테헤란로 123</span>
        </div>
        <p>신선한 채소와 곡물을 중심으로 고른 대표 메뉴를 확인할 수 있어요.</p>
      </div>
      <footer className={detailStyles["detailActions"]}>
        <ActionButton leadingIcon={<NavigationIcon />} variant="primary">
          길찾기
        </ActionButton>
        <ActionButton variant="secondary">공유</ActionButton>
      </footer>
    </>
  )
}

function trapSheetFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Tab") return
  const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  const first = controls.at(0)
  const last = controls.at(-1)
  if (!first || !last) return
  const activeControl = controls.find((control) => control === document.activeElement)
  if (!activeControl) {
    event.preventDefault()
    if (event.shiftKey) last.focus()
    else first.focus()
  } else if (event.shiftKey && activeControl === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export function MapShell() {
  const [selected, setSelected] = useState<FilterValue>("all")
  const [detailOpen, setDetailOpen] = useState(true)
  const [showReopen, setShowReopen] = useState(false)
  const isMobile = useMobileViewport()
  const shellRef = useRef<HTMLDivElement>(null)
  const closeTimerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (detailOpen && isMobile)
      shellRef.current?.querySelector<HTMLElement>("#showcase-place-title")?.focus()
  }, [detailOpen, isMobile])

  const closeDetail = useCallback(() => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    setDetailOpen(false)
    closeTimerRef.current = window.setTimeout(() => setShowReopen(true), DETAIL_CLOSE_DURATION_MS)
  }, [])
  const openDetail = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = undefined
    setShowReopen(false)
    setDetailOpen(true)
  }

  useEffect(
    () => () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (showReopen)
      shellRef.current?.querySelector<HTMLButtonElement>("[data-detail-open]")?.focus()
  }, [showReopen])

  useEffect(() => {
    if (isMobile || !detailOpen) return
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") closeDetail()
    }
    document.addEventListener("keydown", closeOnEscape)
    return () => document.removeEventListener("keydown", closeOnEscape)
  }, [closeDetail, detailOpen, isMobile])

  return (
    <section aria-labelledby="map-shell-heading" className={styles["mapSection"]}>
      <div className={styles["sectionHeading"]}>
        <div>
          <span className={styles["stateLabel"]}>MAP-FIRST SHELL</span>
          <h2 id="map-shell-heading">반응형 상세 표면</h2>
        </div>
        <span>모바일 시트 · 데스크톱 우측 패널</span>
      </div>
      <div className={mapStyles["mapShell"]} data-testid="map-shell" ref={shellRef}>
        <div className={mapStyles["mapStage"]}>
          <div className={mapStyles["mapCanvas"]} inert={isMobile && detailOpen}>
            <MapDrawing />
            <div className={mapStyles["mapTopbar"]}>
              <strong>건강식 지도</strong>
              <ActionButton
                aria-label="현재 위치"
                className={mapStyles["iconButton"]}
                variant="quiet"
              >
                <LocateIcon />
              </ActionButton>
            </div>
            <div className={mapStyles["mapFilters"]}>
              <FilterRail onSelect={setSelected} selected={selected} />
            </div>
            <div className={mapStyles["markerOne"]}>
              <MapMarker
                category="vegetables"
                label="그린테이블 강남점"
                onSelect={openDetail}
                selected
              />
            </div>
            <div className={mapStyles["markerTwo"]}>
              <MapMarker category="protein" label="프로틴 키친 역삼점" onSelect={openDetail} />
            </div>
            <div className={mapStyles["markerThree"]}>
              <MapMarker category="balanced" label="밸런스 볼 선릉점" onSelect={openDetail} />
            </div>
            <div className={mapStyles["markerFour"]}>
              <MapMarker category="plant_based" label="푸른콩 식탁" onSelect={openDetail} />
            </div>
          </div>
          {isMobile ? (
            <>
              <button
                aria-hidden={!detailOpen}
                aria-label="상세 배경 닫기"
                className={detailStyles["sheetScrim"]}
                data-open={detailOpen}
                onClick={closeDetail}
                tabIndex={-1}
                type="button"
              />
              <section
                aria-hidden={!detailOpen}
                aria-labelledby="showcase-place-title"
                aria-modal={detailOpen ? "true" : undefined}
                className={detailStyles["mobileSheet"]}
                data-open={detailOpen}
                inert={!detailOpen}
                onKeyDown={(event) => {
                  if (event.key === "Escape") closeDetail()
                  else trapSheetFocus(event)
                }}
                role="dialog"
              >
                <DetailContent onClose={closeDetail} />
              </section>
            </>
          ) : null}
          {showReopen && isMobile ? (
            <div className={detailStyles["closedDetail"]} data-testid="detail-closed">
              <ActionButton data-detail-open onClick={openDetail} variant="primary">
                상세 열기
              </ActionButton>
            </div>
          ) : null}
        </div>
        {detailOpen && !isMobile ? (
          <aside aria-labelledby="showcase-place-title" className={detailStyles["desktopPane"]}>
            <DetailContent onClose={closeDetail} />
          </aside>
        ) : showReopen ? (
          <div className={detailStyles["desktopClosed"]} data-testid="detail-closed-desktop">
            <ActionButton data-detail-open onClick={openDetail} variant="primary">
              상세 열기
            </ActionButton>
          </div>
        ) : null}
      </div>
    </section>
  )
}
