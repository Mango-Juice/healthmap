import Image from "next/image"
import { useState } from "react"
import type { DiscoveryPlaceResultDto } from "../../lib/discovery/dto"
import { selectDiscoveryMedia } from "../../lib/discovery/projection"
import styles from "./food-map-discovery.module.css"

export function FoodMapThumbnail({ result }: { readonly result: DiscoveryPlaceResultDto }) {
  const image = selectDiscoveryMedia(result.place.media, result.matchingMenuIds)
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
