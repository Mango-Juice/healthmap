import { access, readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve } from "node:path"

const documentPath = process.argv[2]
if (!documentPath) {
  console.error("usage: node scripts/docs/check-operations.mjs <markdown>")
  process.exit(2)
}

const root = resolve(new URL("../..", import.meta.url).pathname)
const absoluteDocumentPath = resolve(root, documentPath)
let markdown
try {
  markdown = await readFile(absoluteDocumentPath, "utf8")
} catch {
  console.error("RED operations document is missing or unreadable")
  process.exit(1)
}

const headings = [...markdown.matchAll(/^(#{1,6})\s+(.+?)\s*#*\s*$/gm)].map((match) => ({
  level: match[1].length,
  text: match[2].trim(),
}))
const headingText = headings.map(({ text }) => text.toLowerCase())
const tables = markdown.split("\n").filter((line) => /^\s*\|.+\|\s*$/.test(line))
const codeBlocks = [...markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1])
const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1])

const requiredSections = [
  "environment",
  "local",
  "preview",
  "production",
  "supabase",
  "naver",
  "posthog",
  "smoke",
  "rollback",
  "incident",
  "data import",
]
const requiredTerms = [
  ["secret handling", /service[._-]?role|secret|server[._-]?only/i],
  ["production-only catalog", /production.catalog only|only production rows/i],
  [
    "atomic production import",
    /complete dataset.{0,100}(transaction|commit)|transaction.{0,100}(complete|partial)/i,
  ],
  ["native coordinate markers", /native default marker.{0,120}supabase coordinate/i],
  ["NAVER allowlist", /allowed.domain|allowlist|allowed origin/i],
  ["PostHog privacy", /posthog.{0,120}(privacy|autocapture|person_profiles|session recording)/i],
]
const requiredCommands = [
  "pnpm build",
  "pnpm start",
  "pnpm supabase:start",
  "pnpm supabase:status",
  "pnpm supabase:reset",
  "pnpm supabase:stop",
  "pnpm test:integration:local",
  "curl -i",
]
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
const packageScripts = new Set(Object.keys(packageJson.scripts))
const failures = []
for (const section of requiredSections) {
  if (!headingText.some((heading) => heading.includes(section))) failures.push(`section:${section}`)
}
for (const [name, pattern] of requiredTerms) {
  if (!pattern.test(markdown)) failures.push(`content:${name}`)
}
if (tables.length < 2) failures.push("structure:environment tables")
if (codeBlocks.length < 3) failures.push("structure:code blocks")
for (const command of requiredCommands) {
  if (!markdown.includes(command)) failures.push(`command:${command}`)
}
for (const match of markdown.matchAll(/pnpm\s+([a-z0-9:_-]+)/g)) {
  const script = match[1]
  if (!packageScripts.has(script) && !["install", "exec", "add", "update", "dlx"].includes(script))
    failures.push(`stale-script:${script}`)
}
for (const link of links) {
  if (/^(https?:|mailto:|#)/i.test(link)) continue
  const target = link.split("#", 1)[0]
  const targetPath = isAbsolute(target) ? target : resolve(absoluteDocumentPath, "..", target)
  try {
    await access(targetPath)
  } catch {
    failures.push(`broken-link:${relative(root, targetPath)}`)
  }
}
for (const match of markdown.matchAll(
  /`((?:app|components|data|lib|scripts|supabase|tests|\.env[^`]*)[^`]*)`/g,
)) {
  const candidate = match[1].split(/\s|[,;:)]/)[0]
  if (!candidate.includes("/") && !candidate.startsWith(".")) continue
  if (candidate.startsWith(".env") || candidate.includes("<") || candidate.includes("=")) continue
  try {
    await access(resolve(root, candidate))
  } catch {
    failures.push(`missing-path:${candidate}`)
  }
}
const result = {
  headings: headings.length,
  tables: tables.length,
  codeBlocks: codeBlocks.length,
  links: links.length,
  status: failures.length === 0 ? "PASS" : "FAIL",
  failures,
}
console.log(JSON.stringify(result, null, 2))
if (failures.length > 0) process.exit(1)
