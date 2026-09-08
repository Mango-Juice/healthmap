import { expect, test } from "@playwright/test"

test("ownership verification tags are in the initial home head for search crawlers", async ({
  request,
}) => {
  for (const userAgent of ["Googlebot", "Yeti"]) {
    const response = await request.get("/", { headers: { "User-Agent": userAgent } })
    expect(response.status()).toBe(200)
    const html = await response.text()
    const head = html.slice(html.indexOf("<head>"), html.indexOf("</head>"))
    expect(head).toContain(
      '<meta name="google-site-verification" content="YrP6a4GSewvHaif-9CGokegbtJMysU_bsVERahsg5GY"',
    )
    expect(head).toContain(
      '<meta name="naver-site-verification" content="813b4ad69fdf623007de48959fe781048e6d3aec"',
    )
  }
})

for (const path of ["/about", "/privacy", "/showcase"]) {
  test(`${path} is unpublished and excluded from indexing`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(404)
    await expect(
      page.getByRole("heading", { level: 1, name: "장소를 찾을 수 없어요" }),
    ).toBeVisible()
    expect(
      await page
        .locator('meta[name="robots"]')
        .evaluateAll((elements) =>
          elements.some((element) => element.getAttribute("content")?.includes("noindex")),
        ),
    ).toBe(true)
    await page.getByRole("link", { name: "건강식 지도 돌아가기" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "건강식 지도" })).toBeVisible()
  })
}

test("home metadata, crawler rules and sitemap agree on the public scope", async ({
  page,
  request,
}) => {
  const robots = await request.get("/robots.txt")
  const sitemap = await request.get("/sitemap.xml")
  expect(robots.status()).toBe(200)
  expect(sitemap.status()).toBe(200)
  expect(robots.headers()["content-type"]).toContain("text/plain")
  expect(sitemap.headers()["content-type"]).toContain("application/xml")
  const rules = await robots.text()
  const xml = await sitemap.text()
  const indexable = rules.includes("Allow: /")

  const response = await page.goto("/")
  expect(response?.status()).toBe(200)
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    indexable ? "index, follow" : "noindex, nofollow",
  )
  const canonical = await page.locator('link[rel="canonical"]').getAttribute("href")
  expect(canonical).toBeTruthy()
  if (!canonical) throw new Error("Home canonical URL missing")
  if (indexable) {
    expect(xml.match(/<loc>/g)).toHaveLength(1)
    expect(xml).toContain(`<loc>${new URL("/", canonical).href}</loc>`)
    expect(rules).toContain(`Sitemap: ${new URL("/sitemap.xml", canonical).href}`)
  } else {
    expect(rules).toContain("Disallow: /")
    expect(xml).not.toContain("<loc>")
  }
  await expect(
    page.locator('a[href="/about"], a[href="/privacy"], a[href="/showcase"]'),
  ).toHaveCount(0)
  const suggestion = await request.get("/suggest")
  expect(suggestion.status()).toBe(200)
  expect(await suggestion.text()).toContain('name="robots" content="noindex, nofollow"')
})

for (const viewport of [
  { width: 375, height: 812 },
  { width: 1280, height: 800 },
]) {
  test(`home search landmarks and headings fit at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport)
    await page.goto("/")
    await expect(page.getByRole("main")).toHaveCount(1)
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1)
    const search = page.getByRole("search", { name: "가게와 메뉴" })
    await expect(search.getByRole("searchbox", { name: "가게나 메뉴 검색" })).toBeVisible()
    await expect(page.getByRole("region", { name: "건강식 검색 결과", exact: true })).toBeAttached()
    await expect(
      page.getByRole("heading", { level: 2, name: "검색 결과", includeHidden: true }),
    ).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    await page.screenshot({ path: testInfo.outputPath(`seo-home-${viewport.width}.png`) })
  })
}
