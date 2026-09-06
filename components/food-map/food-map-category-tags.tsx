import Image from "next/image"
import type { DiscoveryMenuDto as DiscoveryMenu } from "../../lib/discovery/dto"
import {
  DISCOVERY_LABELS,
  discoveryCategoryIcon,
  discoveryTagsForMenu,
} from "../../lib/discovery/menu-selection"
import styles from "./food-map-discovery.module.css"

export function FoodMapCategoryTags({ menus }: { readonly menus: readonly DiscoveryMenu[] }) {
  return (
    <span className={styles["tags"]}>
      {[...new Set(menus.flatMap(discoveryTagsForMenu))].map((tag) => (
        <span data-category={tag} key={tag}>
          <Image alt="" src={discoveryCategoryIcon(tag)} width={16} height={20} />
          {DISCOVERY_LABELS[tag]}
        </span>
      ))}
    </span>
  )
}
