import Image from "next/image"
import {
  discoveryTagsForMenu,
  PILOT_DISCOVERY_LABELS,
  pilotCategoryIcon,
} from "../../lib/pilot/discovery"
import type { PilotMenuDto as PilotMenu } from "../../lib/pilot/dto"
import styles from "./pilot-discovery.module.css"

export function PilotCategoryTags({ menus }: { readonly menus: readonly PilotMenu[] }) {
  return (
    <span className={styles["tags"]}>
      {[...new Set(menus.flatMap(discoveryTagsForMenu))].map((tag) => (
        <span data-category={tag} key={tag}>
          <Image alt="" src={pilotCategoryIcon(tag)} width={16} height={20} />
          {PILOT_DISCOVERY_LABELS[tag]}
        </span>
      ))}
    </span>
  )
}
