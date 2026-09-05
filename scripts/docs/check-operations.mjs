import { access, readdir, readFile } from "node:fs/promises"
import { isAbsolute, relative, resolve, sep } from "node:path"

const root = resolve(new URL("../..", import.meta.url).pathname)
const publicDocuments = [
  "README.md",
  "DESIGN.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/README.md",
  "docs/architecture.md",
  "docs/development.md",
  "docs/security.md",
]
const requiredContent = [
  ["README.md", "product summary", /건강식 지도/],
  ["README.md", "service link", /https:\/\/healthmap-hazel\.vercel\.app/],
  ["README.md", "source-viewing notice", /LICENSE/],
  ["docs/architecture.md", "immutable release", /immutable|불변/i],
  ["docs/architecture.md", "bounded query", /bounded|제한된/i],
  ["docs/architecture.md", "validated cache", /검증.*캐시|cache.*valid/i],
  ["docs/architecture.md", "safe intake", /제안|suggestion/i],
  ["docs/architecture.md", "focus restoration", /focus|포커스/i],
  ["docs/development.md", "install command", /pnpm install/],
  ["docs/development.md", "development command", /pnpm dev/],
  ["docs/development.md", "test command", /pnpm test/],
  ["docs/security.md", "reporting guidance", /report|신고|제보/i],
  ["docs/security.md", "no public contact claim", /공개.*연락|public.*contact/i],
]
const forbiddenContent = [
  ["absolute-local-path", /\/Users\//],
  ["private-archive-reference", /healthmap-private|\$PRIVATE|(?:^|[^A-Z])PRIVATE\//],
  ["private-worktree-reference", /\.local-work/],
  ["operator-schema-or-id", /suggestion_admin|dudckqsbpewtnqrbugcf|HEALTHMAP_PUBLICATION_APP_ROOT/],
  [
    "source-collection-material",
    /acquisition (?:method|recipe)|extraction recipe|source-response analysis/i,
  ],
]
const allowedPnpmCommands = new Set(["install", "exec", "add", "update", "dlx"])
const isInsideRoot = (path) => path === root || path.startsWith(`${root}${sep}`)
const linksIn = (markdown) =>
  [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1])

const documentArgument = process.argv[2]
const documents = documentArgument ? [documentArgument] : publicDocuments
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"))
const packageScripts = new Set(Object.keys(packageJson.scripts))
const failures = []
const inspected = []

for (const documentPath of documents) {
  const absoluteDocumentPath = resolve(root, documentPath)
  let markdown
  try {
    markdown = await readFile(absoluteDocumentPath, "utf8")
  } catch {
    failures.push(`missing-document:${documentPath}`)
    continue
  }
  inspected.push(documentPath)
  for (const [name, pattern] of forbiddenContent) {
    if (pattern.test(markdown)) failures.push(`private-content:${documentPath}:${name}`)
  }
  for (const link of linksIn(markdown)) {
    if (/^(https?:|mailto:|#)/i.test(link)) continue
    const target = link.split("#", 1)[0]
    const targetPath = isAbsolute(target)
      ? resolve(target)
      : resolve(absoluteDocumentPath, "..", target)
    if (!isInsideRoot(targetPath)) {
      failures.push(`private-link:${documentPath}:${target}`)
      continue
    }
    try {
      await access(targetPath)
    } catch {
      failures.push(`broken-link:${documentPath}:${relative(root, targetPath)}`)
    }
  }
  for (const match of markdown.matchAll(/pnpm\s+([a-z0-9:_-]+)/g)) {
    const script = match[1]
    if (!packageScripts.has(script) && !allowedPnpmCommands.has(script))
      failures.push(`stale-script:${documentPath}:${script}`)
  }
}

if (!documentArgument) {
  const actualDocs = (await readdir(resolve(root, "docs"), { recursive: true }))
    .filter((entry) => entry.endsWith(".md"))
    .map((entry) => `docs/${entry}`)
  for (const documentPath of actualDocs) {
    if (!publicDocuments.includes(documentPath))
      failures.push(`unexpected-document:${documentPath}`)
  }
  for (const [documentPath, name, pattern] of requiredContent) {
    const markdown = await readFile(resolve(root, documentPath), "utf8")
    if (!pattern.test(markdown)) failures.push(`missing-contract:${documentPath}:${name}`)
  }
}

console.log(
  JSON.stringify({ inspected, status: failures.length === 0 ? "PASS" : "FAIL", failures }, null, 2),
)
if (failures.length > 0) process.exit(1)
