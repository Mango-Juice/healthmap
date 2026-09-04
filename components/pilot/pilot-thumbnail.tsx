import Image from "next/image"
import { useState } from "react"
import type { PilotPlaceDto } from "../../lib/pilot/dto"
import styles from "./pilot-discovery.module.css"

export function PilotThumbnail({ media }: { readonly media: PilotPlaceDto["media"] }) {
  const image = media[0]
  const [failedUrl, setFailedUrl] = useState<string>()
  if (!image || failedUrl === image.url) return null
  return (
    <span className={styles["thumbnail"]}>
      <Image
        src={image.url}
        alt={image.alt}
        width={48}
        height={48}
        loading="lazy"
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(image.url)}
      />
      {image.scope === "brand" ? <span>브랜드 공통 메뉴 이미지</span> : null}
    </span>
  )
}
