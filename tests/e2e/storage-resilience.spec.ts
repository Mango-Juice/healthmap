import type { BrowserContext, Page } from "@playwright/test"
import { expect, test } from "./map-test"

const modes = ["getItem", "removeItem", "setItem"] as const
type Mode = (typeof modes)[number]

const installFailure = async (context: BrowserContext, mode: Mode): Promise<void> => {
  await context.addInitScript((method: Mode) => {
    Reflect.set(globalThis, "task12StorageCalls", 0)
    const original = Storage.prototype[method]
    Object.defineProperty(Storage.prototype, method, {
      configurable: true,
      value(this: Storage, ...values: readonly string[]) {
        if (this === window.sessionStorage) {
          Reflect.set(
            globalThis,
            "task12StorageCalls",
            Number(Reflect.get(globalThis, "task12StorageCalls")) + 1,
          )
          throw new DOMException("storage unavailable", "QuotaExceededError")
        }
        return Reflect.apply(original, this, values)
      },
    })
  }, mode)
}

const openPlace = async (page: Page): Promise<void> => {
  await page.goto("/")
  await page.getByRole("button", { name: "현재 지도 밖 5곳 보기" }).click()
  const place = page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })
  await expect(place).toBeVisible()
  await place.click()
}

for (const mode of modes) {
  test(`current navigation recovers with isolated sessionStorage ${mode} failure`, async ({
    context,
    page,
  }, testInfo) => {
    const pageErrors: string[] = []
    page.on("pageerror", (error) => pageErrors.push(error.message))
    await installFailure(context, mode)
    await openPlace(page)
    await page.getByRole("link", { name: "바뀐 메뉴 알려주기" }).click()
    await expect(page.getByRole("heading", { name: "바뀐 메뉴 알려주기" })).toBeVisible()
    const observation = {
      finalUrl: page.url(),
      mode,
      pageErrors,
      storageCalls: await page.evaluate(() => Reflect.get(globalThis, "task12StorageCalls")),
    }
    expect(observation.pageErrors).toEqual([])
    await testInfo.attach(`storage-${mode}`, {
      body: Buffer.from(JSON.stringify(observation)),
      contentType: "application/json",
    })
  })
}

test("page error collector records an uncaught controlled error", async ({ page }) => {
  const pageErrors: string[] = []
  page.on("pageerror", (error) => pageErrors.push(error.message))
  await page.goto("/")
  await page.evaluate(() =>
    setTimeout(() => {
      throw new Error("task12-controlled-pageerror")
    }, 0),
  )
  await expect.poll(() => pageErrors).toContain("task12-controlled-pageerror")
})
