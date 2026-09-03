"use client"

import type { PointerEvent } from "react"
import { useRef } from "react"
import { ChevronDownIcon } from "../ui/health-map-icons"
import styles from "./pilot-discovery.module.css"

const SWIPE_THRESHOLD_PX = 36

type Properties = {
  readonly count: number
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
  readonly selectedName?: string | undefined
}

export function PilotDrawerHandle({ count, expanded, onExpandedChange, selectedName }: Properties) {
  const dragStartY = useRef<number>(undefined)
  const didSwipe = useRef(false)
  const summary = selectedName ?? "검색 결과"
  const meta = selectedName === undefined ? `${count}곳` : "장소 정보"

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    dragStartY.current = event.clientY
    didSwipe.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>): void => {
    const startY = dragStartY.current
    dragStartY.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (startY === undefined) return
    const distance = event.clientY - startY
    if (Math.abs(distance) < SWIPE_THRESHOLD_PX) return
    didSwipe.current = true
    onExpandedChange(distance < 0)
  }

  const handlePointerCancel = (event: PointerEvent<HTMLButtonElement>): void => {
    dragStartY.current = undefined
    didSwipe.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleToggle = (): void => {
    if (didSwipe.current) {
      didSwipe.current = false
      return
    }
    onExpandedChange(!expanded)
  }

  return (
    <div className={styles["drawerBar"]} data-expanded={expanded} data-testid="pilot-drawer-handle">
      <button
        aria-controls="pilot-panel-content"
        aria-expanded={expanded}
        aria-label={`${summary} ${meta} ${expanded ? "접기" : "펼치기"}`}
        onClick={handleToggle}
        onPointerCancel={handlePointerCancel}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        type="button"
      >
        <span aria-hidden="true" className={styles["drawerGrabber"]} />
        <strong>{summary}</strong>
        <span className={styles["drawerMeta"]}>{meta}</span>
        <ChevronDownIcon />
      </button>
      <output aria-label="검색 결과 수" className={styles["visuallyHidden"]}>
        {count}곳
      </output>
    </div>
  )
}
