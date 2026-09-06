import type { DiscoveryMenuDto, DiscoveryPlaceDto } from "./dto"

export const selectDiscoveryMedia = (
  media: DiscoveryPlaceDto["media"],
  matchingMenuIds: readonly DiscoveryMenuDto["id"][],
): DiscoveryPlaceDto["media"][number] | undefined => {
  const matching = new Set(matchingMenuIds)
  return (
    media.find(
      (candidate) =>
        candidate.subject === "menu" && candidate.menuIds.some((menuId) => matching.has(menuId)),
    ) ?? media.find((candidate) => candidate.subject === "venue")
  )
}
