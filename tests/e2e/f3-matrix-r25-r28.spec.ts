import type { Page, TestInfo } from "@playwright/test"
import { PublicCatalogSnapshotSchema } from "../../lib/domain/catalog"
import { longKoreanTypedStress, typedLongKoreanStressCatalog } from "../fixtures/e2e-catalog"
import { measureTypedStressLayout } from "../fixtures/e2e-typed-stress-layout"
import { expect, test } from "./map-test"

test.describe.configure({ retries: 0 })

const shot = async (page: Page, info: TestInfo, id: string, observed: unknown) => {
  const png = info.outputPath(`attach/${id}.png`)
  const json = info.outputPath(`attach/${id}.json`)
  await page.screenshot({ path: png, fullPage: false })
  const crypto = await import("node:crypto")
  const fs = await import("node:fs/promises")
  const hash = crypto
    .createHash("sha256")
    .update(await fs.readFile(png))
    .digest("hex")
  await fs.writeFile(
    json,
    `${JSON.stringify(
      {
        rowId: id,
        testId: info.title,
        buildId: process.env["F3_BUILD_ID"] ?? "local-dev",
        sourceRef: "tests/e2e/f3-matrix-r25-r28.spec.ts",
        sourceSha256: crypto
          .createHash("sha256")
          .update(await fs.readFile(new URL("./f3-matrix-r25-r28.spec.ts", import.meta.url)))
          .digest("hex"),
        fullManifestRef: ".omo/evidence/f3-final/surface-matrix.json",
        capturedAt: new Date().toISOString(),
        url: page.url(),
        viewport: page.viewportSize(),
        observed,
        screenshotSha256: hash,
        errors: [],
      },
      null,
      2,
    )}\n`,
  )
  await info.attach(`${id}.png`, { contentType: "image/png", path: png })
  await info.attach(`${id}.json`, { contentType: "application/json", path: json })
}

test("R25 exact map share query restores on Escape and Back", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 })
  const path = "/?q=%EC%83%88%EC%8B%B9&tag=vegetables&lat=37.501&lng=127.033&z=15"
  await page.goto(path)
  const result = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  await expect(search).toHaveValue("새싹")
  await result.click()
  await expect(page.getByRole("heading", { name: "새싹 네모식당" })).toBeFocused()
  await page.keyboard.press("Escape")
  const expectedUrl = new URL(path, page.url()).toString()
  await expect(page).toHaveURL(expectedUrl)
  await expect(result).toBeFocused()
  await result.click()
  await page.goBack()
  await expect(page).toHaveURL(expectedUrl)
  await expect(result).toBeFocused()
  await shot(page, info, "R25", { exactQuery: new URL(page.url()).search, focus: "result" })
})

test("R26 typed long Korean and unbroken URL has one scroll owner", async ({
  context,
  page,
}, info) => {
  await context.unroute("**/api/map-catalog")
  await context.route("**/api/map-catalog", (route) =>
    route.fulfill({ contentType: "application/json", json: typedLongKoreanStressCatalog }),
  )
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/map-catalog") && response.request().method() === "GET",
  )
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  const parsed = PublicCatalogSnapshotSchema.parse(await (await responsePromise).json())
  expect(parsed.catalogVersion).toBe(typedLongKoreanStressCatalog.catalogVersion)
  const card = page.getByRole("button", { name: `${longKoreanTypedStress.placeName} 상세 보기` })
  await card.click()
  await expect(page.getByTestId("place-detail-body")).toContainText(longKoreanTypedStress.address)
  const title = page.getByRole("heading", { name: longKoreanTypedStress.placeName })
  const evidence = page.getByTestId("place-detail-body").locator("a").first()
  const address = page.getByText(longKoreanTypedStress.address, { exact: true })
  await address.scrollIntoViewIfNeeded()
  const addressObservation = await page.evaluate(
    (strings) => {
      const rect = (element: Element) => element.getBoundingClientRect().toJSON()
      const titleElement = document.querySelector("#place-detail-title")
      const addressElement = [...document.querySelectorAll("p")].find(
        (element) => element.textContent === strings.address,
      )
      if (titleElement === null || addressElement === undefined)
        throw new Error("R26 text geometry missing")
      return {
        title: strings.title,
        address: strings.address,
        evidenceUrl: strings.url,
        titleRect: rect(titleElement),
        addressRect: rect(addressElement),
        titleInViewport: titleElement.getBoundingClientRect().top >= 0,
        addressInViewport: addressElement.getBoundingClientRect().bottom <= innerHeight,
        documentHorizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      }
    },
    {
      title: longKoreanTypedStress.placeName,
      address: longKoreanTypedStress.address,
      url: longKoreanTypedStress.evidenceUrl,
    },
  )
  await shot(page, info, "R26", { ...addressObservation, frame: "address" })
  await evidence.scrollIntoViewIfNeeded()
  await expect(title).toBeVisible()
  await expect(evidence).toBeVisible()
  await expect(evidence).toHaveAttribute("href", longKoreanTypedStress.evidenceUrl)
  const metrics = await measureTypedStressLayout(page)
  expect(metrics).toEqual({ detailFits: true, documentFits: true, owners: ["place-detail-body"] })
  const urlObservation = await evidence.evaluate((element) => ({
    href: element.getAttribute("href"),
    text: element.textContent,
    rect: element.getBoundingClientRect().toJSON(),
    inViewport:
      element.getBoundingClientRect().top >= 0 &&
      element.getBoundingClientRect().bottom <= innerHeight,
  }))
  await shot(page, info, "R26-url", { ...metrics, ...urlObservation, frame: "url" })
})

test("R27 keyboard focus is visibly assigned to refresh control", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")
  await page.keyboard.press("Tab")
  const refresh = page.getByRole("button", { name: "장소 새로고침" })
  await expect(refresh).toBeFocused()
  const focus = await refresh.evaluate((element) => ({
    outline: getComputedStyle(element).outlineStyle,
    width: element.getBoundingClientRect().width,
    height: element.getBoundingClientRect().height,
  }))
  expect(focus.outline).not.toBe("none")
  expect(focus.width).toBeGreaterThanOrEqual(44)
  await shot(page, info, "R27", focus)
})

test("R28 reduced-motion detail closes and restores focus immediately", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/")
  const card = page.getByRole("button", { name: "새싹 네모식당 상세 보기" })
  await card.click()
  const detail = page.locator("[data-detail-phase]:not([data-testid='map-stage'])")
  await expect(detail).toBeVisible()
  const duration = await detail.evaluate((element) => getComputedStyle(element).transitionDuration)
  expect(["0s", "1e-05s"]).toContain(duration)
  await shot(page, info, "R28", {
    transitionDuration: duration,
    phase: await detail.getAttribute("data-detail-phase"),
    restored: false,
  })
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(card).toBeFocused()
})
