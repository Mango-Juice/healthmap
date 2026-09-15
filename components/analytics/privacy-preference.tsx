"use client"

import { useId } from "react"
import styles from "./analytics-settings.module.css"
import { type AnalyticsConsentPreference, useAnalyticsConsent } from "./use-analytics-consent"

type Properties = { readonly onOptIn?: (() => void) | undefined }

export function PrivacyPreference({ onOptIn }: Properties) {
  const preference = useAnalyticsConsent(onOptIn)
  return <PrivacyPreferenceControl preference={preference} />
}

export function PrivacyPreferenceControl({
  preference,
}: {
  readonly preference: AnalyticsConsentPreference
}) {
  const headingId = useId()
  const { consent, ready, pending, error, save } = preference
  const optedOut = consent !== "granted"

  return (
    <section aria-labelledby={headingId} className={styles["preference"]}>
      <div>
        <h3 id={headingId}>분석 데이터 수집</h3>
        <p role="status">{optedOut ? "현재 수집하지 않음" : "현재 최소한의 분석 이벤트만 수집"}</p>
        {error ? (
          <p role="alert">설정을 저장하지 못했어요. 브라우저의 저장 허용 설정을 확인해 주세요.</p>
        ) : null}
      </div>
      <button
        aria-checked={!optedOut}
        aria-busy={pending}
        aria-label="분석 데이터 수집 설정"
        className={styles["toggle"]}
        disabled={!ready || pending}
        onClick={() => void save(!optedOut)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className={styles["thumb"]} />
      </button>
    </section>
  )
}
