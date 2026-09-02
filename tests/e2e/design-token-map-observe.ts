import type { BrowserContext, Page } from "@playwright/test"
import {
  type CaptureFacts,
  type CaptureReceipt,
  type ErrorRecords,
  TRIGGER_NAME,
} from "./design-token-map-types"
import { expect } from "./map-test"

type ObservedMapState = Pick<
  CaptureReceipt,
  "focus" | "geometry" | "scroll" | "statusError" | "targetSizes" | "tokens"
>

export const installNoGeolocation = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: () => undefined },
    })
  })
}
export const waitForDetail = async (page: Page): Promise<void> => {
  await expect(
    page.locator("[data-detail-phase='open']:not([data-testid='map-stage'])"),
  ).toBeVisible()
  await expect(page.getByTestId("place-detail")).toBeVisible()
}
export const attachErrorRecorders = (page: Page): ErrorRecords => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => pageErrors.push(error.message))
  return { consoleErrors, pageErrors }
}
export const observeMap = async (page: Page, facts: CaptureFacts): Promise<ObservedMapState> =>
  page.evaluate(({ statusRuleReferencesSpace8, tokenNames }) => {
    const region = document.querySelector<HTMLElement>('[aria-label="건강식 지도"]')
    if (region === null) throw new Error("DS-01 map region missing")
    const named = {
      detail: document.querySelector("[data-testid='place-detail']"),
      detailBody: document.querySelector("[data-testid='place-detail-body']"),
      error: document.querySelector<HTMLElement>("[data-tone='error'][role='alert']"),
      header: region.querySelector("header"),
      map: document.querySelector("[data-testid='map-stage']"),
      naverMap: document.querySelector("[data-testid='naver-map']"),
      status: region.querySelector('[aria-live="polite"]'),
    }
    const rectangle = (element: Element | null) => {
      if (element === null) return null
      const value = element.getBoundingClientRect()
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      }
    }
    const measureScroll = (element: Element | null) => {
      if (!(element instanceof HTMLElement)) return null
      return {
        clientHeight: element.clientHeight,
        overflowY: getComputedStyle(element).overflowY,
        scrollHeight: element.scrollHeight,
      }
    }
    const candidates = [
      { element: document.body, name: "body" },
      { element: named.detail, name: "detail" },
      { element: named.detailBody, name: "detailBody" },
      { element: document.documentElement, name: "documentElement" },
      { element: named.map, name: "map" },
      { element: region, name: "region" },
    ].flatMap(({ element, name }) => {
      const measurement = measureScroll(element)
      return measurement === null ? [] : [{ measurement, name }]
    })
    const owners = candidates
      .filter(({ measurement }) => ["auto", "scroll"].includes(measurement.overflowY))
      .map(({ name }) => name)
    const overflowingOwners = candidates
      .filter(
        ({ measurement }) =>
          measurement.scrollHeight > measurement.clientHeight &&
          ["auto", "scroll"].includes(measurement.overflowY),
      )
      .map(({ name }) => name)
    const styles = getComputedStyle(region)
    const controls = [...region.querySelectorAll<HTMLElement>("button, a")]
      .filter(
        (element) =>
          element.dataset["testNaverMarker"] !== "true" &&
          getComputedStyle(element).visibility !== "hidden" &&
          getComputedStyle(element).display !== "none",
      )
      .map((element) => {
        const value = element.getBoundingClientRect()
        return {
          accessibleName: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "",
          height: value.height,
          tagName: element.tagName,
          width: value.width,
        }
      })
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const errorStyle = named.error === null ? null : getComputedStyle(named.error)
    return {
      focus: {
        accessibleName: active?.getAttribute("aria-label") ?? active?.textContent?.trim() ?? "",
        tagName: active?.tagName ?? "",
      },
      geometry: Object.fromEntries(
        Object.entries(named).map(([name, element]) => [name, rectangle(element)]),
      ),
      scroll: {
        documentOverflow: document.documentElement.scrollWidth > window.innerWidth,
        overflowingOwners,
        owners,
        regions: Object.fromEntries(candidates.map(({ measurement, name }) => [name, measurement])),
      },
      statusError:
        errorStyle === null
          ? null
          : {
              mapScopeSpace8: styles.getPropertyValue("--hm-space-8").trim(),
              maxInlineSize: errorStyle.maxInlineSize,
              referencesSpace8: statusRuleReferencesSpace8,
            },
      targetSizes: controls,
      tokens: Object.fromEntries(
        tokenNames.map((name) => [name, styles.getPropertyValue(name).trim()]),
      ),
    }
  }, facts)
export const verifyInterruptions = async (page: Page): Promise<void> => {
  const trigger = page.getByRole("button", { name: TRIGGER_NAME })
  await page.getByRole("button", { name: "검색 결과로 돌아가기" }).click()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.press("Enter")
  await waitForDetail(page)
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await trigger.press("Enter")
  await waitForDetail(page)
  await page.goBack()
  await expect(page.getByTestId("place-detail")).toHaveCount(0)
  await expect(trigger).toBeFocused()
}
export const probeLongCjkUrl = async (
  page: Page,
): Promise<
  Readonly<{
    readonly available: boolean
    readonly detailHorizontalOverflow: boolean
    readonly pageHorizontalOverflow: boolean
  }>
> => {
  const probe = await page.evaluate(() => {
    const links = [...document.querySelectorAll<HTMLElement>("[data-testid='place-detail-body'] a")]
    const body = document.querySelector<HTMLElement>("[data-testid='place-detail-body']")
    if (links.length === 0 || body === null)
      return { available: false, detailHorizontalOverflow: false, pageHorizontalOverflow: false }
    for (const link of links)
      link.textContent =
        "긴 한글 검증 근거 https://sources.example.test/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    return {
      available: true,
      detailHorizontalOverflow: body.scrollWidth > body.clientWidth,
      pageHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    }
  })
  if (probe.available) {
    expect(probe.detailHorizontalOverflow).toBe(false)
    expect(probe.pageHorizontalOverflow).toBe(false)
  }
  return probe
}
export const installAuthorizationFailure = async (page: Page): Promise<void> => {
  await page.route("https://oapi.map.naver.com/**", async (route) => {
    await route.fulfill({
      body: "(()=>{const Event={addListener(){return{}},removeListener(){}};class Map{constructor(element){element.innerHTML=''}setCenter(){}setZoom(){}destroy(){}}window.naver={maps:{LatLng:class{},Event,Map}};setTimeout(()=>window.navermap_authFailure?.(),0)})()",
      contentType: "text/javascript",
    })
  })
}
