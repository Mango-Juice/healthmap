import { expect, test } from "../e2e/map-test"

test("canonical legacy filter is represented and can be reset without changing its meaning", async ({
  page,
}) => {
  // Given: real legacy fixture rows behind the browser catalog test boundary.
  await page.goto("/?q=&tag=vegetables&lat=37.5&lng=127.0328&z=15")
  const category = page.getByRole("combobox", { name: "식사 형태·선택", exact: true })
  // When: the canonical legacy condition is restored.
  await expect(category).toHaveValue("vegetables")
  // Then: the selected label and filtered rows agree, and reset preserves available legacy choices without filtering the results.
  await expect(category.locator("option:checked")).toHaveText("채소")
  const rows = page.getByRole("list", { name: "검색 결과", exact: true }).getByRole("listitem")
  await expect(rows).toHaveCount(4)
  await category.selectOption("all")
  await expect(category).toHaveValue("all")
  await expect(category.locator('option[value="vegetables"]')).toHaveCount(1)
  await expect(rows).toHaveCount(5)
  await page.screenshot({ path: ".omo/evidence/task7-ui/legacy-reset.png" })
})
