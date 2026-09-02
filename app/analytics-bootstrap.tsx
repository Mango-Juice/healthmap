"use client"

import { useEffect } from "react"

import { initializeProductAnalytics } from "../lib/analytics/browser"

type AnalyticsBootstrapProperties = {
  readonly host: string | undefined
  readonly publicKey: string | undefined
  readonly playwrightTest: string | undefined
  readonly testAllowHttpLoopback: string | undefined
}

export function AnalyticsBootstrap({
  host,
  publicKey,
  playwrightTest,
  testAllowHttpLoopback,
}: AnalyticsBootstrapProperties) {
  useEffect(
    () =>
      initializeProductAnalytics({
        host,
        key: publicKey,
        playwrightTest,
        testAllowHttpLoopback,
      }),
    [host, publicKey, playwrightTest, testAllowHttpLoopback],
  )
  return null
}
