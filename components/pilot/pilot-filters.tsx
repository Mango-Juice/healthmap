import { PILOT_DISCOVERY_FILTERS, type PilotDiscoveryFilter } from "../../lib/pilot/discovery"
import { LeafIcon, MapPinIcon, WheatIcon } from "../ui/health-map-icons"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly onSelect: (value: PilotDiscoveryFilter) => void
  readonly selected: PilotDiscoveryFilter
}

const FilterIcon = ({ value }: { readonly value: PilotDiscoveryFilter }) => {
  if (value === "whole_grain") return <WheatIcon />
  if (value === "plant_based") return <LeafIcon />
  return <MapPinIcon />
}

export function PilotFilters({ onSelect, selected }: Properties) {
  const handleCompactChange = (value: string): void => {
    const option = PILOT_DISCOVERY_FILTERS.find((candidate) => candidate.value === value)
    if (option !== undefined) onSelect(option.value)
  }

  return (
    <>
      <fieldset className={styles["categoryRail"]}>
        <legend className={styles["visuallyHidden"]}>건강식 유형</legend>
        {PILOT_DISCOVERY_FILTERS.map((option) => (
          <button
            aria-label={`${option.label} 필터`}
            aria-pressed={selected === option.value}
            data-category={option.value}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <FilterIcon value={option.value} />
            <span>{option.label}</span>
          </button>
        ))}
      </fieldset>
      <label className={styles["compactFilter"]}>
        <span>건강식 유형</span>
        <select
          aria-label="건강식 유형"
          onChange={(event) => handleCompactChange(event.currentTarget.value)}
          value={selected}
        >
          {PILOT_DISCOVERY_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}
