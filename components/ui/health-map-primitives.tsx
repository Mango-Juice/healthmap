import type { ButtonHTMLAttributes, ReactNode } from "react"

import {
  AlertTriangleIcon,
  LeafIcon,
  LoaderIcon,
  MapPinIcon,
  RotateCcwIcon,
} from "./health-map-icons"
import { CATEGORY_LABELS, FILTER_OPTIONS, type FilterValue } from "./health-map-options"
import styles from "./health-map-primitives.module.css"

type FilterRailProperties = {
  readonly disabled?: boolean
  readonly onSelect?: (value: FilterValue) => void
  readonly selected: FilterValue
}

export function FilterRail({ disabled = false, onSelect, selected }: FilterRailProperties) {
  return (
    <fieldset className={styles["filterRail"]}>
      <legend className={styles["visuallyHidden"]}>건강식 유형</legend>
      {FILTER_OPTIONS.map((option) => (
        <button
          aria-label={`${option.label} 필터`}
          aria-pressed={selected === option.value}
          className={styles["filterButton"]}
          disabled={disabled}
          key={option.value}
          onClick={onSelect ? () => onSelect(option.value) : undefined}
          type="button"
        >
          {option.value === "all" ? null : <LeafIcon className={styles["inlineIcon"]} />}
          <span>{option.label}</span>
        </button>
      ))}
    </fieldset>
  )
}

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

type MarkerCategory = Exclude<FilterValue, "all">

type MapMarkerProperties = {
  readonly category: MarkerCategory
  readonly disabled?: boolean
  readonly label: string
  readonly onSelect?: () => void
  readonly selected?: boolean
}

export function MapMarker({
  category,
  disabled = false,
  label,
  onSelect,
  selected = false,
}: MapMarkerProperties) {
  return (
    <button
      aria-label={`${label}, ${CATEGORY_LABELS[category]}`}
      aria-pressed={selected}
      className={styles["markerTarget"]}
      data-category={category}
      disabled={disabled}
      onClick={onSelect}
      type="button"
    >
      <span className={styles["markerVisual"]}>
        <MapPinIcon className={styles["markerPin"]} />
        <LeafIcon className={styles["markerLeaf"]} />
        <span aria-hidden="true" className={styles["markerNotch"]} />
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
      className={[styles["alert"], styles[tone]].join(" ")}
      role={tone === "error" ? "alert" : "status"}
    >
      {tone === "error" ? (
        <AlertTriangleIcon className={styles["alertIcon"]} />
      ) : (
        <MapPinIcon className={styles["alertIcon"]} />
      )}
      <div className={styles["alertCopy"]}>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {action}
    </div>
  )
}

export function SkeletonDetail() {
  return (
    <div aria-label="장소 정보를 불러오는 중" className={styles["skeleton"]} role="status">
      <span aria-hidden="true" className={styles["skeletonIcon"]} />
      <div aria-hidden="true" className={styles["skeletonLines"]}>
        <span className={styles["skeletonLine"]} data-testid="skeleton-line" />
        <span className={styles["skeletonLineShort"]} />
        <span className={styles["skeletonAction"]} />
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
    <div className={styles["emptyState"]}>
      <span aria-hidden="true" className={styles["emptyGlyph"]}>
        <LeafIcon />
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
