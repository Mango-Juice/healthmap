"use client"

import type { ComponentProps } from "react"

import { ChevronDownIcon, XIcon } from "../ui/health-map-icons"
import styles from "./pilot-drawer-handle.module.css"

type Properties = {
  readonly count: number
  readonly loading: boolean
  readonly expanded: boolean
  readonly toggleProps: Pick<
    ComponentProps<"button">,
    | "onClick"
    | "onLostPointerCapture"
    | "onPointerCancel"
    | "onPointerDown"
    | "onPointerMove"
    | "onPointerUp"
  >
  readonly onClose: () => void
  readonly selectedName?: string | undefined
  readonly selectedStoreOnly?: boolean | undefined
}
export function PilotDrawerHandle({
  count,
  loading,
  expanded,
  toggleProps,
  onClose,
  selectedName,
  selectedStoreOnly,
}: Properties) {
  const selectedLabel = selectedStoreOnly ? "매장 정보" : "메뉴"
  const label = `${selectedName ? selectedLabel : "검색 결과"} ${expanded ? "접기" : "펼치기"}`
  return (
    <div
      className={styles["bar"]}
      data-expanded={expanded}
      data-selected={Boolean(selectedName)}
      data-testid="pilot-drawer-handle"
    >
      <button
        {...toggleProps}
        className={styles["toggle"]}
        aria-controls="pilot-panel-content"
        aria-expanded={expanded}
        aria-busy={loading}
        aria-label={label}
        title={label}
        type="button"
      >
        {selectedName ? (
          <span className={styles["hint"]}>
            {expanded ? "접기" : selectedStoreOnly ? "정보 펼치기" : "메뉴 펼치기"}
          </span>
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
