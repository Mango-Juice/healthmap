import styles from "./food-map-discovery.module.css"

type Properties = {
  readonly label: string
}

export function FoodMapLoadingStatus({ label }: Properties) {
  return (
    <span className={styles["loadingStatus"]} role="status">
      <span
        aria-hidden="true"
        className={styles["loadingSpinner"]}
        data-testid="discovery-loading-indicator"
      />
      <span>{label}</span>
    </span>
  )
}
