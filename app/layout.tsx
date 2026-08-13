import type { Metadata } from "next"
import Script from "next/script"
import type { ReactNode } from "react"

import { AnalyticsProvider } from "../components/analytics/analytics-provider"

import "./globals.css"

export const metadata: Metadata = {
  title: "건강식 지도",
  description: "강남과 역삼의 건강식 장소를 찾는 지도",
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
        <AnalyticsProvider />
        {children}
      </body>
    </html>
  )
}
