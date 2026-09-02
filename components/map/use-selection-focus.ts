"use client"

import { useCallback, useEffect, useRef } from "react"
import type { DetailPhase } from "./detail-history"

type ReturnTarget = {
  readonly element: HTMLElement | null
  readonly slug: string
}

export function useSelectionFocus(phase: DetailPhase, selectedSlug: string | undefined) {
  const trigger = useRef<HTMLElement | null>(null)
  const pending = useRef<ReturnTarget | undefined>(undefined)

  useEffect(() => {
    if (phase !== "closed" || selectedSlug !== undefined || pending.current === undefined) return
    const { element, slug } = pending.current
    pending.current = undefined
    const markerLabel = element?.matches("[data-test-naver-marker='true']")
      ? element.getAttribute("aria-label")
      : null
    const restored = element?.isConnected
      ? element
      : markerLabel === null
        ? document.querySelector<HTMLElement>(`[data-place-slug="${CSS.escape(slug)}"]`)
        : document.querySelector<HTMLElement>(
            `[data-test-naver-marker="true"][aria-label="${CSS.escape(markerLabel)}"]`,
          )
    ;(restored ?? document.querySelector<HTMLElement>("[role='searchbox']"))?.focus({
      preventScroll: true,
    })
  }, [phase, selectedSlug])

  const capture = useCallback((element?: HTMLElement): void => {
    const activeElement = document.activeElement
    trigger.current = element ?? (activeElement instanceof HTMLElement ? activeElement : null)
  }, [])
  const restore = useCallback((slug: string | undefined): void => {
    if (slug !== undefined) pending.current = { element: trigger.current, slug }
    trigger.current = null
  }, [])

  return { capture, restore }
}
