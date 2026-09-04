import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PilotDiscovery } from "../../components/pilot/pilot-discovery"
import { isPilotEnabled } from "../../lib/pilot/environment"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  description: "전국에서 먹고 싶은 한 끼를 메뉴와 재료로 찾아보세요.",
  robots: { follow: false, index: false },
  title: "건강식 지도",
}

// biome-ignore lint/style/noDefaultExport: Next.js App Router requires a default page export.
export default function PilotPage() {
  if (!isPilotEnabled(process.env)) notFound()

  return (
    <main>
      <PilotDiscovery clientId={process.env["NEXT_PUBLIC_NAVER_MAP_CLIENT_ID"]} />
    </main>
  )
}
