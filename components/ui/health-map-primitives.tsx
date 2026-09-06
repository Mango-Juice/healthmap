import type { ButtonHTMLAttributes, ReactNode } from "react"
import feedbackStyles from "./health-map-feedback.module.css"
import { AlertTriangleIcon, LoaderIcon, MapPinIcon, RotateCcwIcon } from "./health-map-icons"
import styles from "./health-map-primitives.module.css"

type ActionButtonProperties = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children: ReactNode
  readonly loading?: boolean
  readonly leadingIcon?: ReactNode
  readonly variant: "primary" | "secondary" | "quiet" | "danger"
}

export function ActionButton({
  children,
  className,
  disabled = false,
  leadingIcon,
  loading = false,
  type = "button",
  variant,
  ...buttonProperties
}: ActionButtonProperties) {
  return (
    <button
      {...buttonProperties}
      aria-busy={loading || undefined}
      className={[styles["actionButton"], styles[variant], className].filter(Boolean).join(" ")}
      disabled={disabled || loading}
      type={type}
    >
      <span className={styles["buttonContent"]}>
        {loading ? <LoaderIcon className={styles["spinner"]} /> : leadingIcon}
        <span>{children}</span>
      </span>
    </button>
  )
}

type StatusAlertProperties = {
  readonly action?: ReactNode
  readonly description: ReactNode
  readonly title: string
  readonly tone: "info" | "error"
}

export function StatusAlert({ action, description, title, tone }: StatusAlertProperties) {
  return (
    <div
      className={[feedbackStyles["alert"], feedbackStyles[tone]].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertTriangleIcon className={feedbackStyles["alertIcon"]} />
      ) : (
        <MapPinIcon className={feedbackStyles["alertIcon"]} />
      )}
      <div className={feedbackStyles["alertCopy"]}>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {action}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div aria-label="장소 정보를 불러오는 중" className={feedbackStyles["skeleton"]} role="status">
      <span aria-hidden="true" className={feedbackStyles["skeletonIcon"]} />
      <div aria-hidden="true" className={feedbackStyles["skeletonLines"]}>
        <span className={feedbackStyles["skeletonLine"]} data-testid="skeleton-line" />
        <span className={feedbackStyles["skeletonLineShort"]} />
        <span className={feedbackStyles["skeletonAction"]} />
      </div>
    </div>
  )
}

type EmptyStateProperties = {
  readonly action?: ReactNode
  readonly description: string
  readonly title: string
}

export function EmptyState({ action, description, title }: EmptyStateProperties) {
  return (
    <div className={feedbackStyles["emptyState"]}>
      <span aria-hidden="true" className={feedbackStyles["emptyGlyph"]}>
        <MapPinIcon />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action ?? (
        <ActionButton leadingIcon={<RotateCcwIcon />} variant="secondary">
          다시 시도
        </ActionButton>
      )}
    </div>
  )
}
