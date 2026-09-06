import type { Metadata } from "next"
import { FoodMap } from "../components/food-map/food-map-discovery"
import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../lib/share-links"

export const dynamic = "force-dynamic"
const canonical = buildAbsoluteSiteUrl("", getRuntimeSiteEnvironment())
export const metadata: Metadata = {
  description: "전국에서 먹고 싶은 한 끼를 메뉴와 재료로 찾아보세요.",
  robots: { follow: false, index: false },
  ...(canonical === null ? {} : { alternates: { canonical } }),
}

export default function HomePage() {
  return (
    <main>
      <FoodMap clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]} />
    </main>
  )
}
