import { expect, type Page } from "@playwright/test"
import { writeBlockedShowcaseEvidence } from "./design-token-route-blocked-evidence"
import type { Mode, RouteName } from "./design-token-route-provenance"

const SHOWCASE_STATES = [
  "state-default",
  "state-hover",
  "state-focus",
  "state-active",
  "state-disabled",
  "state-loading",
  "state-info",
  "state-loading-detail",
  "state-error",
  "state-empty",
  "state-stress",
] as const

export type RouteState = Readonly<{
  cjkLineRects: Record<string, unknown>
  state: Record<string, unknown>
  status: number
}>

const textRects = (
  page: Page,
  values: Readonly<Record<string, string>>,
): Promise<Record<string, unknown>> =>
  page.evaluate((texts) => {
    const lines = (text: string): readonly Record<string, number>[] => {
      const element = [...document.querySelectorAll("p, h1, span")].find((candidate) =>
        candidate.textContent?.startsWith(text),
      )
      const textNode = element?.firstChild
      if (textNode === undefined || textNode === null)
        throw new Error(`DS-01 text missing: ${text}`)
      const range = document.createRange()
      return Array.from(text, (_, index) => {
        range.setStart(textNode, index)
        range.setEnd(textNode, index + 1)
        return range.getBoundingClientRect().toJSON()
      })
    }
    return Object.fromEntries(Object.entries(texts).map(([name, text]) => [name, lines(text)]))
  }, values)

const privacy = async (page: Page): Promise<RouteState> => {
  const response = await page.goto("/privacy")
  const heading = page.getByRole("heading", { level: 1, name: "개인정보 및 분석 안내" })
  const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
  await expect(heading).toBeVisible()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await toggle.focus()
  await expect(toggle).toBeFocused()
  await toggle.press("Space")
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await page.reload()
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("현재 최소한의 분석 이벤트만 수집")).toBeVisible()
  return {
    cjkLineRects: await textRects(page, {
      heading: "개인정보 및 분석 안내",
      intro: "장소와 메뉴 정보는 공개된 운영 데이터만 표시하며, 현재 상태는 제공처 기준입니다.",
    }),
    state: {
      ariaChecked: await toggle.getAttribute("aria-checked"),
      keyboardTogglePersistsAfterReload: true,
    },
    status: response?.status() ?? 0,
  }
}

const notFound = async (page: Page): Promise<RouteState> => {
  const response = await page.goto("/places/not-published")
  const recovery = page.getByRole("link", { name: "건강식 지도 돌아가기" })
  await expect(page).toHaveURL(/\/places\/not-published$/)
  await expect(page.getByRole("heading", { name: "장소를 찾을 수 없어요" })).toBeVisible()
  await expect(
    page.getByText("공개된 장소가 아니거나 더 이상 제공되지 않는 주소예요."),
  ).toBeVisible()
  await expect(recovery).toBeVisible()
  await recovery.focus()
  await expect(recovery).toBeFocused()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(page.getByRole("button", { name: "길찾기" })).toHaveCount(0)
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
  return {
    cjkLineRects: await textRects(page, {
      description: "공개된 장소가 아니거나 더 이상 제공되지 않는 주소예요.",
    }),
    state: { detailCount: 0, markerCount: 0, recoveryDestination: "/", recoveryFocused: true },
    status: response?.status() ?? 0,
  }
}

const showcase = async (
  page: Page,
  mode: Mode,
  sourceManifestSha256: string,
): Promise<RouteState> => {
  const response = await page.goto("/showcase")
  const filter = page.getByRole("button", { name: "채소 필터" }).first()
  await expect(page.getByRole("heading", { level: 1, name: "프리미티브 쇼케이스" })).toBeVisible()
  for (const testId of SHOWCASE_STATES) await expect(page.getByTestId(testId)).toBeVisible()
  await expect(page.getByTestId("map-shell")).toHaveCount(0)
  await filter.focus()
  await expect(filter).toBeFocused()
  await filter.press("Enter")
  await expect(filter).toHaveAttribute("aria-pressed", "true")
  const stressUrl = page.getByText(
    "https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string",
  )
  const stressBounds = await stressUrl.boundingBox()
  if (stressBounds === null) throw new Error("DS-01 showcase stress URL is missing")
  if (stressBounds.x + stressBounds.width > mode.width) {
    await writeBlockedShowcaseEvidence(page, mode, sourceManifestSha256, stressBounds)
    throw new Error(
      `DS-01 showcase 200% URL containment failed: right=${stressBounds.x + stressBounds.width}`,
    )
  }
  const skeletonState = await page.getByTestId("skeleton-line").evaluate((element) => {
    const style = getComputedStyle(element)
    return { animationDuration: style.animationDuration, animationName: style.animationName }
  })
  expect(skeletonState.animationName).toBe("none")
  return {
    cjkLineRects: await textRects(page, {
      feedback: "복구 행동과 안정적인 높이를 함께 검증합니다.",
      header: "필터, 버튼, 상태 피드백을 실제 상호작용으로 검증합니다.",
    }),
    state: {
      reusableStates: SHOWCASE_STATES,
      selectedFilter: await filter.getAttribute("aria-pressed"),
      skeletonReducedMotion: skeletonState,
      stressUrl: stressBounds,
    },
    status: response?.status() ?? 0,
  }
}

export const routeState = (
  page: Page,
  route: RouteName,
  mode: Mode,
  sourceManifestSha256: string,
): Promise<RouteState> => {
  switch (route) {
    case "privacy":
      return privacy(page)
    case "not-found":
      return notFound(page)
    case "showcase":
      return showcase(page, mode, sourceManifestSha256)
  }
}
