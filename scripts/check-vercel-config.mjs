import { existsSync, readFileSync } from "node:fs"

const vercelConfigUrl = new URL("../vercel.json", import.meta.url)
const packageJsonUrl = new URL("../package.json", import.meta.url)

if (!existsSync(vercelConfigUrl)) {
  console.error("Vercel configuration is missing: vercel.json")
  process.exitCode = 1
} else {
  const vercelConfig = JSON.parse(readFileSync(vercelConfigUrl, "utf8"))
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8"))
  const failures = []

  if (vercelConfig.$schema !== "https://openapi.vercel.sh/vercel.json") {
    failures.push("vercel.json must use the official Vercel schema")
  }

  if (vercelConfig.framework !== "nextjs") {
    failures.push("vercel.json must select the Next.js framework preset")
  }

  if (vercelConfig.installCommand !== "pnpm install --frozen-lockfile") {
    failures.push("Vercel must install with the committed pnpm lockfile")
  }

  if (vercelConfig.buildCommand !== "pnpm build") {
    failures.push("Vercel must use the repository build command")
  }

  const headerRules = vercelConfig.headers
  const expectedHeaders = new Map([
    ["X-Content-Type-Options", "nosniff"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["X-Frame-Options", "SAMEORIGIN"],
  ])
  const configuredHeaders = new Map(
    headerRules?.flatMap((rule) =>
      rule.source === "/(.*)" ? rule.headers.map((header) => [header.key, header.value]) : [],
    ) ?? [],
  )
  for (const [name, value] of expectedHeaders) {
    if (configuredHeaders.get(name) !== value) {
      failures.push(`Vercel must set ${name}=${value} for all routes`)
    }
  }

  if (packageJson.engines?.node !== ">=22 <23") {
    failures.push("package.json must constrain Vercel builds to Node.js 22")
  }

  if (packageJson.packageManager !== "pnpm@10.19.0") {
    failures.push("package.json must pin pnpm 10.19.0")
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure)
    }
    process.exitCode = 1
  } else {
    console.log("Vercel install, build, framework, and runtime contract is valid")
  }
}
