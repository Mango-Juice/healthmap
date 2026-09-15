"use client"

import { useEffect, useState } from "react"
import { getProductAnalyticsConsent, setProductAnalyticsOptOut } from "../../lib/analytics/browser"

export function useAnalyticsConsent(onOptIn?: () => void) {
  const [consent, setConsent] = useState<ReturnType<typeof getProductAnalyticsConsent>>(null)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    setConsent(getProductAnalyticsConsent())
    setReady(true)
  }, [])

  const save = async (optedOut: boolean): Promise<boolean> => {
    setPending(true)
    setError(false)
    try {
      await setProductAnalyticsOptOut(optedOut)
      const saved = getProductAnalyticsConsent()
      setConsent(saved)
      const succeeded = saved === (optedOut ? "denied" : "granted")
      setError(!succeeded)
      if (succeeded && saved === "granted") onOptIn?.()
      return succeeded
    } catch {
      setConsent(getProductAnalyticsConsent())
      setError(true)
      return false
    } finally {
      setPending(false)
    }
  }

  return { consent, ready, pending, error, save }
}

export type AnalyticsConsentPreference = ReturnType<typeof useAnalyticsConsent>
