import type { PilotPlace } from "../../lib/pilot/catalog"
import {
  discoveryTagsForPlace,
  PILOT_DISCOVERY_LABELS,
  type PilotDiscoveryTag,
} from "../../lib/pilot/discovery"
import { LeafIcon, WheatIcon } from "../ui/health-map-icons"
import styles from "./pilot-discovery.module.css"

const TagIcon = ({ tag }: { readonly tag: PilotDiscoveryTag }) =>
  tag === "whole_grain" ? <WheatIcon /> : <LeafIcon />

export function PilotCategoryTags({ place }: { readonly place: PilotPlace }) {
  return (
    <span className={styles["tags"]}>
      {discoveryTagsForPlace(place).map((tag) => (
        <span data-category={tag} key={tag}>
          <TagIcon tag={tag} />
          {PILOT_DISCOVERY_LABELS[tag]}
        </span>
      ))}
    </span>
  )
}
