import {
  catalogQueryPattern,
  emptyQueryCatalog,
  fulfillCatalogQuery,
} from "./catalog-query-fixture"
import { expect, test } from "./map-test"

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 5,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.5007,
              longitude: 127.0328,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          }),
      },
    })
  })
})

for (const scenario of [
  { name: "denied", code: 1 },
  { name: "timeout", code: 3 },
] as const) {
  test(`shows the national map for ${scenario.name} location`, async ({ page }) => {
    await page.addInitScript(({ code }) => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (
            _success: PositionCallback,
            failure: PositionErrorCallback,
            options?: PositionOptions,
          ) => {
            sessionStorage.setItem("geo-options", JSON.stringify(options))
            failure({
              code,
              message: "test",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            })
          },
        },
      })
    }, scenario)
    await page.goto("/")
    await expect(page.locator(`[data-location-state="${scenario.name}"]`)).toBeVisible()
    await expect(page.getByTestId("map-view")).toContainText("36.2000, 127.8000")
    await expect(page.getByRole("img", { name: "내 위치" })).toHaveCount(0)
  })
}
test("shows the national map when geolocation is unsupported", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined })
  })
  await page.goto("/")
  await expect(page.locator('[data-location-state="unsupported"]')).toBeVisible()
  await expect(page.getByTestId("map-view")).toContainText("36.2000, 127.8000")
})
test("covers every filter and keyboard marker selection", async ({ page }) => {
  await page.goto("/")
  for (const [label, count] of [
    ["샐러드·포케", 0],
    ["밥·정식", 0],
    ["잡곡·현미", 0],
    ["채식 표기", 2],
    ["면", 0],
    ["국·탕", 0],
    ["샌드위치", 0],
    ["주요리", 0],
    ["전체", 5],
  ] as const) {
    await page.getByRole("combobox", { name: "식사 형태·선택" }).selectOption({ label })
    await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(count)
  }
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await marker.focus()
  await expect(marker).toBeFocused()
  await marker.press("Enter")
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
})
test("constructs a NAVER map after SDK failure and retry", async ({ page }) => {
  let attempts = 0
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    attempts += 1
    if (attempts === 1) return route.abort()
    await route.fulfill({
      contentType: "text/javascript",
      body: `(()=>{class LatLng{}class Map{constructor(el){this.el=el;el.innerHTML='<canvas data-fake-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}class Marker{constructor({map,title}){this.el=document.createElement('button');this.el.type='button';this.el.setAttribute('aria-label',title);map.el.append(this.el)}setOptions(options){if(options.title!==undefined)this.el.setAttribute('aria-label',options.title);if(options.icon!==undefined)this.el.dataset.markerIcon=options.icon;if(options.zIndex!==undefined){this.el.dataset.markerZIndex=String(options.zIndex);this.el.style.zIndex=String(options.zIndex)}if(options.position){this.el.dataset.latitude=String(options.position.latitude);this.el.dataset.longitude=String(options.position.longitude);this.el.style.left=String(15+((options.position.longitude-127.02)/.03)*70)+'%';this.el.style.top=String(25+((37.51-options.position.latitude)/.02)*50)+'%'}}setMap(map){if(map===null)this.el.remove()}}const Event={addListener(target,name,listener){if(name==='tilesloaded')queueMicrotask(listener);if(name==='click'&&target.el)target.el.addEventListener('click',listener);return{target,name,listener}},removeListener(){}};window.naver={maps:{LatLng,Map,Marker,Event}}})()`,
    })
  })
  await page.goto("/")
  await expect(page.getByText("NAVER 지도를 불러올 수 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "다시 시도" }).click()
  await expect(page.getByTestId("map-stage")).toHaveAttribute("data-adapter-state", "ready")
  await expect(page.locator("canvas[data-fake-naver-map]")).toBeVisible()
})
test("recovers catalog failure and supports empty catalog", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toHaveCount(0)
  let attempts = 0
  await page.route(catalogQueryPattern, async (route) => {
    attempts += 1
    if (attempts === 1) return route.fulfill({ status: 503 })
    if (attempts === 2) return fulfillCatalogQuery(route, emptyQueryCatalog)
    await fulfillCatalogQuery(route)
  })
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await page.getByRole("button", { name: /다시 시도/ }).click()
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
})
test("keeps map markers interactive while catalog refresh loads or fails", async ({ page }) => {
  // Given
  await page.goto("/")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toHaveCount(0)
  const requests: import("@playwright/test").Route[] = []
  await page.route(catalogQueryPattern, async (route) => {
    requests.push(route)
  })

  // When
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(1)

  // Then
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toBeVisible()
  const marker = page.getByTestId("naver-map").getByRole("button", { name: "새싹 네모식당" })
  await expect(marker).toBeVisible()
  await marker.press("Enter")
  await expect(page.getByText("장소를 선택했습니다.")).toBeVisible()
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await expect(marker).toBeVisible()
})
test("rejects malformed catalog and ignores stale rapid refresh", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(5)
  await expect(page.getByText("장소 데이터를 불러오는 중입니다.")).toHaveCount(0)
  const requests: import("@playwright/test").Route[] = []
  await page.route(catalogQueryPattern, async (route) => {
    requests.push(route)
  })
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(2)
  const emptyRequest = requests[1]
  if (emptyRequest === undefined) throw new TypeError("Missing empty query request")
  await fulfillCatalogQuery(emptyRequest, emptyQueryCatalog)
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await requests[0]?.fulfill({ status: 503 })
  await expect(page.getByText("표시할 장소가 없습니다.")).toBeVisible()
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toHaveCount(0)
  await page.getByRole("button", { name: "장소 새로고침" }).click()
  await expect.poll(() => requests.length).toBe(3)
  await requests[2]?.fulfill({ contentType: "application/json", json: emptyQueryCatalog })
  await expect(page.getByText("장소 데이터를 불러오지 못했습니다.")).toBeVisible()
  await expect(page.locator('[data-test-naver-marker="true"]')).toHaveCount(0)
})
