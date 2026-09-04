import type { Metadata } from "next"
import Link from "next/link"
import { SuggestionForm } from "../../components/suggestions/suggestion-form"
import styles from "../../components/suggestions/suggestion-form.module.css"
import { ArrowLeftIcon } from "../../components/ui/health-map-icons"
import { PlaceIdSchema } from "../../lib/domain/contracts"
import { menusForPilotPlace } from "../../lib/pilot/discovery"
import { buildPilotPlaceInfoUrl } from "../../lib/pilot/place-links"
import { readPilotCatalog } from "../../lib/pilot/server"
import { SuggestionUrlSchema } from "../../lib/suggestions/contracts"

export const metadata: Metadata = {
  title: "장소·메뉴 제안 | 건강식 지도",
  robots: { index: false, follow: false },
}

// biome-ignore lint/style/noDefaultExport: Next.js page entry point.
export default async function SuggestPage({
  searchParams,
}: {
  readonly searchParams: Promise<Readonly<Record<string, string | string[] | undefined>>>
}) {
  const query = await searchParams
  const id = PlaceIdSchema.safeParse(query["placeId"])
  const catalog = id.success ? readPilotCatalog() : null
  const selected =
    catalog && id.success && menusForPilotPlace(catalog, id.data).length > 0
      ? catalog.places.find((place) => place.id === id.data)
      : undefined
  const legacyUrl = SuggestionUrlSchema.safeParse(query["place"])
  const placeUrl = selected
    ? buildPilotPlaceInfoUrl(selected)
    : legacyUrl.success
      ? legacyUrl.data
      : ""
  const local = process.env["NODE_ENV"] === "development" && !process.env["VERCEL"]
  const configured =
    (process.env["HEALTHMAP_SUGGESTION_HASH_SECRET"]?.length ?? 0) >= 32 &&
    Boolean(process.env["HEALTHMAP_SUGGESTION_SERVICE_KEY"]) &&
    URL.parse(process.env["NEXT_PUBLIC_SUPABASE_URL"] ?? "")?.protocol === "https:"
  const accepting = local || configured
  return (
    <main className={styles["page"]}>
      <div className={styles["container"]}>
        <nav aria-label="제안 페이지" className={styles["topbar"]}>
          <Link href="/">
            <ArrowLeftIcon />
            <span>지도로 돌아가기</span>
          </Link>
          <span>건강식 지도</span>
        </nav>
        <div className={styles["layout"]}>
          <header className={styles["intro"]}>
            <h1>{placeUrl ? "바뀐 메뉴 알려주기" : "지도에 제안하기"}</h1>
            <p>새로 발견한 장소나 달라진 메뉴를 알려주세요.</p>
            <div className={styles["reviewNote"]}>
              <p>보내주신 내용은 확인을 거쳐 반영해요.</p>
              <p>회원가입이나 연락처는 필요하지 않아요.</p>
            </div>
            {!accepting ? (
              <div className={styles["availability"]} role="status">
                <strong>제안 접수 준비 중</strong>
                <p>아직 내용을 전송할 수 없어요. 접수가 열리면 이곳에서 알려주실 수 있어요.</p>
              </div>
            ) : null}
          </header>
          <SuggestionForm
            placeUrl={placeUrl}
            context={selected ? { name: selected.name, address: selected.address } : undefined}
            accepting={accepting}
          />
        </div>
      </div>
    </main>
  )
}
