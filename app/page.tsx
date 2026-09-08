import type { Metadata } from "next"
import { FoodMap } from "../components/food-map/food-map-discovery"
import { getIndexableSiteUrl } from "../lib/search-indexing"
import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../lib/share-links"

export const dynamic = "force-dynamic"
const canonical = buildAbsoluteSiteUrl("", getRuntimeSiteEnvironment())
const indexable = getIndexableSiteUrl(getRuntimeSiteEnvironment()) !== null
export const metadata: Metadata = {
  description: "전국에서 먹고 싶은 한 끼를 메뉴와 재료로 찾아보세요.",
  robots: { follow: indexable, index: indexable },
  verification: {
    google: "YrP6a4GSewvHaif-9CGokegbtJMysU_bsVERahsg5GY",
    other: {
      "naver-site-verification": "813b4ad69fdf623007de48959fe781048e6d3aec",
    },
  },
  ...(canonical === null ? {} : { alternates: { canonical } }),
}

export default function HomePage() {
  return (
    <main>
      <FoodMap clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]} />
    </main>
  )
}
