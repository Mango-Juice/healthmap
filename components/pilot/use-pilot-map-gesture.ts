import { type KeyboardEvent, type PointerEvent, useRef } from "react"

type Actions = {
  readonly interact: () => void
  readonly move: () => void
}
export function usePilotMapGesture({ interact, move }: Actions) {
  const start = useRef<{ readonly x: number; readonly y: number }>(undefined)
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("button, a")) return
    interact()
    start.current = { x: event.clientX, y: event.clientY }
  }
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (
      !start.current ||
      Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) < 8
    )
      return
    move()
  }
  const onPointerUpCapture = () => {
    start.current = undefined
  }
  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>) => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(event.key))
      move()
  }
  return {
    onPointerDownCapture,
    onPointerMoveCapture,
    onPointerUpCapture,
    onPointerCancelCapture: onPointerUpCapture,
    onKeyDownCapture,
    onWheelCapture: move,
    onDoubleClickCapture: move,
  }
}
