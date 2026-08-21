"use client"

import { useEffect, useRef, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Menu, Place } from "../../lib/domain/catalog"
import { buildProductionDirections, type DirectionsTarget } from "../../lib/domain/directions"
import { serializeMapShare, serializePlaceShare } from "../../lib/domain/share"
import { LocateIcon, NavigationIcon, XIcon } from "../ui/health-map-icons"
import { CATEGORY_LABELS } from "../ui/health-map-options"
import { ActionButton } from "../ui/health-map-primitives"
import styles from "./place-detail.module.css"

type Properties = {
  readonly menus: readonly Menu[]
  readonly directionsTarget?: DirectionsTarget | undefined
  readonly onClose: () => void
  readonly place: Place
  readonly shareMap: {
    readonly latitude: number
    readonly longitude: number
    readonly zoom: number
    readonly tag: Place["primaryTag"]
  }
}

type ShareTarget = "place" | "map"

const copyUrl = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard?.writeText(url)
    return navigator.clipboard !== undefined
  } catch (error) {
    if (error instanceof Error) return false
    throw error
  }
}

export function PlaceDetail({ directionsTarget, menus, onClose, place, shareMap }: Properties) {
  const title = useRef<HTMLHeadingElement>(null)
  const manualUrl = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState<string>()
  const [manual, setManual] = useState<{ readonly target: ShareTarget; readonly url: string }>()
  const visibleMenus = menus
    .filter((menu) => menu.placeId === place.id && menu.published)
    .sort((left, right) => left.displayOrder - right.displayOrder)

  useEffect(() => title.current?.focus({ preventScroll: true }), [])

  const share = async (target: ShareTarget): Promise<void> => {
    const url =
      target === "place"
        ? serializePlaceShare(place.slug)
        : serializeMapShare(
            { latitude: shareMap.latitude, longitude: shareMap.longitude },
            shareMap.zoom,
            shareMap.tag,
          )
    captureProductAnalytics({ event: "share_invoked", properties: { target } })
    if (navigator.share !== undefined) {
      try {
        await navigator.share({ url })
        captureProductAnalytics({
          event: "share_completed",
          properties: { target, outcome: "web_share" },
        })
        setNotice("공유 창을 열었습니다.")
        return
      } catch (error) {
        if (!(error instanceof Error)) throw error
      }
    }
    if (await copyUrl(url)) {
      captureProductAnalytics({
        event: "share_completed",
        properties: { target, outcome: "clipboard" },
      })
      setNotice("공유 URL을 클립보드에 복사했습니다.")
      return
    }
    setManual({ target, url })
    setNotice("공유 URL을 직접 선택해 복사할 수 있습니다.")
  }

  const openDirections = (): void => {
    const directions = buildProductionDirections(place, directionsTarget)
    if (directions === undefined) {
      setNotice("길찾기 정보를 사용할 수 없습니다.")
      return
    }
    window.open(directions.url, "_blank", "noopener,noreferrer")
    captureProductAnalytics({
      event: "directions_opened",
      properties: { place_id: place.id, source: directions.source },
    })
  }

  const completeManualShare = (): void => {
    if (manual === undefined) return
    manualUrl.current?.select()
    captureProductAnalytics({
      event: "share_completed",
      properties: { target: manual.target, outcome: "manual" },
    })
    setNotice("공유 URL을 선택했습니다.")
  }

  return (
    <section
      aria-labelledby="place-detail-title"
      className={styles["detail"]}
      data-testid="place-detail"
    >
      <header className={styles["header"]}>
        <div>
          <strong>장소 정보</strong>
          <h2 id="place-detail-title" ref={title} tabIndex={-1}>
            {place.name}
          </h2>
        </div>
        <ActionButton aria-label="상세 닫기" onClick={onClose} title="상세 닫기" variant="quiet">
          <XIcon />
        </ActionButton>
      </header>
      <div className={styles["body"]} data-testid="place-detail-body">
        <div className={styles["summary"]} data-detail-summary>
          <p className={styles["address"]}>
            <LocateIcon />
            {place.address}
          </p>
          <div className={styles["metaGrid"]}>
            <div data-detail-meta>
              <span>유형</span>
              <strong className={styles["tags"]}>
                {place.healthTags.map((tag) => CATEGORY_LABELS[tag]).join(" · ")}
              </strong>
            </div>
            <div data-detail-meta>
              <span>메뉴</span>
              <strong>{visibleMenus.length}가지</strong>
            </div>
          </div>
        </div>
        <section aria-label="건강식 메뉴" data-detail-menu>
          <h3>건강식 메뉴</h3>
          <ul>
            {visibleMenus.map((menu) => (
              <li key={menu.id}>{menu.name}</li>
            ))}
          </ul>
        </section>
        {notice ? (
          <p className={styles["notice"]} role="status">
            {notice}
          </p>
        ) : null}
        {manual ? (
          <div className={styles["manual"]}>
            <label htmlFor="share-url">공유 URL</label>
            <input
              aria-label="공유 URL"
              id="share-url"
              readOnly
              ref={manualUrl}
              value={manual.url}
            />
            <ActionButton onClick={completeManualShare} variant="secondary">
              URL 선택
            </ActionButton>
          </div>
        ) : null}
      </div>
      <footer className={styles["actions"]}>
        <ActionButton leadingIcon={<NavigationIcon />} onClick={openDirections} variant="primary">
          길찾기
        </ActionButton>
        <ActionButton onClick={() => share("place")} variant="secondary">
          공유
        </ActionButton>
        <ActionButton onClick={() => share("map")} variant="quiet">
          지도 공유
        </ActionButton>
      </footer>
    </section>
  )
}
