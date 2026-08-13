import type { Metadata } from "next"
import styles from "./showcase.module.css"
import { ShowcaseClient } from "./showcase-client"

export const metadata: Metadata = {
  title: "프리미티브 쇼케이스 | 건강식 지도",
  description: "건강식 지도의 재사용 가능한 인터페이스 상태",
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires a default page export.
export default function ShowcasePage() {
  return (
    <main className={styles["showcase"]}>
      <header className={styles["pageHeader"]}>
        <span className={styles["eyebrow"]}>DESIGN SYSTEM / TODO 2</span>
        <h1>프리미티브 쇼케이스</h1>
        <p>
          지도 위에서 쓰일 필터, 마커, 버튼, 상태 피드백과 반응형 상세 표면을 실제 상호작용으로
          검증합니다.
        </p>
      </header>
      <ShowcaseClient />
    </main>
  )
}
