"use client"

import { useEffect } from "react"

import { initializeProductAnalytics } from "../../lib/analytics/browser"

export function AnalyticsProvider() {
  useEffect(() => {
    initializeProductAnalytics({
      host: process.env["NEXT_PUBLIC_POSTHOG_HOST"],
      key: process.env["NEXT_PUBLIC_POSTHOG_KEY"],
      playwrightTest: process.env["NEXT_PUBLIC_PLAYWRIGHT_TEST"],
      testAllowHttpLoopback: process.env["NEXT_PUBLIC_TEST_ALLOW_HTTP_LOOPBACK"],
    })
  }, [])

  return null
}
