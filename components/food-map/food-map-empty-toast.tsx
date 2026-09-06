import { useEffect, useState } from "react"
import styles from "./food-map-empty-toast.module.css"

export function FoodMapEmptyToast({ hint }: { readonly hint: string }) {
  return <FoodMapToast message={`찾은 곳이 없어요. ${hint}`} testId="food-map-empty-toast" />
}

export function FoodMapToast({
  message,
  onExpire,
  testId,
}: {
  readonly message: string
  readonly onExpire?: (() => void) | undefined
  readonly testId: string
}) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), 350)
    const hide = window.setTimeout(() => {
      setVisible(false)
      onExpire?.()
    }, 3_350)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [onExpire])
  if (!visible) return null
  return (
    <div className={styles["toast"]} data-testid={testId}>
      <p role="status">{message}</p>
    </div>
  )
}
