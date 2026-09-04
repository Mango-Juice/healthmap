import { useEffect, useState } from "react"
import styles from "./pilot-empty-toast.module.css"

export function PilotEmptyToast({ hint }: { readonly hint: string }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const show = window.setTimeout(() => setVisible(true), 350)
    const hide = window.setTimeout(() => setVisible(false), 3_350)
    return () => {
      window.clearTimeout(show)
      window.clearTimeout(hide)
    }
  }, [])
  if (!visible) return null
  return (
    <div className={styles["toast"]} data-testid="pilot-empty-toast">
      <p role="status">찾은 곳이 없어요. {hint}</p>
    </div>
  )
}
