import type { MapAdapterState } from "../../lib/map/adapter"
import { AlertTriangleIcon, LoaderIcon, LocateIcon, RotateCcwIcon } from "../ui/health-map-icons"
import { ActionButton } from "../ui/health-map-primitives"
import styles from "./food-map-discovery.module.css"

type Properties = {
  readonly state: MapAdapterState
  readonly onRetry: () => void
  readonly locating: boolean
  readonly onLocate: () => void
}
export function FoodMapControls(props: Properties) {
  return (
    <>
      <button
        className={`${styles["locateControl"]} ${styles["compactAction"]}`}
        aria-label={props.locating ? "내 위치 확인 중" : "내 위치"}
        aria-busy={props.locating}
        disabled={props.locating}
        onClick={props.onLocate}
        type="button"
      >
        <LocateIcon />
        <span>내 위치</span>
      </button>
      {props.state === "loading" ? (
        <div className={styles["mapState"]} role="status">
          <LoaderIcon />
          <strong>지도를 불러오고 있어요.</strong>
        </div>
      ) : props.state === "error" ? (
        <div className={styles["mapState"]} data-tone="error" role="alert">
          <AlertTriangleIcon />
          <strong>지도를 불러오지 못했어요.</strong>
          <ActionButton leadingIcon={<RotateCcwIcon />} onClick={props.onRetry} variant="secondary">
            다시 시도
          </ActionButton>
        </div>
      ) : null}
    </>
  )
}
