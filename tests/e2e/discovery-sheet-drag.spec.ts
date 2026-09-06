import { expect, test } from "./map-test"

test.describe.configure({ retries: 0 })

test("Given the mobile drawer toggle, When it is tapped, keyed, and dragged between measured stops, Then controls persist and the sheet follows before snapping", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")

  const handle = page.getByTestId("food-map-drawer-handle")
  const collapsedToggle = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  const collapsedY = await handle.evaluate((element) => element.getBoundingClientRect().y)

  await collapsedToggle.click()
  const expandedToggle = page.getByRole("button", { name: "검색 결과 접기", exact: true })
  await expect(expandedToggle).toHaveAttribute("aria-expanded", "true")
  await expandedToggle.focus()
  await page.keyboard.press("Enter")
  await expect(collapsedToggle).toHaveAttribute("aria-expanded", "false")
  await handle.evaluate(async (element) => {
    const stack = element.closest("aside")?.parentElement
    await Promise.all(stack?.getAnimations().map((animation) => animation.finished) ?? [])
  })

  const box = await collapsedToggle.boundingBox()
  if (box === null) throw new Error("drawer toggle geometry missing")
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 9)
  await page.mouse.move(x, y - 360, { steps: 4 })

  const intermediate = await handle.evaluate((element) => ({
    dragging: element.closest("aside")?.parentElement?.getAttribute("data-dragging"),
    y: element.getBoundingClientRect().y,
  }))
  expect(intermediate.dragging).toBe("true")
  expect(intermediate.y).toBeLessThan(collapsedY - 40)

  await page.mouse.up()
  await expect(expandedToggle).toHaveAttribute("aria-expanded", "true")
  await expect
    .poll(() =>
      handle.evaluate((element) => element.closest("aside")?.parentElement?.dataset["dragging"]),
    )
    .toBeUndefined()

  const geometry = await handle.evaluate((element, initialY) => {
    const stack = element.closest("aside")?.parentElement
    const panel = element.closest("aside")
    const body = panel?.querySelector<HTMLElement>("[class*='scrollBody']")
    return {
      bodyClientHeight: body?.clientHeight ?? 0,
      bodyScrollHeight: body?.scrollHeight ?? 0,
      collapsedY: initialY,
      expandedY: element.getBoundingClientRect().y,
      inlineOffset: stack?.getAttribute("style") ?? "",
    }
  }, collapsedY)
  expect(geometry.expandedY).toBeLessThan(collapsedY - 40)
  await page.screenshot({ path: testInfo.outputPath("sheet-expanded-after-drag-375x812.png") })
  await testInfo.attach("sheet-drag-geometry", {
    body: Buffer.from(JSON.stringify({ intermediate, ...geometry }, null, 2)),
    contentType: "application/json",
  })
})

test("Given a short mobile viewport and desktop pane, When the sheet surface is inspected, Then direct manipulation is bounded to mobile", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto("/")
  const handle = page.getByTestId("food-map-drawer-handle")
  const toggle = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  const box = await toggle.boundingBox()
  if (box === null) throw new Error("short mobile drawer toggle geometry missing")
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 9)
  await page.mouse.move(x, y - 360, { steps: 4 })
  await expect
    .poll(() =>
      handle.evaluate((element) => element.closest("aside")?.parentElement?.dataset["dragging"]),
    )
    .toBe("true")
  await page.mouse.up()
  await expect(page.getByRole("button", { name: "검색 결과 접기", exact: true })).toBeVisible()
  await page.locator("[data-food-map-place-id]").first().click()
  await page.getByRole("button", { name: "메뉴 펼치기", exact: true }).click()
  const scrollTarget = await handle.evaluate((element) => {
    const body = element.closest("aside")?.querySelector<HTMLElement>("[class*='scrollBody']")
    if (body === null || body === undefined)
      throw new Error("short mobile sheet scroll body missing")
    const rect = body.getBoundingClientRect()
    return {
      clientHeight: body.clientHeight,
      scrollHeight: body.scrollHeight,
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }
  })
  expect(scrollTarget.scrollHeight).toBeGreaterThan(scrollTarget.clientHeight)
  await page.mouse.move(scrollTarget.x, scrollTarget.y)
  await page.mouse.wheel(0, 160)
  await expect
    .poll(() =>
      handle.evaluate(
        (element) =>
          element.closest("aside")?.querySelector<HTMLElement>("[class*='scrollBody']")
            ?.scrollTop ?? 0,
      ),
    )
    .toBeGreaterThan(0)
  const compactGeometry = await handle.evaluate((element) => {
    const body = element.closest("aside")?.querySelector<HTMLElement>("[class*='scrollBody']")
    return {
      contentScrollTop: body?.scrollTop ?? 0,
      dragging: element.closest("aside")?.parentElement?.dataset["dragging"] ?? null,
      height: element.getBoundingClientRect().height,
      y: element.getBoundingClientRect().y,
    }
  })
  expect(compactGeometry.dragging).toBeNull()
  await page.screenshot({ path: testInfo.outputPath("sheet-expanded-after-drag-390x640.png") })

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(handle).toBeHidden()
  const desktopGeometry = await page.evaluate(() => ({
    drawerDragging: document.querySelector("[data-dragging]") !== null,
    drawerVisible:
      document.querySelector<HTMLElement>("[data-testid='food-map-drawer-handle']")
        ?.offsetParent !== null,
  }))
  expect(desktopGeometry).toEqual({ drawerDragging: false, drawerVisible: false })
  await page.screenshot({ path: testInfo.outputPath("desktop-pane-1280x800.png") })
  await testInfo.attach("sheet-surface-geometry", {
    body: Buffer.from(JSON.stringify({ compactGeometry, desktopGeometry }, null, 2)),
    contentType: "application/json",
  })
})

test("Given an interrupted mobile drag, When pointer capture is cancelled, Then the committed stop is restored", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const handle = page.getByTestId("food-map-drawer-handle")
  const toggle = page.getByRole("button", { name: "검색 결과 펼치기", exact: true })
  const initialY = await handle.evaluate((element) => element.getBoundingClientRect().y)
  const box = await toggle.boundingBox()
  if (box === null) throw new Error("cancel drawer toggle geometry missing")
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x, y - 9)
  await page.mouse.move(x, y - 120, { steps: 2 })
  await expect
    .poll(() =>
      handle.evaluate((element) => element.closest("aside")?.parentElement?.dataset["dragging"]),
    )
    .toBe("true")
  await toggle.dispatchEvent("pointercancel", { isPrimary: true, pointerId: 1 })
  await expect
    .poll(() => handle.evaluate((element) => element.getBoundingClientRect().y))
    .toBeCloseTo(initialY, 0)
  const cancellation = await handle.evaluate((element) => ({
    dragging: element.closest("aside")?.parentElement?.dataset["dragging"] ?? null,
    y: element.getBoundingClientRect().y,
  }))
  expect(cancellation.dragging).toBeNull()
  await page.screenshot({ path: testInfo.outputPath("sheet-cancel-restored-375x812.png") })
  await testInfo.attach("sheet-cancel-geometry", {
    body: Buffer.from(JSON.stringify({ initialY, ...cancellation }, null, 2)),
    contentType: "application/json",
  })
})
