import type { ReactNode } from "react"
import styles from "./application-masthead.module.css"
import { LeafIcon } from "./health-map-icons"

type Properties = {
  readonly action?: ReactNode
  readonly context: string
  readonly description: string
  readonly meta?: string | undefined
  readonly title: string
}

export function ApplicationMasthead({ action, context, description, meta, title }: Properties) {
  return (
    <header className={styles["masthead"]}>
      <div className={styles["identity"]}>
        <span aria-hidden="true" className={styles["mark"]}>
          <LeafIcon />
        </span>
        <div className={styles["copy"]}>
          <span>{context}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles["utilities"]}>
        {meta ? <span className={styles["meta"]}>{meta}</span> : null}
        {action}
      </div>
    </header>
  )
}
