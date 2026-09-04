"use client"

import { useRef, useState } from "react"
import { z } from "zod"
import { requestJson } from "../../lib/http/request"
import { type Suggestion, SuggestionSchema } from "../../lib/suggestions/contracts"
import { MapPinIcon } from "../ui/health-map-icons"
import { ActionButton, StatusAlert } from "../ui/health-map-primitives"
import styles from "./suggestion-form.module.css"

type Properties = {
  readonly pilot: boolean
  readonly placeUrl: string
  readonly context?: { readonly name: string; readonly address: string } | undefined
  readonly accepting: boolean
}

export function SuggestionForm({ pilot, placeUrl, context, accepting }: Properties) {
  const [kind, setKind] = useState<Suggestion["kind"]>(placeUrl ? "menu_correction" : "place_add")
  const [textLength, setTextLength] = useState(0)
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const requestId = useRef<string | null>(null)
  const previousPayload = useRef("")
  const linkedPlace = kind === "menu_correction" && context !== undefined
  return (
    <form
      className={styles["form"]}
      onSubmit={async (event) => {
        event.preventDefault()
        if (busy || !accepting) return
        const data = new FormData(event.currentTarget)
        const payload = JSON.stringify([
          data.get("kind"),
          data.get("placeUrl"),
          data.get("text"),
          data.get("evidenceUrl"),
        ])
        if (payload !== previousPayload.current) requestId.current = crypto.randomUUID()
        previousPayload.current = payload
        const parsed = SuggestionSchema.safeParse({
          requestId: requestId.current,
          kind: data.get("kind"),
          placeUrl: data.get("placeUrl"),
          text: data.get("text"),
          evidenceUrl: data.get("evidenceUrl"),
        })
        if (!parsed.success) {
          setFailed(true)
          setMessage("https://로 시작하는 링크와 10자 이상의 내용을 확인해 주세요.")
          return
        }
        setBusy(true)
        setMessage("")
        try {
          const response = await requestJson(
            `/api/suggestions${pilot ? "?scope=pilot" : ""}`,
            z.object({ state: z.enum(["queued", "duplicate"]) }).strict(),
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(parsed.data),
            },
          )
          setFailed(false)
          setMessage(
            response.state === "duplicate"
              ? "이미 접수된 제안이에요. 검토를 기다려 주세요."
              : "제안을 접수했어요. 내용을 확인한 뒤 반영 여부를 결정해요.",
          )
        } catch (error) {
          if (!(error instanceof Error)) throw error
          setFailed(true)
          setMessage("입력 내용은 그대로 있어요. 잠시 후 다시 보내주세요.")
        } finally {
          setBusy(false)
        }
      }}
    >
      <fieldset className={styles["kindGroup"]}>
        <legend>무엇을 알려주실래요?</legend>
        <div className={styles["kindChoices"]}>
          <label>
            <input
              name="kind"
              type="radio"
              value="place_add"
              checked={kind === "place_add"}
              onChange={() => setKind("place_add")}
            />
            <span>새로운 장소</span>
          </label>
          <label>
            <input
              name="kind"
              type="radio"
              value="menu_correction"
              checked={kind === "menu_correction"}
              onChange={() => setKind("menu_correction")}
            />
            <span>메뉴 수정</span>
          </label>
        </div>
      </fieldset>
      {linkedPlace ? (
        <div className={styles["placeContext"]}>
          <MapPinIcon />
          <div>
            <span className={styles["help"]}>알려주실 장소</span>
            <strong>{context.name}</strong>
            <p>{context.address}</p>
          </div>
          <input type="hidden" name="placeUrl" value={placeUrl} />
        </div>
      ) : (
        <div className={styles["field"]}>
          <label htmlFor="suggest-place">장소 링크</label>
          <input
            id="suggest-place"
            name="placeUrl"
            type="url"
            key={kind}
            defaultValue={kind === "menu_correction" ? placeUrl : ""}
            placeholder="https://map.naver.com/…"
            maxLength={2048}
            aria-describedby="suggest-place-help"
            required
          />
          <p className={styles["help"]} id="suggest-place-help">
            지도나 공식 매장 페이지의 링크를 붙여주세요.
          </p>
        </div>
      )}
      <div className={styles["field"]}>
        <label htmlFor="suggest-text">알려주실 내용</label>
        <textarea
          id="suggest-text"
          name="text"
          minLength={10}
          maxLength={2000}
          rows={5}
          required
          onChange={(event) => setTextLength(event.currentTarget.value.length)}
          placeholder={
            kind === "place_add"
              ? "어떤 곳이고, 어떤 메뉴를 먹을 수 있는지 알려주세요."
              : "메뉴 이름과 달라진 구성이나 판매 여부를 알려주세요."
          }
          aria-describedby="suggestion-guidance"
        />
        <div className={styles["fieldFoot"]}>
          <p className={styles["help"]} id="suggestion-guidance">
            10자 이상 적어주세요. 개인 연락처는 남기지 마세요.
          </p>
          <span className={styles["count"]}>{textLength.toLocaleString("ko-KR")} / 2,000</span>
        </div>
      </div>
      <div className={styles["field"]}>
        <label htmlFor="suggest-evidence">확인할 수 있는 링크</label>
        <input
          id="suggest-evidence"
          name="evidenceUrl"
          type="url"
          placeholder="https://…"
          maxLength={2048}
          aria-describedby="suggest-evidence-help"
          required
        />
        <p className={styles["help"]} id="suggest-evidence-help">
          메뉴판이나 공식 메뉴처럼 내용을 확인할 수 있는 공개 페이지를 남겨주세요.
        </p>
      </div>
      <div className={styles["submitRow"]}>
        <p className={styles["help"]}>제안은 확인 후 반영되며, 바로 공개되지 않아요.</p>
        <ActionButton type="submit" loading={busy} disabled={!accepting} variant="primary">
          {accepting ? "제안 보내기" : "접수 준비 중"}
        </ActionButton>
      </div>
      {message ? (
        <StatusAlert
          tone={failed ? "error" : "info"}
          title={failed ? "접수하지 못했어요" : "제안 접수 안내"}
          description={message}
        />
      ) : null}
    </form>
  )
}
