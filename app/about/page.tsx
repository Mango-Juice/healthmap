import type { Metadata } from "next"
import Link from "next/link"

import { LeafIcon } from "../../components/ui/health-map-icons"
import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../../lib/share-links"
import styles from "./about.module.css"

const canonical = buildAbsoluteSiteUrl("about", getRuntimeSiteEnvironment())
const description = "건강식 지도에 장소와 메뉴가 표시되는 기준과 근거 확인 방식을 안내합니다."

export const metadata: Metadata = {
  title: "건강식 선정 기준 | 건강식 지도",
  description,
  ...(canonical === null
    ? { robots: { follow: false, index: false } }
    : { alternates: { canonical } }),
}

const CRITERIA = [
  {
    description:
      "지도에는 제공처와 검토 시점에 확인한 장소와 메뉴 정보를 표시합니다. 메뉴 제공 여부와 지점 정보는 바뀔 수 있어 방문 전 업장 안내를 함께 확인해야 합니다.",
    number: "01",
    title: "무엇을 표시하나요",
  },
  {
    description:
      "공개 자료와 업장 안내, 직접 제출된 제안을 검토 자료로 사용합니다. 자료의 최신성, 범위, 확인 상태는 서로 다를 수 있으며 제안은 자동으로 반영되지 않습니다.",
    number: "02",
    title: "어떻게 확인하나요",
  },
  {
    description:
      "채소·단백질·균형식·식물성은 탐색을 돕는 메뉴 분류입니다. 의료 조언이나 영양 점수가 아닙니다. 알레르기와 개인 식단 적합성은 방문 전 업장에 확인해야 합니다.",
    number: "03",
    title: "어떻게 읽어야 하나요",
  },
] as const

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires a default page export.
export default function AboutPage() {
  return (
    <main className={styles["page"]}>
      <article className={styles["content"]}>
        <nav aria-label="선정 기준 페이지 이동" className={styles["navigation"]}>
          <Link href="/">지도로 돌아가기</Link>
        </nav>
        <header className={styles["intro"]}>
          <span aria-hidden="true" className={styles["mark"]}>
            <LeafIcon />
          </span>
          <p>건강식 지도 · 선정 기준</p>
          <h1>건강식 선정 기준</h1>
          <p>
            많이 모으는 것보다 다시 확인할 수 있는 정보를 우선합니다. 지도에 표시되는 장소와 메뉴의
            최소 기준을 공개합니다.
          </p>
        </header>
        <div className={styles["criteria"]}>
          {CRITERIA.map((criterion) => (
            <section aria-labelledby={`criterion-${criterion.number}`} key={criterion.number}>
              <span>{criterion.number}</span>
              <div>
                <h2 id={`criterion-${criterion.number}`}>{criterion.title}</h2>
                <p>{criterion.description}</p>
              </div>
            </section>
          ))}
        </div>
        <aside className={styles["scope"]}>
          <strong>정보의 현재성</strong>
          <p>
            가격, 영업시간, 메뉴 제공 여부는 바뀔 수 있습니다. 지도 정보는 의료 조언이나 완전한 업장
            목록이 아니므로, 방문 전 공식 안내와 업장 정보를 함께 확인해 주세요.
          </p>
        </aside>
        <Link className={styles["primaryAction"]} href="/">
          건강식 지도 살펴보기
        </Link>
      </article>
    </main>
  )
}
