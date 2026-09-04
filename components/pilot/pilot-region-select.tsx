import type { PilotRegionsResponse } from "../../lib/pilot/dto"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly regions: PilotRegionsResponse | undefined
  readonly selected: string
  readonly nearby: boolean
  readonly onSelect: (id: string) => void
}
export function PilotRegionSelect({ regions, selected, nearby, onSelect }: Properties) {
  return (
    <label className={styles["regionSelect"]}>
      <span>{nearby ? "가까운 곳부터 둘러봐요" : "어디에서 먹을까요?"}</span>
      <select
        aria-label="지역 선택"
        value={nearby ? "map" : selected}
        onChange={(event) => onSelect(event.currentTarget.value)}
      >
        {nearby ? (
          <option value="map" disabled>
            지도 주변
          </option>
        ) : null}
        <option value="">전국{regions ? ` · ${regions.total}곳` : ""}</option>
        {regions?.regions.map((region) => (
          <option key={region.id} value={region.id}>
            {region.label} · {region.count}곳
          </option>
        ))}
      </select>
    </label>
  )
}
