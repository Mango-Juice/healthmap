import { expect, type Page, test } from "@playwright/test"

function waitForSheetTransformTransition(page: Page) {
  return page.locator('[role="dialog"]').evaluate(
    (element) =>
      new Promise<void>((resolve) => {
        element.addEventListener(
          "transitionend",
          (event) => {
            if ("propertyName" in event && event.propertyName === "transform") resolve()
          },
          { once: true },
        )
      }),
  )
}

const viewports = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const

for (const viewport of viewports) {
  test(`Given the primitive showcase, When viewed at ${viewport.name}, Then every state fits and remains operable`, async ({
    page,
  }) => {
    // Given
    await page.setViewportSize(viewport)

    // When
    await page.goto("/showcase")

    // Then
    await expect(page.getByRole("heading", { level: 1, name: "프리미티브 쇼케이스" })).toBeVisible()
    await expect(page.getByTestId("map-shell")).toBeVisible()
    await expect(page.getByTestId("state-default")).toBeVisible()
    await expect(page.getByTestId("state-hover")).toBeVisible()
    await expect(page.getByTestId("state-focus")).toBeVisible()
    await expect(page.getByTestId("state-active")).toBeVisible()
    await expect(page.getByTestId("state-disabled")).toBeVisible()
    await expect(page.getByTestId("state-loading")).toBeVisible()
    await expect(page.getByTestId("state-error")).toBeVisible()
    await expect(page.getByTestId("state-empty")).toBeVisible()
    await expect(page.getByTestId("state-stress")).toContainText(
      "https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string",
    )

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(overflow.scrollWidth).toBe(overflow.clientWidth)

    const undersizedTargets = await page.locator("main button:visible").evaluateAll((buttons) =>
      buttons.flatMap((button) => {
        const bounds = button.getBoundingClientRect()
        return bounds.width < 44 || bounds.height < 44
          ? [
              {
                label: button.getAttribute("aria-label") ?? button.textContent,
                width: bounds.width,
                height: bounds.height,
              },
            ]
          : []
      }),
    )
    expect(undersizedTargets).toEqual([])
  })
}

test("Given the stress alert, When viewed at mobile width, Then the unbroken URL stays contained", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 375, height: 812 })

  // When
  await page.goto("/showcase")

  // Then
  const url = page
    .getByTestId("state-stress")
    .getByText("https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string")
  await expect(url).toBeAttached()
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(geometry.scrollWidth).toBe(geometry.clientWidth)
})

test("Given keyboard input, When filters and sheet controls are used, Then focus and open state are explicit", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/showcase")
  await expect(page.locator("#showcase-place-title")).toBeFocused()
  const closeDetail = page.getByRole("button", { name: "상세 닫기" })

  // When
  await closeDetail.focus()

  // Then
  await expect(closeDetail).toBeFocused()
  const focusStyle = await closeDetail.evaluate((button) => {
    const style = getComputedStyle(button)
    return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`
  })
  expect(focusStyle).not.toContain("none 0px none")

  // When
  await closeDetail.click()

  // Then
  await expect(page.getByTestId("detail-closed")).toBeVisible()
  await expect(page.locator('[role="dialog"][aria-hidden="true"]')).toHaveAttribute(
    "aria-hidden",
    "true",
  )

  // When
  await page.getByRole("button", { name: "상세 열기" }).click()

  // Then
  const detailDialog = page.getByRole("dialog", { name: "그린테이블 강남점" })
  await expect(detailDialog).toBeVisible()
  await expect(page.locator("#showcase-place-title")).toBeFocused()

  // When
  await page.keyboard.press("Escape")

  // Then
  const reopenDetail = page.getByRole("button", { name: "상세 열기" })
  await expect(reopenDetail).toBeFocused()

  // When
  await page.getByRole("button", { name: "프로틴 키친 역삼점, 단백질" }).click()

  // Then
  await expect(page.getByRole("dialog", { name: "그린테이블 강남점" })).toBeVisible()

  // When a close completion is interrupted by a marker selection
  const interruptedSheet = page.getByRole("dialog", { name: "그린테이블 강남점" })
  await interruptedSheet.evaluate((element) => {
    ;(element as HTMLElement).style.transitionDuration = "1s"
  })
  const reopenCompletion = waitForSheetTransformTransition(page)
  await page.getByRole("button", { name: "상세 닫기" }).click()
  await expect(page.locator('[role="dialog"]')).toHaveAttribute("data-open", "false")
  await page.getByRole("button", { name: "프로틴 키친 역삼점, 단백질" }).click()
  await expect(page.getByRole("dialog", { name: "그린테이블 강남점" })).toHaveAttribute(
    "data-open",
    "true",
  )
  await expect(reopenCompletion).resolves.toBeUndefined()

  // Then the stale close timer cannot expose a reopen control over the dialog
  await expect(page.getByRole("dialog", { name: "그린테이블 강남점" })).toBeVisible()
  await expect(page.getByRole("button", { name: "상세 열기" })).toHaveCount(0)
})

test("Given mobile focus entry, When the detail title receives focus, Then the design focus token is visible", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 375, height: 812 })

  // When
  await page.goto("/showcase")

  // Then
  const title = page.locator("#showcase-place-title")
  await expect(title).toBeFocused()
  await expect(title).toHaveCSS("outline-color", "rgb(38, 105, 156)")
  await expect(title).toHaveCSS("outline-style", "solid")
  await expect(title).toHaveCSS("outline-width", "3px")
})

test("Given a mobile sheet with a long closing transition, When it closes, Then the reopen control waits for transition completion", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/showcase")
  const sheet = page.getByRole("dialog", { name: "그린테이블 강남점" })
  await sheet.evaluate((element) => {
    ;(element as HTMLElement).style.transitionDuration = "1s"
  })
  const closeCompletion = sheet.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        const reopenObserver = new MutationObserver(() => {
          if (document.querySelector("[data-testid='detail-closed']")) {
            reopenObserver.disconnect()
            reject(new Error("reopen control appeared before transitionend"))
          }
        })
        reopenObserver.observe(document.body, { childList: true, subtree: true })
        element.addEventListener(
          "transitionend",
          (event) => {
            if (!("propertyName" in event) || event.propertyName !== "transform") return
            reopenObserver.disconnect()
            resolve()
          },
          { once: true },
        )
      }),
  )

  // When
  await page.getByRole("button", { name: "상세 닫기" }).click()

  // Then
  await expect(closeCompletion).resolves.toBeUndefined()
  await expect(page.getByTestId("detail-closed")).toBeVisible()
})

test("Given an open desktop detail pane, When Escape is pressed, Then the pane closes", async ({
  page,
}) => {
  // Given
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/showcase")
  const pane = page.getByRole("complementary", { name: "그린테이블 강남점" })
  await expect(pane).toBeVisible()

  // When
  await page.keyboard.press("Escape")

  // Then
  await expect(pane).toHaveCount(0)
  await expect(page.getByTestId("detail-closed-desktop")).toBeVisible()
})

test("Given reduced motion, When the showcase loads, Then transforms and pulses are removed", async ({
  page,
}) => {
  // Given
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 375, height: 812 })

  // When
  await page.goto("/showcase")

  // Then
  const motion = await page.locator("main, main *").evaluateAll((elements) => {
    const durationToMilliseconds = (duration: string) => {
      const value = Number.parseFloat(duration)
      return duration.trim().endsWith("ms") ? value : value * 1_000
    }
    const isVisible = (element: Element) => {
      const style = getComputedStyle(element)
      const bounds = element.getBoundingClientRect()
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        bounds.width > 0 &&
        bounds.height > 0
      )
    }

    return elements.flatMap((element) => {
      const style = getComputedStyle(element)
      const transitionDuration = style.transitionDuration.split(",").map(durationToMilliseconds)
      const violations = [
        style.animationName !== "none" ? `animation:${style.animationName}` : null,
        transitionDuration.some((duration) => duration > 0)
          ? `transition:${style.transitionDuration}`
          : null,
        isVisible(element) && style.transform !== "none" ? `transform:${style.transform}` : null,
      ].filter((violation): violation is string => violation !== null)

      return violations.length > 0
        ? [
            {
              element: element.tagName.toLowerCase(),
              className: element.getAttribute("class"),
              violations,
            },
          ]
        : []
    })
  })
  expect(motion).toEqual([])
})
