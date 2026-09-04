import { RotateCcwIcon } from "../ui/health-map-icons"
import { PilotEmptyToast } from "./pilot-empty-toast"
import styles from "./pilot-map-dock.module.css"

type Properties = {
  readonly emptyHint: string | undefined
  readonly pending: boolean
  readonly onArea: () => void
}

export function PilotMapDock({ emptyHint, pending, onArea }: Properties) {
  if (emptyHint === undefined && !pending) return null
  return (
    <div className={styles["dock"]} data-testid="pilot-map-dock">
      {emptyHint !== undefined ? (
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
