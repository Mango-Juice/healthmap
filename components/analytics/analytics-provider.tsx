"use client"

import { useEffect } from "react"

import { initializeProductAnalytics } from "../../lib/analytics/browser"

export function AnalyticsProvider() {
  useEffect(() => {
    initializeProductAnalytics({
      host: process.env["NEXT_PUBLIC_POSTHOG_HOST"],
      key: process.env["NEXT_PUBLIC_POSTHOG_KEY"],
    })
  }, [])

  return null
}
