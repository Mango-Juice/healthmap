import type { Page } from "@playwright/test"
import { expect } from "./map-test"

export const readDiscoverySheetGeometry = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>("section[aria-label='건강식 검색 결과']")
    const stack = panel?.parentElement
    const handle = panel?.querySelector<HTMLElement>("[data-testid='food-map-drawer-handle']")
    const toggle = handle?.querySelector("button")
    const content = panel?.lastElementChild
    const body = content?.firstElementChild
    if (!panel || !stack || !handle || !toggle || !content || !body) return null
    const rect = (element: Element) => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }
    return {
      adapter: document.querySelector("[data-adapter-state]")?.getAttribute("data-adapter-state"),
      busy: toggle.getAttribute("aria-busy"),
      expanded: toggle.getAttribute("aria-expanded"),
      dragging: stack.getAttribute("data-dragging"),
      offset: stack.style.getPropertyValue("--hm-food-map-sheet-offset"),
      handle: rect(handle),
      panel: rect(panel),
      content: rect(content),
      body: rect(body),
      bodyScrollHeight: body.scrollHeight,
      runningAnimations: stack
        .getAnimations()
        .filter((animation) => animation.playState === "running").length,
    }
  })

export async function waitForDiscoverySheetGeometry(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const before = await readDiscoverySheetGeometry(page)
        // Let layout, ResizeObserver notifications, and sheet transitions settle
        // before measuring coordinates for raw pointer input.
        await page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        )
        const after = await readDiscoverySheetGeometry(page)
        return (
          after !== null &&
          after.runningAnimations === 0 &&
          JSON.stringify(before) === JSON.stringify(after)
        )
      },
      { message: "sheet geometry must settle before pointer input" },
    )
    .toBe(true)
}

export async function waitForDiscoverySheetReady(page: Page): Promise<void> {
  // A visible server-rendered button can precede hydration. These existing
  // client-driven states establish that both event handlers and results are ready.
  await expect(page.getByTestId("food-map-stage")).toHaveAttribute("data-adapter-state", "ready")
  await expect(
    page.getByTestId("food-map-drawer-handle").getByRole("button").first(),
  ).toHaveAttribute("aria-busy", "false")
  // The collapsed drawer intentionally hides cards visually.
  await expect(page.locator("[data-food-map-place-id]").first()).toBeAttached()
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  await waitForDiscoverySheetGeometry(page)
}
