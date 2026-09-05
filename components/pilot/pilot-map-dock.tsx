import { RotateCcwIcon } from "../ui/health-map-icons"
import { PilotEmptyToast, PilotToast } from "./pilot-empty-toast"
import styles from "./pilot-map-dock.module.css"

type Properties = {
  readonly emptyHint: string | undefined
  readonly locationFailure: number | undefined
  readonly onLocationFailureExpire: () => void
  readonly pending: boolean
  readonly onArea: () => void
}

export function PilotMapDock({
  emptyHint,
  locationFailure,
  onLocationFailureExpire,
  pending,
  onArea,
}: Properties) {
  if (emptyHint === undefined && locationFailure === undefined && !pending) return null
  return (
    <div className={styles["dock"]} data-testid="pilot-map-dock">
      {locationFailure !== undefined ? (
        <div className={styles["toastSlot"]}>
          <PilotToast
            key={locationFailure}
            message="위치를 확인하지 못했어요."
            onExpire={onLocationFailureExpire}
            testId="pilot-location-toast"
          />
        </div>
      ) : emptyHint !== undefined ? (
        <div className={styles["toastSlot"]}>
          <PilotEmptyToast hint={emptyHint} />
        </div>
      ) : null}
      {pending ? (
        <button className={styles["areaSearch"]} onClick={onArea} type="button">
          <RotateCcwIcon />
          <span>이 지역 재검색</span>
        </button>
      ) : null}
    </div>
  )
}
