import Image from "next/image"
import { useState } from "react"
import type { PilotPlaceResultDto } from "../../lib/pilot/dto"
import { selectPilotMedia } from "../../lib/pilot/projection"
import styles from "./pilot-discovery.module.css"

export function PilotThumbnail({ result }: { readonly result: PilotPlaceResultDto }) {
  const image = selectPilotMedia(result.place.media, result.matchingMenuIds)
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
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(image.url)}
      />
    </span>
  )
}
