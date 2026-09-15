import Image from "next/image"
import type { DiscoveryMenuDto as DiscoveryMenu } from "../../lib/discovery/dto"
import {
  DISCOVERY_LABELS,
  type DiscoveryTag,
  discoveryCategoryIcon,
  discoveryTagsForMenu,
  markerCategoryForMenus,
} from "../../lib/discovery/menu-selection"
import styles from "./food-map-discovery.module.css"

function FoodMapCategoryTag({ category }: { readonly category: DiscoveryTag }) {
  return (
    <span data-category={category}>
      <Image alt="" src={discoveryCategoryIcon(category)} width={16} height={20} />
      {DISCOVERY_LABELS[category]}
    </span>
  )
}

export function FoodMapStoreCategory({ brandId }: { readonly brandId: string | null }) {
  const category = markerCategoryForMenus([], "all", brandId)
  if (category === "neutral") return null
  return (
    <span className={styles["tags"]}>
      <FoodMapCategoryTag category={category} />
    </span>
  )
}

export function FoodMapCategoryTags({ menus }: { readonly menus: readonly DiscoveryMenu[] }) {
  return (
    <span className={styles["tags"]}>
      {[...new Set(menus.flatMap(discoveryTagsForMenu))].map((tag) => (
        <FoodMapCategoryTag category={tag} key={tag} />
      ))}
    </span>
  )
}
