import type { PilotPlace } from "./catalog"

type PlaceLinkTarget = Pick<PilotPlace, "name" | "address" | "naverPlaceUrl">

export const buildPilotPlaceInfoUrl = (place: PlaceLinkTarget): string => {
  if (place.naverPlaceUrl) return place.naverPlaceUrl
  const name = place.name.trim().replace(/^(포케올데이\s+.+?)\s+포케&샐러드$/u, "$1")
  const region = place.address.trim().split(/\s+/u).slice(0, 2).join(" ")
  return `https://map.naver.com/p/search/${encodeURIComponent(`${region} ${name}`.trim())}`
}
