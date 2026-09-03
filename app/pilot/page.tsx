import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PilotDiscovery } from "../../components/pilot/pilot-discovery"
import { PilotCatalogSchema } from "../../lib/pilot/catalog"
import { isPilotEnabled } from "../../lib/pilot/environment"
import pilotCatalogJson from "../../lib/pilot/pilot-catalog.json"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  description: "강남·역삼의 잡곡밥과 비건·채식 메뉴를 지도로 찾아보세요.",
  robots: { follow: false, index: false },
  title: "건강식 지도",
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires a default page export.
export default function PilotPage() {
  if (!isPilotEnabled(process.env)) notFound()
  const catalog = PilotCatalogSchema.parse(pilotCatalogJson)

  return (
    <main>
      <PilotDiscovery catalog={catalog} clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]} />
    </main>
  )
}
