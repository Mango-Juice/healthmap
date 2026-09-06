import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

const workspace = process.env["HEALTHMAP_ARCHITECTURE_ROOT"]
  ? resolve(process.env["HEALTHMAP_ARCHITECTURE_ROOT"])
  : resolve(import.meta.dirname, "../..")
const pilotDirectory = join(workspace, "components/pilot")
const architectureModules = readdirSync(pilotDirectory).filter(
  (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"),
)
const responsibilityModules = [
  "pilot-discovery.tsx",
  "pilot-detail.tsx",
  "pilot-results.tsx",
  "use-pilot-location.ts",
  "use-pilot-query.ts",
  "use-pilot-viewport.ts",
]

const sourceText = (fileName) => readFileSync(join(pilotDirectory, fileName), "utf8")
const sourceFile = (fileName, source = sourceText(fileName)) =>
  ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    false,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
const localImports = (fileName) =>
  sourceFile(fileName)
    .statements.filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
    .filter((specifier) => specifier.startsWith("./"))
    .map((specifier) => {
      const path = resolve(pilotDirectory, dirname(fileName), specifier)
      const candidates = [path, `${path}.ts`, `${path}.tsx`]
      const target = candidates.find((candidate) =>
        architectureModules.includes(relative(pilotDirectory, candidate)),
      )
      return target === undefined ? undefined : relative(pilotDirectory, target)
    })
    .filter((target) => target !== undefined)

test("the root route enters the current FoodMap boundary", () => {
  const pagePath = join(workspace, "app/page.tsx")
  const page = sourceFile(pagePath, readFileSync(pagePath, "utf8"))
  const foodMapImport = page.statements
    .filter(ts.isImportDeclaration)
    .find(
      (statement) =>
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text === "../components/pilot/pilot-discovery",
    )

  assert.ok(foodMapImport, "app/page.tsx must enter the FoodMap boundary")
  assert.ok(
    foodMapImport.importClause?.namedBindings &&
      ts.isNamedImports(foodMapImport.importClause.namedBindings) &&
      foodMapImport.importClause.namedBindings.elements.some(
        (entry) => entry.name.text === "FoodMap",
      ),
    "app/page.tsx must import FoodMap by name",
  )
  assert.ok(
    !page.statements.some(
      (statement) =>
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.moduleSpecifier.text.includes("components/map/map-discovery"),
    ),
    "the root route must not re-enter the retired reviewed-catalog map",
  )
})

test("FoodMap composes bounded current query, map, and detail responsibilities", () => {
  for (const fileName of responsibilityModules)
    assert.ok(
      architectureModules.includes(fileName),
      `missing current responsibility module: ${fileName}`,
    )

  const imports = sourceFile("pilot-discovery.tsx")
    .statements.filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
  for (const specifier of [
    "./pilot-detail",
    "./pilot-results",
    "./use-pilot-query",
    "./use-pilot-location",
    "./use-pilot-viewport",
    "../map/use-naver-map-adapter",
  ])
    assert.ok(imports.includes(specifier), `FoodMap must delegate ${specifier}`)
})

test("current FoodMap modules have acyclic local dependencies", () => {
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
