import { expect, test } from "./map-test"

test("Given a synthetic menu-backed place, when its detail suggestion action is followed, then the proposal page keeps selected context", async ({
  page,
}) => {
  await page.goto("/")
  const place = page.getByRole("button", { name: "새싹 네모식당 자세히 보기" })
  await expect(place).toBeVisible()

  // When the user follows the selected place's suggestion action.
  await place.click()
  await page.getByRole("link", { name: "바뀐 메뉴 알려주기" }).click()

  // Then the server-resolved context is visible on the proposal page.
  await expect(page).toHaveURL(/\/suggest\?placeId=6dd657be-fc3b-4bb8-8e67-fabbee0f2e01$/u)
  await expect(page.getByRole("heading", { name: "바뀐 메뉴 알려주기" })).toBeVisible()
  await expect(page.getByText("새싹 네모식당", { exact: true })).toBeVisible()
  await expect(page.getByText("서울 강남구 테스트로 1", { exact: true })).toBeVisible()
})
