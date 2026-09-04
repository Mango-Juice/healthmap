"use client"

import { ChevronDownIcon, XIcon } from "../ui/health-map-icons"
import styles from "./pilot-drawer-handle.module.css"

type Properties = {
  readonly count: number
  readonly loading: boolean
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
  readonly onClose: () => void
  readonly selectedName?: string | undefined
}
export function PilotDrawerHandle({
  count,
  loading,
  expanded,
  onExpandedChange,
  onClose,
  selectedName,
}: Properties) {
  const label = `${selectedName ? "메뉴" : "검색 결과"} ${expanded ? "접기" : "펼치기"}`
  return (
    <div
      className={styles["bar"]}
      data-expanded={expanded}
      data-selected={Boolean(selectedName)}
      data-testid="pilot-drawer-handle"
    >
      <button
        className={styles["toggle"]}
        aria-controls="pilot-panel-content"
        aria-expanded={expanded}
        aria-busy={loading}
        aria-label={label}
        title={label}
        onClick={() => onExpandedChange(!expanded)}
        type="button"
      >
        {selectedName ? (
          <span className={styles["hint"]}>{expanded ? "접기" : "메뉴 펼치기"}</span>
        ) : (
          <span className={styles["count"]}>
            <b>
              {loading ? (
                <span role="status" aria-label="검색 중">
                  …
                </span>
              ) : (
                `${count}곳`
              )}
            </b>
          </span>
        )}
        <ChevronDownIcon />
      </button>
      {selectedName ? (
        <button
          className={styles["close"]}
          aria-label="장소 닫기"
          title="장소 닫기"
          onClick={onClose}
          type="button"
        >
          <XIcon />
        </button>
      ) : null}
    </div>
  )
}
