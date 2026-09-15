"use client"

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react"

const compactSheetQuery = "(max-width: 899px)"
const dragIntentThreshold = 8
const velocityThreshold = 0.35

type SheetDrag = {
  readonly element: HTMLButtonElement
  readonly pointerId: number
  readonly startOffset: number
  readonly startX: number
  readonly startY: number
  dragging: boolean
  lastTime: number
  lastY: number
}

type SheetSnap = {
  readonly collapsedOffset: number
  readonly offset: number
  readonly velocity: number
}

type SheetMotionProperties = {
  readonly expanded: boolean
  readonly onExpandedChange: (expanded: boolean) => void
  readonly selectedId: string | undefined
}

const clampSheetOffset = (offset: number, collapsedOffset: number): number =>
  Math.min(collapsedOffset, Math.max(0, offset))

export const chooseFoodMapSheetExpanded = ({
  collapsedOffset,
  offset,
  velocity,
}: SheetSnap): boolean => {
  if (velocity <= -velocityThreshold) return true
  if (velocity >= velocityThreshold) return false
  return offset < collapsedOffset / 2
}

export function useFoodMapSheetMotion({
  expanded,
  onExpandedChange,
  selectedId,
}: SheetMotionProperties) {
  const stackRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const activeDrag = useRef<SheetDrag | undefined>(undefined)
  const committedOffset = useRef(0)
  const measuredGeometry = useRef<readonly number[] | undefined>(undefined)
  const suppressPointerClick = useRef(false)

  const measure = useCallback((): boolean => {
    const stack = stackRef.current
    const panel = panelRef.current
    const content = panel?.lastElementChild
    const body = content?.firstElementChild
    if (!stack || !panel || !content || !body) return false

    const style = getComputedStyle(panel)
    const panelBounds = panel.getBoundingClientRect()
    const contentBounds = content.getBoundingClientRect()
    const bodyBounds = body.getBoundingClientRect()
    const height = panelBounds.height
    const bar = panel.firstElementChild?.getBoundingClientRect().height ?? 0
    const border =
      Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
    const preview =
      selectedId !== undefined
        ? bar + Math.min(content.clientHeight, bodyBounds.height) + border
        : Number.parseFloat(style.getPropertyValue("--hm-food-map-sheet-peek"))
    const collapsedOffset = Math.max(0, height - preview)
    const geometry = [
      panelBounds.width,
      height,
      contentBounds.width,
      contentBounds.height,
      bodyBounds.width,
      bodyBounds.height,
      collapsedOffset,
    ]
    const changed =
      measuredGeometry.current !== undefined &&
      geometry.some((value, index) => value !== measuredGeometry.current?.[index])
    measuredGeometry.current = geometry
    committedOffset.current = collapsedOffset
    if (activeDrag.current === undefined) {
      stack.style.setProperty("--hm-food-map-sheet-offset", `${expanded ? 0 : collapsedOffset}px`)
    }
    return changed
  }, [expanded, selectedId])

  const restoreCommittedStop = useCallback((): void => {
    const drag = activeDrag.current
    if (drag?.element.hasPointerCapture(drag.pointerId)) {
      drag.element.releasePointerCapture(drag.pointerId)
    }
    activeDrag.current = undefined
    stackRef.current?.removeAttribute("data-dragging")
    measure()
  }, [measure])

  useLayoutEffect(() => {
    restoreCommittedStop()
    const panel = panelRef.current
    const content = panel?.lastElementChild
    const body = content?.firstElementChild
    if (!panel || !content || !body) return

    const observer = new ResizeObserver(() => {
      // The initial notification can arrive after pointerdown without a resize.
      // Cancel only if dimensions changed since the gesture's last measurement.
      const resized = measure()
      if (resized && activeDrag.current !== undefined) restoreCommittedStop()
    })
    observer.observe(panel)
    observer.observe(content)
    observer.observe(body)
    return () => observer.disconnect()
  }, [measure, restoreCommittedStop])

  useEffect(() => {
    const media = window.matchMedia(compactSheetQuery)
    const onResize = (): void => restoreCommittedStop()
    window.addEventListener("resize", onResize)
    media.addEventListener("change", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      media.removeEventListener("change", onResize)
    }
  }, [restoreCommittedStop])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (activeDrag.current !== undefined) {
        restoreCommittedStop()
        return
      }
      if (!window.matchMedia(compactSheetQuery).matches || !event.isPrimary || event.button !== 0)
        return
      suppressPointerClick.current = false
      measure()
      activeDrag.current = {
        element: event.currentTarget,
        pointerId: event.pointerId,
        startOffset: expanded ? 0 : committedOffset.current,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false,
        lastTime: event.timeStamp,
        lastY: event.clientY,
      }
    },
    [expanded, measure, restoreCommittedStop],
  )

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>): void => {
    const drag = activeDrag.current
    if (drag === undefined || drag.pointerId !== event.pointerId) return
    const distanceX = event.clientX - drag.startX
    const distanceY = event.clientY - drag.startY
    if (!drag.dragging) {
      if (Math.abs(distanceY) < dragIntentThreshold || Math.abs(distanceY) <= Math.abs(distanceX))
        return
      drag.element.setPointerCapture(event.pointerId)
      drag.dragging = true
      stackRef.current?.setAttribute("data-dragging", "true")
    }
    event.preventDefault()
    const offset = clampSheetOffset(drag.startOffset + distanceY, committedOffset.current)
    stackRef.current?.style.setProperty("--hm-food-map-sheet-offset", `${offset}px`)
    drag.lastTime = event.timeStamp
    drag.lastY = event.clientY
  }, [])

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      const drag = activeDrag.current
      if (drag === undefined || drag.pointerId !== event.pointerId) return
      activeDrag.current = undefined
      if (!drag.dragging) return

      event.preventDefault()
      if (drag.element.hasPointerCapture(event.pointerId)) {
        drag.element.releasePointerCapture(event.pointerId)
      }
      const elapsed = event.timeStamp - drag.lastTime
      const velocity = elapsed > 0 ? (event.clientY - drag.lastY) / elapsed : 0
      const offset = clampSheetOffset(
        drag.startOffset + event.clientY - drag.startY,
        committedOffset.current,
      )
      const nextExpanded = chooseFoodMapSheetExpanded({
        collapsedOffset: committedOffset.current,
        offset,
        velocity,
      })
      stackRef.current?.removeAttribute("data-dragging")
      stackRef.current?.style.setProperty(
        "--hm-food-map-sheet-offset",
        `${nextExpanded ? 0 : committedOffset.current}px`,
      )
      suppressPointerClick.current = true
      onExpandedChange(nextExpanded)
    },
    [onExpandedChange],
  )

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (activeDrag.current?.pointerId === event.pointerId) restoreCommittedStop()
    },
    [restoreCommittedStop],
  )

  const onLostPointerCapture = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>): void => {
      if (activeDrag.current?.pointerId === event.pointerId) restoreCommittedStop()
    },
    [restoreCommittedStop],
  )

  const onClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>): void => {
      if (suppressPointerClick.current && event.detail !== 0) {
        event.preventDefault()
        event.stopPropagation()
        suppressPointerClick.current = false
        return
      }
      onExpandedChange(!expanded)
    },
    [expanded, onExpandedChange],
  )

  return {
    panelRef,
    stackRef,
    toggleProps: {
      onClick,
      onLostPointerCapture,
      onPointerCancel,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    },
  }
}
