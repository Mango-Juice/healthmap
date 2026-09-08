import type { Metadata } from "next"
import type { ReactNode } from "react"

import { getRuntimeSiteEnvironment, getValidatedSiteUrl } from "../lib/share-links"
import { AnalyticsBootstrap } from "./analytics-bootstrap"

import "./globals.css"

const siteUrl = getValidatedSiteUrl(getRuntimeSiteEnvironment())

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "건강식 지도",
  description: "잘 먹고 싶은 날, 가까운 한 끼부터. 메뉴와 재료로 먹을 곳을 찾아보세요.",
  openGraph: {
    title: "건강식 지도",
    description: "잘 먹고 싶은 날, 가까운 한 끼부터. 메뉴와 재료로 먹을 곳을 찾아보세요.",
    siteName: "건강식 지도",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "건강식 지도",
    description: "잘 먹고 싶은 날, 가까운 한 끼부터.",
  },
  ...(siteUrl === null ? {} : { metadataBase: siteUrl }),
}

type RootLayoutProperties = {
  readonly children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html lang="ko">
      <body>
        <AnalyticsBootstrap
          host={process.env["NEXT_PUBLIC_POSTHOG_HOST"]}
          publicKey={process.env["NEXT_PUBLIC_POSTHOG_KEY"]}
          playwrightTest={process.env["NEXT_PUBLIC_PLAYWRIGHT_TEST"]}
          testAllowHttpLoopback={process.env["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"]}
        />
        {children}
      </body>
    </html>
  )
}
