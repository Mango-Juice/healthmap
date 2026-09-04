"use client"

import { type PointerEvent, useRef } from "react"
import { ChevronDownIcon, XIcon } from "../ui/health-map-icons"
import styles from "./pilot-drawer-handle.module.css"

const SWIPE_THRESHOLD_PX = 36

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
  const dragStartY = useRef<number>(undefined)
  const didSwipe = useRef(false)
  const label = `${selectedName ? "메뉴" : "검색 결과"} ${expanded ? "접기" : "펼치기"}`
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    dragStartY.current = event.clientY
    didSwipe.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = dragStartY.current
    dragStartY.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (start === undefined || Math.abs(event.clientY - start) < SWIPE_THRESHOLD_PX) return
    didSwipe.current = true
    onExpandedChange(event.clientY < start)
  }
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
        onClick={() => {
          if (didSwipe.current) {
            didSwipe.current = false
            return
          }
          onExpandedChange(!expanded)
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragStartY.current = undefined
          didSwipe.current = false
        }}
        type="button"
      >
        <span aria-hidden="true" className={styles["grabber"]} />
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
