"use client"

import { useLayoutEffect, useRef } from "react"

export function usePilotSheetMotion(expanded: boolean, selectedId: string | undefined) {
  const stackRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const stack = stackRef.current
    const panel = panelRef.current
    const content = panel?.lastElementChild
    const body = content?.firstElementChild
    if (!stack || !panel || !content || !body) return

    const measure = () => {
      const style = getComputedStyle(panel)
      const height = panel.getBoundingClientRect().height
      const bar = panel.firstElementChild?.getBoundingClientRect().height ?? 0
      const border =
        Number.parseFloat(style.borderTopWidth) + Number.parseFloat(style.borderBottomWidth)
      const preview =
        selectedId !== undefined
          ? bar + Math.min(content.clientHeight, body.getBoundingClientRect().height) + border
          : Number.parseFloat(style.getPropertyValue("--hm-pilot-sheet-peek"))
      const offset = expanded ? 0 : Math.max(0, height - preview)
      stack.style.setProperty("--hm-pilot-sheet-offset", `${offset}px`)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(panel)
    observer.observe(content)
    observer.observe(body)
    return () => observer.disconnect()
  }, [expanded, selectedId])

  return { stackRef, panelRef }
}
