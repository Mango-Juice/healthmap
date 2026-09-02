import Link from "next/link"

import { LeafIcon } from "../components/ui/health-map-icons"
import styles from "./not-found.module.css"

// biome-ignore lint/style/noDefaultExport: Next.js not-found convention requires a default export.
export default function NotFound() {
  return (
    <main className={styles["page"]}>
      <section aria-labelledby="not-found-heading" className={styles["content"]}>
        <div aria-hidden="true" className={styles["mark"]}>
          <LeafIcon className={styles["icon"]} />
        </div>
        <p className={styles["kicker"]}>404 · 건강식 지도</p>
        <h1 id="not-found-heading">장소를 찾을 수 없어요</h1>
        <p className={styles["description"]}>
          공개된 장소가 아니거나 더 이상 제공되지 않는 주소예요.
          <br />
          지도에서 현재 확인할 수 있는 건강식 장소를 <span>다시 살펴보세요.</span>
        </p>
        <Link className={styles["recovery"]} href="/">
          건강식 지도 돌아가기
        </Link>
      </section>
    </main>
  )
}
