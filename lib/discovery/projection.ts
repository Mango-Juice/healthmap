import type { DiscoveryMenu, DiscoveryPlace } from "./catalog"
import type { DiscoveryMenuDto, DiscoveryPlaceDto } from "./dto"
import { canonicalDiscoveryRegion } from "./region"
import type { SubwayStore } from "./subway"

export const regionForPlace = (place: DiscoveryPlace): string =>
  canonicalDiscoveryRegion(place.address)
export const selectDiscoveryMedia = (
  media: DiscoveryPlace["media"],
  matchingMenuIds: readonly DiscoveryMenu["id"][],
): DiscoveryPlace["media"][number] | undefined => {
  const matching = new Set(matchingMenuIds)
  return (
    media.find(
      (candidate) =>
        candidate.subject === "menu" && candidate.menuIds.some((menuId) => matching.has(menuId)),
    ) ?? media.find((candidate) => candidate.subject === "venue")
  )
}
export const toDiscoveryPlaceDto = (place: DiscoveryPlace): DiscoveryPlaceDto => ({
  id: place.id,
  slug: place.slug,
  name: place.name,
  brandId: place.brandId,
  address: place.address,
  latitude: place.latitude,
  longitude: place.longitude,
  region: regionForPlace(place),
  phone: place.phone,
  naverPlaceUrl: place.naverPlaceUrl,
  media: place.media,
  listingKind: "menu_evidence",
  storeDescription: null,
  officialStoreUrl: null,
})
export const toSubwayStoreDto = (store: SubwayStore): DiscoveryPlaceDto => ({
  id: store.id,
  slug: store.slug,
  name: `서브웨이 ${store.name}`,
  brandId: store.brandId,
  address: store.address,
  latitude: store.latitude,
  longitude: store.longitude,
  region: canonicalDiscoveryRegion(store.address),
  phone: null,
  naverPlaceUrl: null,
  media: [],
  listingKind: "store_only",
  storeDescription: "서브웨이 · 샌드위치·샐러드 매장",
  officialStoreUrl: store.officialDetailUrl,
})
export const toDiscoveryMenuDto = (menu: DiscoveryMenu): DiscoveryMenuDto => ({
  id: menu.id,
  placeId: menu.placeId,
  name: menu.name,
  facts: {
    scope: menu.facts.scope,
    form: menu.facts.form,
    ingredients: menu.facts.ingredients,
    rice_base: menu.facts.rice_base,
    base_is_option: menu.facts.base_is_option,
    dietary: menu.facts.dietary,
    ordering_note: menu.facts.ordering_note,
    cooking: menu.facts.cooking,
    selection_reasons: menu.facts.selection_reasons,
  },
  branchApplicability:
    menu.branchApplicability === "brand_common_unverified"
      ? "brand_common_unverified"
      : "branch_confirmed",
  applicabilityNotice:
    menu.branchApplicability === "brand_common_unverified"
      ? "브랜드 공통 메뉴 · 지점별 판매 확인 필요"
      : null,
})
