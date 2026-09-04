"use client"

import Image from "next/image"
import { useState } from "react"
import type { Place } from "../../lib/domain/catalog"
import { placeMapLabel, placeMapUrl } from "./menu-fact-presentation"
import styles from "./place-detail.module.css"

export function PlaceVisitInfo({ place }: { readonly place: Place }) {
  const [failedImage, setFailedImage] = useState<string>()
  const media = place.schemaVersion === "2.0.0" ? place.media[0] : undefined
  return (
    <>
      {media !== undefined && media.url !== failedImage ? (
        <figure className={styles["media"]}>
          <Image
            alt={media.alt}
            height={400}
            width={800}
            sizes="(max-width: 767px) 100vw, 360px"
            src={media.url}
            unoptimized
            referrerPolicy="no-referrer"
            onError={() => setFailedImage(media.url)}
          />
          {media.scope === "brand" ? <figcaption>브랜드 공통 메뉴 이미지</figcaption> : null}
        </figure>
      ) : null}
      {place.schemaVersion === "2.0.0" && place.phone ? (
        <a className={styles["visitAction"]} href={`tel:${place.phone}`}>
          {place.phone} 전화하기
        </a>
      ) : null}
      <a
        className={styles["visitAction"]}
        href={placeMapUrl(place)}
        target="_blank"
        rel="noopener noreferrer"
      >
        {placeMapLabel(place)}
      </a>
    </>
  )
}
