"use client"

import { useEffect, useState } from "react"

import { getProductAnalyticsOptOut, setProductAnalyticsOptOut } from "../../lib/analytics/browser"

export function PrivacyPreference() {
  const [optedOut, setOptedOut] = useState(true)
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setOptedOut(getProductAnalyticsOptOut())
    setReady(true)
  }, [])

  const onChange = async () => {
    const nextOptedOut = !optedOut
    setPending(true)
    await setProductAnalyticsOptOut(nextOptedOut)
    setOptedOut(nextOptedOut)
    setPending(false)
  }

  return (
    <section aria-labelledby="privacy-preference-heading" className="privacy-preference">
      <div>
        <h2 id="privacy-preference-heading">분석 데이터 수집</h2>
        <p>{optedOut ? "현재 수집하지 않음" : "현재 최소한의 분석 이벤트만 수집"}</p>
      </div>
      <button
        aria-checked={!optedOut}
        aria-label="분석 데이터 수집 설정"
        className="privacy-toggle"
        disabled={!ready || pending}
        onClick={onChange}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className="privacy-toggle-thumb" />
      </button>
    </section>
  )
}
