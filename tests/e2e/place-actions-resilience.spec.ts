import { expect, installMapTestRoutes, test } from "./map-test"

const MAP_SHARE = "/?lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share"
const PLACE_SHARE = "/?place=test-sprout-square&src=place_share"
const MAP_VIEW = "37.5010, 127.0330 · 확대 15"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
})

test("canonical place and map links reload while marker Back and direct close preserve the active map", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/?src=map_share&tag=balanced&z=15&lng=127.033&lat=37.501")
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
  await expect(page.getByRole("button", { name: "균형식 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.reload()
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
  await expect(page.getByRole("button", { name: "균형식 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await expect(page).toHaveURL(PLACE_SHARE)
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()

  await page.reload()
  await expect(page).toHaveURL(PLACE_SHARE)
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()

  await page.goBack()
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
  await expect(page.getByRole("button", { name: "균형식 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )

  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
  await expect(page.getByRole("button", { name: "균형식 필터" })).toHaveAttribute(
    "aria-pressed",
    "true",
  )
})

test("malformed duplicate and partial links recover while a mixed place link canonicalizes to place", async ({
  page,
}) => {
  await page.goto("/?lat=37.501&lat=37.502&lng=127.033&z=15&tag=balanced&src=map_share")
  await expect(page.getByText("유효하지 않은 공유 링크를 기본 지도로 복구했습니다.")).toBeVisible()
  await expect(page).toHaveURL("/")

  await page.goto("/?lat=37.501&lng=127.033&src=map_share")
  await expect(page.getByText("유효하지 않은 공유 링크를 기본 지도로 복구했습니다.")).toBeVisible()
  await expect(page).toHaveURL("/")

  await page.goto(
    "/?place=test-sprout-square&lat=37.501&lng=127.033&z=15&tag=balanced&src=map_share",
  )
  await expect(page).toHaveURL(PLACE_SHARE)
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeVisible()
})

test("resolved Web Share reports only the sheet opening and never writes the clipboard", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Reflect.set(globalThis, "healthmapClipboardWrites", 0)
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.resolve(),
    })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => {
          Reflect.set(
            globalThis,
            "healthmapClipboardWrites",
            Number(Reflect.get(globalThis, "healthmapClipboardWrites")) + 1,
          )
          return Promise.resolve()
        },
      },
    })
  })
  await page.goto(PLACE_SHARE)
  await page.getByRole("button", { name: "공유", exact: true }).click()

  await expect(page.getByText("공유 창을 열었습니다.")).toBeVisible()
  await expect(page.getByText("공유 URL을 클립보드에 복사했습니다.")).toHaveCount(0)
  await expect(page.getByLabel("공유 URL")).toHaveCount(0)
  await expect
    .poll(() => page.evaluate(() => Number(Reflect.get(globalThis, "healthmapClipboardWrites"))))
    .toBe(0)
})

test("rejected Web Share and unavailable Web Share copy exact canonical URLs", async ({
  browser,
}) => {
  const rejectedContext = await browser.newContext()
  await installMapTestRoutes(rejectedContext)
  await rejectedContext.addInitScript(() => {
    Reflect.set(globalThis, "healthmapCopiedUrl", "")
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("cancelled")),
    })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (url: string) => {
          Reflect.set(globalThis, "healthmapCopiedUrl", url)
          return Promise.resolve()
        },
      },
    })
  })
  const rejectedPage = await rejectedContext.newPage()
  await rejectedPage.goto(PLACE_SHARE)
  await rejectedPage.getByRole("button", { name: "지도 공유" }).click()
  await expect(rejectedPage.getByText("공유 URL을 클립보드에 복사했습니다.")).toBeVisible()
  await expect
    .poll(() => rejectedPage.evaluate(() => String(Reflect.get(globalThis, "healthmapCopiedUrl"))))
    .toBe(MAP_SHARE)
  await rejectedContext.close()

  const unavailableContext = await browser.newContext()
  await installMapTestRoutes(unavailableContext)
  await unavailableContext.addInitScript(() => {
    Reflect.set(globalThis, "healthmapCopiedUrl", "")
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (url: string) => {
          Reflect.set(globalThis, "healthmapCopiedUrl", url)
          return Promise.resolve()
        },
      },
    })
  })
  const unavailablePage = await unavailableContext.newPage()
  await unavailablePage.goto(PLACE_SHARE)
  await unavailablePage.getByRole("button", { name: "공유", exact: true }).click()
  await expect(unavailablePage.getByText("공유 URL을 클립보드에 복사했습니다.")).toBeVisible()
  await expect
    .poll(() =>
      unavailablePage.evaluate(() => String(Reflect.get(globalThis, "healthmapCopiedUrl"))),
    )
    .toBe(PLACE_SHARE)
  await unavailableContext.close()
})

test("clipboard failure exposes selectable manual completion and five native share interruption cycles settle", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto(MAP_SHARE)
  await page.getByRole("button", { name: "단백질 필터" }).click()
  const initialView = await page.getByTestId("map-view").textContent()

  for (let cycle = 0; cycle < 5; cycle += 1) {
    await page.getByRole("button", { name: /무지개 한그릇 연구소/ }).click()
    await expect(page.getByRole("heading", { name: "무지개 한그릇 연구소" })).toBeFocused()
    await page.getByRole("button", { name: "공유", exact: true }).click()
    await expect(page.getByLabel("공유 URL")).toBeVisible()
    await expect(page.getByText("공유 URL을 직접 선택해 복사할 수 있습니다.")).toBeVisible()

    if (cycle === 0) {
      await page.getByRole("button", { name: "URL 선택" }).click()
      await expect(page.getByText("공유 URL을 선택했습니다.")).toBeVisible()
      await expect(page.getByLabel("공유 URL")).toBeFocused()
      await expect
        .poll(() =>
          page
            .getByLabel("공유 URL")
            .evaluate(
              (input) =>
                input instanceof HTMLInputElement &&
                input.selectionStart === 0 &&
                input.selectionEnd === input.value.length,
            ),
        )
        .toBe(true)
      await page.screenshot({
        path: ".omo/evidence/task-7/recovery-share/manual-complete-375x812.png",
      })
    }

    if (cycle % 2 === 0) {
      await page.getByRole("button", { name: "상세 닫기" }).click()
    } else {
      await page.keyboard.press("Escape")
    }
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.getByTestId("map-stage")).toBeVisible()
    await expect(page.getByRole("button", { name: "단백질 필터" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
    await expect(page.getByTestId("map-view")).toHaveText(initialView ?? "")
    await page.goBack()
    await expect(page.getByTestId("place-detail")).toHaveCount(0)
    await expect(page.getByRole("button", { name: "단백질 필터" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )
  }
})

test("desktop manual fallback supports native marker, share, select, close, Escape, and Back actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto(MAP_SHARE)
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.getByRole("button", { name: "공유", exact: true }).click()
  await expect(page.getByLabel("공유 URL")).toBeVisible()
  await page.getByRole("button", { name: "URL 선택" }).click()
  await expect(page.getByText("공유 URL을 선택했습니다.")).toBeVisible()
  await page.screenshot({
    path: ".omo/evidence/task-7/recovery-share/manual-complete-1280x800.png",
  })
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)

  await page.goto(MAP_SHARE)
  await page.getByRole("button", { name: /새싹 네모식당/ }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(MAP_SHARE)
  await expect(page.getByTestId("map-view")).toHaveText(MAP_VIEW)
})

test("mobile detail is a contained dialog with an explicit recovery scroll and visible filter rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined })
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new DOMException("blocked")) },
    })
  })
  await page.goto("/")

  const rail = page.locator("fieldset")
  await expect
    .poll(() => rail.evaluate((element) => getComputedStyle(element).scrollbarWidth))
    .not.toBe("none")

  const marker = page.getByRole("button", { name: /새싹 네모식당/ })
  await marker.click()
  const dialog = page.getByRole("dialog", { name: "장소 상세" })
  const close = page.getByRole("button", { name: "상세 닫기" })
  await expect(dialog).toBeVisible()
  await expect(close).toBeVisible()
  await expect
    .poll(() =>
      close.evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width >= 16 && rect.height >= 16
      }),
    )
    .toBe(true)

  await close.focus()
  await page.keyboard.press("Shift+Tab")
  await expect(page.getByRole("button", { name: "지도 공유" })).toBeFocused()

  await page.getByRole("button", { name: "공유", exact: true }).click()
  const body = page.getByTestId("place-detail-body")
  await expect(page.getByLabel("공유 URL")).toBeVisible()
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect(page.getByRole("button", { name: "URL 선택" })).toBeVisible()

  await close.click()
  await expect(page.locator("fieldset button[aria-pressed='true']")).toBeFocused()
})
