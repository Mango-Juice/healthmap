"use client"

import Image from "next/image"
import Link from "next/link"
import { type RefObject, useEffect, useState } from "react"
import { buildNaverRouteDirections } from "../../lib/domain/directions"
import { presentPilotMenuName } from "../../lib/pilot/discovery"
import {
  type PilotDetailResponse,
  PilotDetailResponseSchema,
  type PilotPlaceResultDto as PilotResult,
} from "../../lib/pilot/dto"
import { buildPilotPlaceInfoUrl } from "../../lib/pilot/place-links"
import { ArrowLeftIcon, ArrowUpRightIcon, NavigationIcon } from "../ui/health-map-icons"
import styles from "./pilot-discovery.module.css"
import { PilotMenuList } from "./pilot-menu-list"

type Properties = {
  readonly expanded: boolean
  readonly onClose: () => void
  readonly result: PilotResult
  readonly titleRef: RefObject<HTMLHeadingElement | null>
}

export function PilotDetail({ expanded, onClose, result, titleRef }: Properties) {
  const { place } = result
  const [failedImageUrl, setFailedImageUrl] = useState<string>()
  const [detail, setDetail] = useState<PilotDetailResponse>()
  useEffect(() => {
    const controller = new AbortController()
    void fetch(`/api/places/${place.id}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const parsed = PilotDetailResponseSchema.safeParse(await response.json())
        if (parsed.success && !controller.signal.aborted) setDetail(parsed.data)
      })
      .catch((error: unknown) => {
        if (!(error instanceof Error)) throw error
      })
    return () => controller.abort()
  }, [place.id])
  const menus = detail?.place.id === place.id ? detail.menus : result.menus
  const matchingMenus = menus.filter((menu) => result.matchingMenuIds.includes(menu.id))
  const otherMenus = menus.filter((menu) => !result.matchingMenuIds.includes(menu.id))
  const firstMenu = matchingMenus[0]
  const image = place.media[0]
  const imageIsVisible = image !== undefined && image.url !== failedImageUrl
  const directions = buildNaverRouteDirections(place)
  const placeUrl = buildPilotPlaceInfoUrl(place)

  return (
    <section className={styles["detail"]} data-expanded={expanded}>
      <div className={styles["scrollBody"]}>
        <div className={styles["detailBody"]}>
          <header className={styles["placeHeading"]}>
            <div className={styles["placeToolbar"]}>
              <button aria-label="장소에서 돌아가기" onClick={onClose} type="button">
                <ArrowLeftIcon />
                <span>돌아가기</span>
              </button>
            </div>
            <h2 ref={titleRef} tabIndex={-1}>
              {place.name}
            </h2>
          </header>
          <p className={styles["address"]}>{place.address}</p>
          {firstMenu ? (
            <p className={styles["quickMenu"]}>
              {presentPilotMenuName(firstMenu.name)}
              {matchingMenus.length > 1 ? <span> 외 {matchingMenus.length - 1}가지</span> : null}
            </p>
          ) : null}
          <div className={styles["detailMore"]}>
            {imageIsVisible ? (
              <figure className={styles["placePhoto"]}>
                <div className={styles["officialImage"]}>
                  <Image
                    alt={image.alt}
                    height={400}
                    loading="lazy"
                    onError={() => setFailedImageUrl(image.url)}
                    referrerPolicy="no-referrer"
                    sizes="(max-width: 899px) 100vw, 352px"
                    src={image.url}
                    width={800}
                    unoptimized
                  />
                </div>
                {image.scope === "brand" ? <figcaption>브랜드 공통 메뉴 사진</figcaption> : null}
              </figure>
            ) : null}
            <PilotMenuList menus={matchingMenus} title="여기서 먹을 수 있어요" />
            <PilotMenuList menus={otherMenus} title="함께 살펴볼 메뉴" />
          </div>
          <div className={styles["visitActions"]}>
            <a
              aria-describedby="pilot-place-link-note"
              className={`${styles["visitAction"]} ${styles["compactAction"]}`}
              href={placeUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ArrowUpRightIcon />
              <span>장소 정보 보기</span>
            </a>
            {directions ? (
              <a
                aria-label={`${place.name} 길찾기`}
                className={`${styles["visitAction"]} ${styles["compactAction"]}`}
                data-primary="true"
                href={directions.url}
                rel="noopener noreferrer"
                target="_blank"
              >
                <NavigationIcon />
                <span>길찾기</span>
              </a>
            ) : null}
          </div>
          <p className={styles["visuallyHidden"]} id="pilot-place-link-note">
            {place.naverPlaceUrl
              ? "네이버 지도의 장소 페이지를 새 창에서 엽니다."
              : "네이버 지도에서 지역과 장소 이름으로 검색한 결과를 새 창에서 엽니다."}
          </p>
          <div className={styles["detailMore"]}>
            <p className={styles["mapProvider"]}>장소 정보와 길찾기는 네이버 지도로 연결돼요.</p>
            {place.phone ? (
              <a className={styles["phoneAction"]} href={`tel:${place.phone}`}>
                <span>전화하기</span>
                {place.phone}
              </a>
            ) : null}
            <Link
              className={styles["suggestionLink"]}
              href={`/suggest?${new URLSearchParams({ placeId: place.id })}`}
              prefetch={false}
            >
              바뀐 메뉴 알려주기
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
