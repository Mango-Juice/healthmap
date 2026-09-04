import fs from "node:fs/promises"
import { chromium } from "@playwright/test"

const icon = await fs.readFile(new URL("../../app/icon.svg", import.meta.url), "utf8")
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  const renderIcon = async (size) => {
    await page.setViewportSize({ width: size, height: size })
    await page.setContent(
      `<style>body{margin:0}svg{display:block;width:100%;height:100%}</style>${icon}`,
    )
    return page.screenshot({ omitBackground: true })
  }
  const png = await renderIcon(32)
  const header = Buffer.alloc(22)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(1, 4)
  header[6] = 32
  header[7] = 32
  header.writeUInt16LE(1, 10)
  header.writeUInt16LE(32, 12)
  header.writeUInt32LE(png.length, 14)
  header.writeUInt32LE(22, 18)
  await fs.writeFile(
    new URL("../../app/favicon.ico", import.meta.url),
    Buffer.concat([header, png]),
  )
  await fs.writeFile(new URL("../../app/apple-icon.png", import.meta.url), await renderIcon(180))
  await page.setViewportSize({ width: 1200, height: 630 })
  await page.setContent(`<!doctype html><html lang="ko"><style>
    *{box-sizing:border-box}body{margin:0;background:#fffdf8;color:#17231c;font-family:"Apple SD Gothic Neo","Noto Sans KR",sans-serif}
    main{width:1200px;height:630px;padding:68px 72px;display:flex;align-items:center;justify-content:space-between;gap:44px;border-bottom:16px solid #18563b}
    .copy{flex:1}h1{font-size:78px;line-height:1.15;margin:0 0 28px;font-weight:800}
    p{font-size:38px;line-height:1.5;color:#536159;margin:0;word-break:keep-all}
    .topics{font-size:24px;line-height:1.5;margin-top:48px;color:#18563b;font-weight:600}
    .mark{width:316px;flex:0 0 316px}.mark svg{width:100%;display:block}
  </style><main><div class="copy"><h1>건강식 지도</h1><p>잘 먹고 싶은 날,<br>가까운 한 끼부터.</p><div class="topics">샐러드 · 포케 · 구이 · 잡곡</div></div><div class="mark">${icon}</div></main></html>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({
    path: new URL("../../app/opengraph-image.png", import.meta.url).pathname,
  })
} finally {
  await browser.close()
}
