import { expect, serverTest as test } from "../e2e/map-test"

const evidence = ".omo/evidence/task7-ui"
for (const width of [375, 768, 1280]) {
  test(`public v2 menu discovery and visit actions at ${width}px`, async ({ page, context }) => {
    // Given: an explicitly labelled local provider fixture, with location denied.
    await page.setViewportSize({ width, height: 900 })
    await context.addInitScript(() =>
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
            failure({
              code: 1,
              message: "test denied",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            }),
        },
      }),
    )
    await page.goto("/")
    await expect(page.getByLabel("지역 선택", { exact: true })).toBeVisible()
    await expect(page.locator("[data-test-naver-marker]")).toHaveCount(0)
    await page.screenshot({ path: `${evidence}/regions-${width}.png` })
    // When: choose a region, then the matching same-menu ingredient and cooking.
    const region = page.getByLabel("지역 선택", { exact: true })
    await region.selectOption({ index: 1 })
    await expect(
      page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
    ).toHaveCount(50)
    await expect(
      page
        .getByRole("combobox", { name: "식사 형태·선택", exact: true })
        .locator('option[value="vegetables"], option[value="protein"], option[value="balanced"]'),
    ).toHaveCount(0)
    await page.getByRole("combobox", { name: "재료", exact: true }).selectOption("fish")
    await page.getByRole("combobox", { name: "조리", exact: true }).selectOption("grilled")
    await expect(page.getByRole("button", { name: /더 보기/ })).toBeVisible()
    await page.screenshot({ path: `${evidence}/results-${width}.png` })
    await page.getByRole("button", { name: /더 보기/ }).click()
    await expect(
      page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
    ).toHaveCount(55)
    await page.getByRole("button", { name: "공개 쿼리 시험 0 상세 보기", exact: true }).click()
    // Then: public detail preserves real menu facts, phone, NAVER view, and no review metadata.
    await expect(page.getByTestId("place-detail")).toBeVisible()
    await expect(
      page.getByTestId("place-detail").getByRole("link", { name: "네이버에서 보기" }),
    ).toHaveAttribute("href", /map.naver.com\/p\/entry\/place/)
    await expect(page.getByTestId("place-detail")).not.toContainText("검증 근거 보기")
    await expect(page.locator('[data-detail-phase="open"]').first()).toBeVisible()
    await expect(page.getByTestId("place-detail-body")).toBeInViewport()
    await page.screenshot({ path: `${evidence}/detail-${width}.png` })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole("button", { name: "검색 결과로 돌아가기", exact: true }).click()
    await expect(
      page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
    ).toHaveCount(55)
  })
}

test("latest public search wins over a delayed response", async ({ page, context }) => {
  // Given: controlled request ordering at the real public HTTP boundary.
  await context.addInitScript(() =>
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (_success: PositionCallback, failure: PositionErrorCallback) =>
          failure({
            code: 1,
            message: "test denied",
            PERMISSION_DENIED: 1,
            POSITION_UNAVAILABLE: 2,
            TIMEOUT: 3,
          }),
      },
    }),
  )
  let release: (() => void) | undefined
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route("**/api/map-catalog/query?**", async (route) => {
    if (new URL(route.request().url()).searchParams.get("query") === "delayed-no-match") await held
    await route.continue()
  })
  await page.goto("/")
  const search = page.getByRole("searchbox", { name: "장소와 메뉴 검색" })
  const delayed = page.waitForRequest(
    (request) => new URL(request.url()).searchParams.get("query") === "delayed-no-match",
  )
  await search.fill("delayed-no-match")
  await delayed
  const aborted = page.waitForEvent(
    "requestfailed",
    (request) => new URL(request.url()).searchParams.get("query") === "delayed-no-match",
  )
  // When: a newer search returns before the delayed old request.
  await search.fill("생선구이")
  await expect(
    page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
  ).toHaveCount(50)
  release?.()
  expect((await aborted).failure()?.errorText).toContain("ERR_ABORTED")
  // Then: the newer result set and user input remain authoritative.
  await expect(search).toHaveValue("생선구이")
  await expect(
    page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem"),
  ).toHaveCount(50)
  await page.screenshot({ path: `${evidence}/latest-response.png` })
})

test("public detail shows branch limits, search label, phone, and survives media failure", async ({
  page,
}) => {
  // Given: an explicitly labelled public fixture variant at the HTTP boundary.
  await page.route("**/api/map-catalog/query?**", async (route) => {
    const response = await route.fetch()
    const body = PublicCatalogQueryResponseSchema.parse(await response.json())
    await route.fulfill({
      json: {
        ...body,
        places: body.places.map(publicPlaceVariant),
        menus: body.menus.map(publicMenuVariant),
      },
    })
  })
  await page.route("**/api/map-catalog/places/**", async (route) => {
    const response = await route.fetch()
    const body = PublicPlaceDetailResponseSchema.parse(await response.json())
    await route.fulfill({
      json: {
        ...body,
        place: publicPlaceVariant(body.place),
        menus: body.menus.map(publicMenuVariant),
      },
    })
  })
  await page.route("https://www.salady.com/public-test.png", (route) => route.abort())
  await page.goto("/")
  await page.getByRole("searchbox", { name: "장소와 메뉴 검색" }).fill("생선구이")
  await page.getByRole("button", { name: "공개 쿼리 시험 0 상세 보기", exact: true }).click()
  // When: detail renders an unconfirmed branch-common menu with a failed optional image.
  const detail = page.getByTestId("place-detail")
  await expect(detail).toContainText("브랜드 공통 메뉴 · 지점별 판매 확인 필요")
  // Then: availability is qualified and visit actions remain accurate and usable.
  await expect(detail.getByRole("link", { name: "네이버에서 검색", exact: true })).toHaveAttribute(
    "href",
    /\/p\/search\//,
  )
  await expect(detail.getByRole("link", { name: "051-000-0000 전화하기" })).toHaveAttribute(
    "href",
    "tel:051-000-0000",
  )
  await expect(detail.locator("img")).toHaveCount(0)
  await expect(detail.getByRole("button", { name: "길찾기", exact: true })).toBeEnabled()
  await expect(page.locator('[data-detail-phase="open"]').first()).toBeVisible()
  await page.screenshot({ path: `${evidence}/branch-common-media-failure.png` })
})

import {
  PublicCatalogQueryResponseSchema,
  PublicPlaceDetailResponseSchema,
} from "../../lib/catalog/query-contract"
import type { Menu, Place } from "../../lib/domain/catalog"

const publicPlaceVariant = (place: Place): Place =>
  place.schemaVersion === "2.0.0"
    ? {
        ...place,
        phone: "051-000-0000",
        brandId: "test-brand",
        brandVariant: null,
        naverPlaceUrl: `https://map.naver.com/p/search/${encodeURIComponent(`${place.name} ${place.address}`)}`,
        media: [
          {
            url: "https://www.salady.com/public-test.png",
            sourceUrl: "https://www.salady.com",
            alt: "공개 시험 메뉴 이미지",
            scope: "brand" as const,
            usageApproved: true as const,
          },
        ],
      }
    : place
const publicMenuVariant = (menu: Menu): Menu =>
  menu.schemaVersion === "2.0.0"
    ? {
        ...menu,
        branchApplicability: "brand_common_unverified" as const,
        brandId: "test-brand",
        brandVariant: null,
      }
    : menu
