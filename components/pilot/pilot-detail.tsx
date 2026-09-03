"use client"

import Image from "next/image"
import { type RefObject, useState } from "react"
import { buildNaverRouteDirections } from "../../lib/domain/directions"
import type { PilotCatalog, PilotPlace } from "../../lib/pilot/catalog"
import { menusForPilotPlace, presentPilotMenuName } from "../../lib/pilot/discovery"
import { ArrowLeftIcon, NavigationIcon } from "../ui/health-map-icons"
import { PilotCategoryTags } from "./pilot-category-tags"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly catalog: PilotCatalog
  readonly onClose: () => void
  readonly place: PilotPlace
  readonly titleRef: RefObject<HTMLHeadingElement | null>
}

export function PilotDetail({ catalog, onClose, place, titleRef }: Properties) {
  const [failedImageUrl, setFailedImageUrl] = useState<string>()
  const menus = menusForPilotPlace(catalog, place.id)
  const image = place.officialImage
  const imageIsVisible = image !== undefined && image.url !== failedImageUrl
  const directions = buildNaverRouteDirections(place)

  return (
    <section className={styles["detail"]}>
      <header className={styles["detailHeader"]}>
        <button aria-label="건강식 목록으로 돌아가기" onClick={onClose} type="button">
          <ArrowLeftIcon />
          <span>목록으로</span>
        </button>
      </header>
      <div className={styles["scrollBody"]}>
        {imageIsVisible ? (
          <div className={styles["officialImage"]}>
            <Image
              alt={image.alt}
              height={image.height}
              loading="eager"
              onError={() => setFailedImageUrl(image.url)}
              referrerPolicy="no-referrer"
              sizes="(max-width: 899px) 100vw, 352px"
              src={image.url}
              width={image.width}
            />
          </div>
        ) : null}
        <div className={styles["detailBody"]}>
          <PilotCategoryTags place={place} />
          <h2 ref={titleRef} tabIndex={-1}>
            {place.name}
          </h2>
          <p className={styles["address"]}>{place.address}</p>
          {directions ? (
            <a
              aria-label={`${place.name} 네이버 길찾기`}
              className={styles["visitAction"]}
              href={directions.url}
              rel="noopener noreferrer"
              target="_blank"
            >
              <NavigationIcon />
              <span>네이버 길찾기</span>
            </a>
          ) : null}
          <section aria-label="메뉴" className={styles["menus"]}>
            <h3>이런 메뉴가 있어요</h3>
            <ul>
              {menus.map((menu) => (
                <li key={menu.id}>{presentPilotMenuName(menu.name)}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
  )
}
