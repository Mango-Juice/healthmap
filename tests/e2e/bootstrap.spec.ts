import { expect, test } from "@playwright/test"

test("Given the application is running, When the root page opens, Then the health map shell is visible", async ({
  page,
}) => {
  await page.goto("/")

  await expect(page.getByRole("heading", { level: 1, name: "건강식 지도" })).toBeVisible()
})
