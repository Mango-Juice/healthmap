import { useEffect, useState } from "react"
import styles from "./pilot-empty-toast.module.css"

export function PilotEmptyToast({ hint }: { readonly hint: string }) {
  return <PilotToast message={`찾은 곳이 없어요. ${hint}`} testId="pilot-empty-toast" />
}

export function PilotToast({
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
