import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { expect, test } from "@playwright/test"

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const) {
  test(`shows only reusable controls and feedback at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto("/showcase")

    await expect(page.getByRole("heading", { level: 1, name: "프리미티브 쇼케이스" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "필터와 버튼" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "알림, 로딩, 오류, 빈 상태" })).toBeVisible()
    await expect(page.getByTestId("map-shell")).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "대표 태그 마커" })).toHaveCount(0)

    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(geometry.scrollWidth).toBe(geometry.clientWidth)
  })
}

test("keeps filter and action controls keyboard operable", async ({ page }) => {
  await page.goto("/showcase")
  const filter = page.getByRole("button", { name: "채소 필터" }).first()
  await filter.focus()
  await expect(filter).toBeFocused()
  await filter.press("Enter")
  await expect(filter).toHaveAttribute("aria-pressed", "true")

  const action = page.getByRole("button", { name: "길찾기" }).first()
  await action.focus()
  await expect(action).toBeFocused()
})

for (const viewport of [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const) {
  test(`keeps section explanatory copy on Korean word boundaries at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.goto("/showcase")

    const copy = page.getByText("복구 행동과 안정적인 높이를 함께 검증합니다.")
    const lineTops = await copy.evaluate((element) => {
      const text = element.textContent ?? ""
      const suffixStart = text.indexOf("검증합니다.")
      const range = document.createRange()
      return [...text].map((_, index) => {
        range.setStart(element.firstChild ?? element, index)
        range.setEnd(element.firstChild ?? element, index + 1)
        return {
          character: text[index],
          top: range.getBoundingClientRect().top,
          index,
          suffixStart,
        }
      })
    })

    const suffixTops = lineTops
      .filter(({ index, suffixStart }) => index >= suffixStart)
      .map(({ top }) => top)
    expect(new Set(suffixTops).size).toBe(1)

    const headerCopy = page.getByText("필터, 버튼, 상태 피드백을 실제 상호작용으로 검증합니다.")
    const headerLineTops = await headerCopy.evaluate((element) => {
      const text = element.textContent ?? ""
      const suffixStart = text.indexOf("검증합니다.")
      const range = document.createRange()
      return [...text].map((_, index) => {
        range.setStart(element.firstChild ?? element, index)
        range.setEnd(element.firstChild ?? element, index + 1)
        return {
          character: text[index],
          top: range.getBoundingClientRect().top,
          index,
          suffixStart,
        }
      })
    })
    const headerSuffixTops = headerLineTops
      .filter(({ index, suffixStart }) => index >= suffixStart)
      .map(({ top }) => top)
    expect(new Set(headerSuffixTops).size).toBe(1)

    const stressUrl = page.getByText(
      "https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string",
    )
    const stressBounds = await stressUrl.boundingBox()
    expect(stressBounds).not.toBeNull()
    expect((stressBounds?.x ?? 0) + (stressBounds?.width ?? 0)).toBeLessThanOrEqual(viewport.width)

    const evidenceDirectory = process.env["F3_EVIDENCE_DIR"]?.trim()
    if (evidenceDirectory) {
      await mkdir(evidenceDirectory, { recursive: true })
      const screenshotPath = join(evidenceDirectory, `${viewport.name}.png`)
      await page.screenshot({ fullPage: false, path: screenshotPath })
      await page.screenshot({
        fullPage: true,
        path: join(evidenceDirectory, `${viewport.name}-full.png`),
      })
      const pageGeometry = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }))
      const inventory = await page.evaluate(() => ({
        headings: [...document.querySelectorAll("h1, h2")].map((heading) => heading.textContent),
        stateTestIds: [...document.querySelectorAll("[data-testid]")].map((element) =>
          element.getAttribute("data-testid"),
        ),
      }))
      await writeFile(
        join(evidenceDirectory, `${viewport.name}-line-rects.json`),
        `${JSON.stringify(
          { viewport, pageGeometry, inventory, stressBounds, lineTops, headerLineTops },
          null,
          2,
        )}\n`,
      )
    }
  })
}
