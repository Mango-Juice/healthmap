import type { RefObject } from "react"
import type { PilotRegionDto } from "../../lib/pilot/dto"
import { ActionButton } from "../ui/health-map-primitives"
import styles from "./pilot-discovery.module.css"

type Properties = {
  readonly headingRef: RefObject<HTMLHeadingElement | null>
  readonly regions: readonly PilotRegionDto[]
  readonly failed: boolean
  readonly loading: boolean
  readonly onRetry: () => void
  readonly onSelect: (region: PilotRegionDto) => void
}

export function PilotAreaRecovery({
  headingRef,
  regions,
  failed,
  loading,
  onRetry,
  onSelect,
}: Properties) {
  return (
    <section aria-labelledby="pilot-area-recovery-heading" className={styles["areaRecovery"]}>
      <h2 id="pilot-area-recovery-heading" ref={headingRef} tabIndex={-1}>
        지도 밖 결과
      </h2>
      {loading ? <p role="status">다른 지역의 결과를 확인하고 있어요.</p> : null}
      {failed ? (
        <div role="alert">
          <p>지도 밖 결과를 확인하지 못했어요.</p>
          <ActionButton onClick={onRetry} variant="secondary">
            지도 밖 결과 다시 확인
          </ActionButton>
        </div>
      ) : null}
      {!loading && !failed ? (
        <ul aria-label="지도 밖 결과 지역">
          {regions.map((region) => (
            <li key={region.id}>
              <button onClick={() => onSelect(region)} type="button">
                <span>{region.label}</span>
                <strong>{region.count}곳</strong>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
