"use client"

import { type MouseEvent, useId, useRef } from "react"
import { createPortal } from "react-dom"
import { SlidersHorizontalIcon } from "../ui/health-map-icons"
import styles from "./analytics-settings.module.css"
import { PrivacyPreferenceControl } from "./privacy-preference"
import { useAnalyticsConsent } from "./use-analytics-consent"

type Properties = { readonly onOptIn: () => void }

export function AnalyticsSettings({ onOptIn }: Properties) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const returnFocusRef = useRef<HTMLButtonElement>(null)
  const bannerRef = useRef<HTMLElement>(null)
  const headingId = useId()
  const bannerHeadingId = useId()
  const preference = useAnalyticsConsent(onOptIn)

  const openSettings = (event: MouseEvent<HTMLButtonElement>): void => {
    returnFocusRef.current = event.currentTarget
    dialogRef.current?.showModal()
  }
  const choose = async (optedOut: boolean): Promise<void> => {
    const focused = document.activeElement
    const restoreFocus = bannerRef.current?.contains(focused)
    const succeeded = await preference.save(optedOut)
    if (
      succeeded &&
      restoreFocus &&
      (document.activeElement === focused || document.activeElement === document.body)
    ) {
      triggerRef.current?.focus({ preventScroll: true })
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label="분석 설정"
        title="분석 설정"
        className={`${styles["trigger"]} ${styles["iconTrigger"]}`}
        disabled={!preference.ready}
        onClick={openSettings}
        ref={triggerRef}
        type="button"
      >
        <SlidersHorizontalIcon />
      </button>
      {preference.ready
        ? createPortal(
            <>
              {preference.consent === null ? (
                <section
                  aria-labelledby={bannerHeadingId}
                  className={styles["banner"]}
                  ref={bannerRef}
                >
                  <h2 id={bannerHeadingId}>익명 이용 통계</h2>
                  <p>
                    지도 개선을 위한 이용 통계를 허용할까요? 검색어와 정확한 위치는 보내지 않아요.
                  </p>
                  {preference.error ? (
                    <p role="alert">
                      선택을 저장하지 못했어요. 브라우저의 저장 허용 설정을 확인해 주세요.
                    </p>
                  ) : null}
                  <div className={styles["bannerActions"]}>
                    <button className={styles["details"]} onClick={openSettings} type="button">
                      자세히
                    </button>
                    <button
                      aria-busy={preference.pending}
                      className={styles["choice"]}
                      disabled={preference.pending}
                      onClick={() => void choose(true)}
                      type="button"
                    >
                      거부
                    </button>
                    <button
                      aria-busy={preference.pending}
                      className={`${styles["choice"]} ${styles["allow"]}`}
                      disabled={preference.pending}
                      onClick={() => void choose(false)}
                      type="button"
                    >
                      허용
                    </button>
                  </div>
                </section>
              ) : null}
              <dialog
                aria-labelledby={headingId}
                className={styles["dialog"]}
                onClose={() => {
                  const target = returnFocusRef.current?.isConnected
                    ? returnFocusRef.current
                    : triggerRef.current
                  target?.focus({ preventScroll: true })
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") event.stopPropagation()
                }}
                ref={dialogRef}
              >
                <div className={styles["heading"]}>
                  <h2 id={headingId}>분석 설정</h2>
                  <button
                    aria-label="분석 설정 닫기"
                    className={styles["trigger"]}
                    onClick={() => dialogRef.current?.close()}
                    type="button"
                  >
                    닫기
                  </button>
                </div>
                <p>
                  지도 개선을 위해 익명 이용 통계를 보내는 데 동의할 수 있어요. 동의하지 않아도 모든
                  기능을 이용할 수 있어요.
                </p>
                <PrivacyPreferenceControl preference={preference} />
                <p>
                  켜면 지도 열기, 필터 선택, 검색 결과 수, 가게 상세와 길찾기 클릭 등을 PostHog로
                  보내요.
                </p>
                <p>
                  검색어, 정확한 위치, 주소, 화면 녹화는 보내지 않아요. 이 브라우저에 익명 식별자와
                  동의 여부를 저장해요.
                </p>
                <p>언제든 여기서 끌 수 있어요. 켜기 전의 행동은 나중에도 보내지 않아요.</p>
              </dialog>
            </>,
            document.body,
          )
        : null}
    </>
  )
}
