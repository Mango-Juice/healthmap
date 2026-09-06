import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import test from "node:test"
import ts from "typescript"

const workspace = process.env["HEALTHMAP_ARCHITECTURE_ROOT"]
  ? resolve(process.env["HEALTHMAP_ARCHITECTURE_ROOT"])
  : resolve(import.meta.dirname, "../..")
const foodMapDirectory = join(workspace, "components/food-map")
const architectureModules = readdirSync(foodMapDirectory).filter(
  (fileName) => fileName.endsWith(".ts") || fileName.endsWith(".tsx"),
)
const responsibilityModules = [
  "food-map-discovery.tsx",
  "food-map-detail.tsx",
  "food-map-results.tsx",
  "use-food-map-location.ts",
  "use-food-map-query.ts",
  "use-food-map-viewport.ts",
]

const sourceText = (fileName) => readFileSync(join(foodMapDirectory, fileName), "utf8")
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
      const path = resolve(foodMapDirectory, dirname(fileName), specifier)
      const candidates = [path, `${path}.ts`, `${path}.tsx`]
      const target = candidates.find((candidate) =>
        architectureModules.includes(relative(foodMapDirectory, candidate)),
      )
      return target === undefined ? undefined : relative(foodMapDirectory, target)
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
        statement.moduleSpecifier.text === "../components/food-map/food-map-discovery",
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

  const imports = sourceFile("food-map-discovery.tsx")
    .statements.filter(ts.isImportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(ts.isStringLiteral)
    .map((specifier) => specifier.text)
  for (const specifier of [
    "./food-map-detail",
    "./food-map-results",
    "./use-food-map-query",
    "./use-food-map-location",
    "./use-food-map-viewport",
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
