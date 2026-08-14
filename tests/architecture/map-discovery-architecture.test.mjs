import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { basename, extname, join, resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

const workspace = resolve(import.meta.dirname, "../..")
const mapDirectory = join(workspace, "components/map")
const responsibilityModules = [
  "map-discovery.tsx",
  "map-discovery-surface.tsx",
  "use-catalog.ts",
  "use-detail-selection.ts",
  "use-location-control.ts",
  "use-naver-map-adapter.ts",
]
const architectureModules = readdirSync(mapDirectory).filter(
  (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"),
)

const sourceText = (fileName) => readFileSync(join(mapDirectory, fileName), "utf8")

const pureLineCount = (source) =>
  source.split("\n").filter((line) => line.trim() !== "" && !line.trimStart().startsWith("//"))
    .length

const localImports = (fileName) => {
  const source = ts.createSourceFile(
    fileName,
    sourceText(fileName),
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  return source.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
    .filter((specifier) => specifier.startsWith("./"))
    .map((specifier) => {
      const target = basename(specifier)
      return extname(target) === "" ? `${target}.ts` : target
    })
    .map((target) =>
      architectureModules.includes(target)
        ? target
        : architectureModules.find((candidate) => candidate === target.replace(/\.ts$/, ".tsx")),
    )
    .filter((target) => target !== undefined)
}

test("map discovery is split into bounded acyclic responsibility modules", () => {
  for (const fileName of responsibilityModules)
    assert.ok(architectureModules.includes(fileName), `missing responsibility module: ${fileName}`)

  for (const fileName of architectureModules) {
    const lines = pureLineCount(sourceText(fileName))
    assert.ok(lines <= 250, `${fileName} has ${lines} pure lines; expected at most 250`)
  }

  const visiting = new Set()
  const visited = new Set()
  const visit = (fileName, path) => {
    assert.ok(!visiting.has(fileName), `import cycle: ${[...path, fileName].join(" -> ")}`)
    if (visited.has(fileName)) return
    visiting.add(fileName)
    for (const dependency of localImports(fileName)) visit(dependency, [...path, fileName])
    visiting.delete(fileName)
    visited.add(fileName)
  }

  for (const fileName of architectureModules) visit(fileName, [])
})
