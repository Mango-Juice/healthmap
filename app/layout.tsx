import type { Metadata } from "next"
import Script from "next/script"
import type { ReactNode } from "react"

import { getRuntimeSiteEnvironment, getValidatedSiteUrl } from "../lib/share-links"
import { AnalyticsBootstrap } from "./analytics-bootstrap"

import "./globals.css"

const siteUrl = getValidatedSiteUrl(getRuntimeSiteEnvironment())

export const metadata: Metadata = {
  title: "건강식 지도",
  description: "강남과 역삼의 건강식 장소를 찾는 지도",
  ...(siteUrl === null ? {} : { metadataBase: siteUrl }),
}

type RootLayoutProperties = {
  readonly children: ReactNode
}

export default function RootLayout({ children }: RootLayoutProperties) {
  const enableReactDevTools =
    process.env.NODE_ENV === "development" &&
    process.env["NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS"] !== "1"

  return (
    <html lang="ko">
      <head>
        {enableReactDevTools ? (
          <>
            <Script
              crossOrigin="anonymous"
              src="https://unpkg.com/react-grab@0.1.50/dist/index.global.js"
              strategy="beforeInteractive"
            />
            <Script
              crossOrigin="anonymous"
              src="https://unpkg.com/react-scan@0.5.7/dist/auto.global.js"
              strategy="beforeInteractive"
            />
          </>
        ) : null}
      </head>
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
