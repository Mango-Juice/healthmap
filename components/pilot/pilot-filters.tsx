import Image from "next/image"
import { PILOT_DISCOVERY_FILTERS, type PilotDiscoveryFilter } from "../../lib/pilot/discovery"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly onSelect: (value: PilotDiscoveryFilter) => void
  readonly selected: PilotDiscoveryFilter
}

export function PilotFilters({ onSelect, selected }: Properties) {
  const handleCompactChange = (value: string): void => {
    const option = PILOT_DISCOVERY_FILTERS.find((candidate) => candidate.value === value)
    if (option !== undefined) onSelect(option.value)
  }

  return (
    <nav aria-label="먹고 싶은 메뉴" className={styles["categoryBar"]}>
      <fieldset className={styles["categoryRail"]}>
        <legend className={styles["visuallyHidden"]}>메뉴 유형</legend>
        {PILOT_DISCOVERY_FILTERS.map((option) => (
          <button
            aria-label={`${option.label} 필터`}
            aria-pressed={selected === option.value}
            data-category={option.value}
            key={option.value}
            onClick={() => onSelect(option.value)}
            type="button"
          >
            <span className={styles["categoryChip"]}>
              {option.value !== "all" ? (
                <Image alt="" src={`/category-icons/${option.value}.svg`} width={24} height={30} />
              ) : null}
              <span>{option.label}</span>
            </span>
          </button>
        ))}
      </fieldset>
      <label className={styles["compactFilter"]}>
        <span>메뉴 유형</span>
        <select
          aria-label="메뉴 유형"
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
    </nav>
  )
}
