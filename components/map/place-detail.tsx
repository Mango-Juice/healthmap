"use client"

import { useEffect, useRef, useState } from "react"
import { captureProductAnalytics } from "../../lib/analytics/browser"
import type { Menu, Place } from "../../lib/domain/catalog"
import { buildProductionDirections, type DirectionsTarget } from "../../lib/domain/directions"
import type { PlaceFilter } from "../../lib/domain/filter"
import {
  buildAbsoluteMapShareUrl,
  buildAbsolutePlaceShareUrl,
  getRuntimeSiteEnvironment,
} from "../../lib/share-links"
import { LocateIcon, NavigationIcon, XIcon } from "../ui/health-map-icons"
import { CATEGORY_LABELS } from "../ui/health-map-options"
import { ActionButton } from "../ui/health-map-primitives"
import { MENU_VERIFICATION_LABELS } from "./menu-verification"
import styles from "./place-detail.module.css"

type Properties = {
  readonly menus: readonly Menu[]
  readonly directionsTarget?: DirectionsTarget | undefined
  readonly onClose: () => void
  readonly place: Place
  readonly shareMap: {
    readonly latitude: number
    readonly longitude: number
    readonly query: string
    readonly zoom: number
    readonly tag: PlaceFilter
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
  const manualUrl = useRef<HTMLTextAreaElement>(null)
  const [notice, setNotice] = useState<string>()
  const [manual, setManual] = useState<{ readonly target: ShareTarget; readonly url: string }>()
  const today = new Date().toISOString().slice(0, 10)
  const visibleMenus = menus
    .filter((menu) => menu.placeId === place.id && menu.published && menu.validUntil >= today)
    .sort((left, right) => left.displayOrder - right.displayOrder)

  useEffect(() => title.current?.focus({ preventScroll: true }), [])

  const share = async (target: ShareTarget): Promise<void> => {
    const environment = getRuntimeSiteEnvironment()
    const url =
      target === "place"
        ? buildAbsolutePlaceShareUrl(place.slug, environment)
        : buildAbsoluteMapShareUrl(
            {
              lat: shareMap.latitude,
              lng: shareMap.longitude,
              q: shareMap.query,
              tag: shareMap.tag,
              z: shareMap.zoom,
            },
            environment,
          )
    captureProductAnalytics({ event: "share_invoked", properties: { target } })
    if (url === null) {
      setNotice("공유 주소를 만들 수 없습니다. 잠시 후 다시 시도해 주세요.")
      return
    }
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
        <ActionButton
          aria-label="검색 결과로 돌아가기"
          onClick={onClose}
          title="검색 결과로 돌아가기"
          variant="quiet"
        >
          <XIcon />
        </ActionButton>
      </header>
      <div className={styles["body"]} data-testid="place-detail-body">
        <div className={styles["summary"]} data-detail-summary>
          <p className={styles["address"]} data-detail-meta>
            <LocateIcon />
            <span>{place.address}</span>
          </p>
          <p className={styles["categorySummary"]} data-detail-meta>
            <span>건강식 유형</span>
            <strong className={styles["tags"]}>
              {place.healthTags.map((tag) => CATEGORY_LABELS[tag]).join(" · ")}
            </strong>
          </p>
        </div>
        <section aria-label="건강식 메뉴" data-detail-menu>
          <div className={styles["menuHeading"]}>
            <h3 id="verified-menu-heading">확인한 메뉴</h3>
            <span>{visibleMenus.length}가지</span>
          </div>
          <ul aria-label="확인한 메뉴" className={styles["menuList"]}>
            {visibleMenus.map((menu) => (
              <li key={menu.id}>
                <strong>{menu.name}</strong>
                <span>
                  {MENU_VERIFICATION_LABELS[menu.verificationMethod]} · {menu.verifiedAt} 확인
                </span>
                <span>{menu.validUntil}까지 유효</span>
                {menu.evidenceUrl ? (
                  <a href={menu.evidenceUrl} rel="noreferrer" target="_blank">
                    검증 근거 보기
                  </a>
                ) : (
                  <span>직접 확인 기록</span>
                )}
              </li>
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
            <textarea
              aria-label="공유 URL"
              id="share-url"
              readOnly
              ref={manualUrl}
              rows={2}
              value={manual.url}
              wrap="soft"
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
