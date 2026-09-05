import styles from "../../components/suggestions/suggestion-form.module.css"

// biome-ignore lint/style/noDefaultExport: Next.js loading entry point.
export default function SuggestLoading() {
  return (
    <main className={styles["page"]}>
      <div className={styles["container"]}>
        <div className={styles["routeLoading"]} role="status" aria-live="polite">
          <span className={styles["routeLoadingMark"]} aria-hidden="true" />
          <span>제안 페이지 여는 중</span>
        </div>
      </div>
    </main>
  )
}
