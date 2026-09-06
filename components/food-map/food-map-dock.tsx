import { RotateCcwIcon } from "../ui/health-map-icons"
import styles from "./food-map-dock.module.css"
import { FoodMapEmptyToast, FoodMapToast } from "./food-map-empty-toast"

type Properties = {
  readonly emptyHint: string | undefined
  readonly locationFailure: number | undefined
  readonly onLocationFailureExpire: () => void
  readonly pending: boolean
  readonly onArea: () => void
  readonly outsideCount?: number | undefined
  readonly onOutside?: (() => void) | undefined
}

export function FoodMapDock({
  emptyHint,
  locationFailure,
  onLocationFailureExpire,
  pending,
  onArea,
  outsideCount,
  onOutside,
}: Properties) {
  if (
    emptyHint === undefined &&
    locationFailure === undefined &&
    !pending &&
    outsideCount === undefined
  )
    return null
  return (
    <div className={styles["dock"]} data-testid="food-map-dock">
      {locationFailure !== undefined ? (
        <div className={styles["toastSlot"]}>
          <FoodMapToast
            key={locationFailure}
            message="위치를 확인하지 못했어요."
            onExpire={onLocationFailureExpire}
            testId="food-map-location-toast"
          />
        </div>
      ) : emptyHint !== undefined ? (
        <div className={styles["toastSlot"]}>
          <FoodMapEmptyToast hint={emptyHint} />
        </div>
      ) : null}
      {pending ? (
        <button className={styles["areaSearch"]} onClick={onArea} type="button">
          <RotateCcwIcon />
          <span>이 지역 재검색</span>
        </button>
      ) : null}
      {outsideCount !== undefined && onOutside !== undefined ? (
        <button className={styles["outsideResults"]} onClick={onOutside} type="button">
          현재 지도 밖 {outsideCount}곳 보기
        </button>
      ) : null}
    </div>
  )
}
