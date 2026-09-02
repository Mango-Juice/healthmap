import { expect, test } from "@playwright/test"

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
] as const

for (const viewport of viewports) {
  test(`Given the privacy notice, when viewed at ${viewport.name}, then its Korean notice and preference control fit`, async ({
    page,
  }) => {
    // Given
    await page.setViewportSize(viewport)

    // When
    await page.goto("/privacy")

    // Then
    await expect(
      page.getByRole("heading", { level: 1, name: "개인정보 및 분석 안내" }),
    ).toBeVisible()
    await expect(page.getByText("공개된 운영 데이터만 표시")).toBeVisible()
    await expect(page.getByText("수집하지 않는 정보")).toBeVisible()
    await expect(page.getByRole("switch", { name: "분석 데이터 수집 설정" })).toBeVisible()
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(geometry.scrollWidth).toBe(geometry.clientWidth)
  })
}

test("Given the privacy preference, when toggled with the keyboard and reloaded, then the local opt-out state persists", async ({
  page,
}) => {
  // Given
  await page.goto("/privacy")
  const toggle = page.getByRole("switch", { name: "분석 데이터 수집 설정" })
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveAttribute("aria-checked", "false")
  await expect(page.getByText("현재 수집하지 않음")).toBeVisible()
  await toggle.focus()

  // When
  await toggle.press("Space")

  // Then
  await expect(toggle).toHaveAttribute("aria-checked", "true")
  await expect(page.getByText("현재 최소한의 분석 이벤트만 수집")).toBeVisible()
  const bounds = await toggle.boundingBox()
  expect(bounds?.width).toBeGreaterThanOrEqual(44)
  expect(bounds?.height).toBeGreaterThanOrEqual(44)

  // When
  await page.reload()

  // Then
  await expect(toggle).toHaveAttribute("aria-checked", "true")
})
