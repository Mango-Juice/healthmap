import type { Menu, Place } from "../../lib/domain/catalog"
import { ExactNaverPlaceUrlSchema } from "../../lib/domain/place-links"
import { getPublicNaverLinkKind } from "../../lib/domain/public-place-links"
import { CATEGORY_LABELS } from "../ui/health-map-options"

const FORM_LABELS = {
  salad_poke: "샐러드·포케",
  rice: "밥·정식",
  noodles: "면",
  soup: "국·탕",
  sandwich: "샌드위치",
  main_dish: "주요리",
  unknown: "",
} as const
export const menuCategoryLabels = (place: Place, menus: readonly Menu[]): string => {
  if (place.schemaVersion !== "2.0.0")
    return place.healthTags.map((tag) => CATEGORY_LABELS[tag]).join(" · ")
  return [
    ...new Set(
      menus.flatMap((menu) => {
        if (menu.schemaVersion !== "2.0.0") return []
        return [
          FORM_LABELS[menu.facts.form],
          menu.facts.rice_base !== "unknown" ? "잡곡·현미" : "",
          menu.facts.dietary !== "unknown" ? "채식 표기" : "",
        ].filter(Boolean)
      }),
    ),
  ].join(" · ")
}
export const menuApplicabilityNotice = (menu: Menu): string | undefined =>
  menu.schemaVersion === "2.0.0" && menu.branchApplicability === "brand_common_unverified"
    ? "브랜드 공통 메뉴 · 지점별 판매 확인 필요"
    : undefined
export const menuReasons = (menu: Menu): readonly string[] =>
  menu.schemaVersion === "2.0.0"
    ? menu.facts.selection_reasons
        .filter((reason) => reason.text !== menu.name && reason.text !== menu.facts.ordering_note)
        .map((reason) => reason.text)
    : []
export const placeMapUrl = (place: Place): string =>
  place.naverPlaceUrl ??
  `https://map.naver.com/p/search/${encodeURIComponent(`${place.name} ${place.address}`)}`
export const placeMapLabel = (place: Place): string =>
  (
    place.schemaVersion === "2.0.0"
      ? getPublicNaverLinkKind(placeMapUrl(place)) === "exact"
      : ExactNaverPlaceUrlSchema.safeParse(place.naverPlaceUrl).success
  )
    ? "네이버에서 보기"
    : "네이버에서 검색"
