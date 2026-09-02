import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  type CssSource,
  createDesignTokenContract,
  findLiveCssFiles,
  readSources,
} from "./design-token-contract-parser"

const ROOT = process.cwd()
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf8")
const GLOBALS_PATH = join(ROOT, "app/globals.css")
const LEGACY_CSS_ROOTS = [join(ROOT, "app/showcase"), join(ROOT, "components/ui")] as const
const tokenContract = createDesignTokenContract(DESIGN)

const measuredProperties =
  /^(?:background(?:-color)?|color|block-size|inline-size|max-block-size|max-inline-size|min-block-size|min-inline-size|font-size|font-weight|line-height|letter-spacing|gap|row-gap|column-gap|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|inset(?:-[\w-]+)?|border(?:-[\w-]+)?|border-radius|outline(?:-[\w-]+)?|opacity|box-shadow|transform|grid-template-(?:columns|rows)|filter|transition(?:-[\w-]+)?|animation(?:-[\w-]+)?|z-index)$/
const rawMeasurement =
  /(?:#[\da-f]{3,8}\b|rgba?\(|(?<![-\w])\d*\.?\d+(?:px|ms|ch|dvb|%|deg)\b|\bbrightness\([^v][^)]+\)|^\d*\.?\d+$)/i
const structuralValues = new Set(["0", "1", "100%"])

function legacyCssFiles() {
  return LEGACY_CSS_ROOTS.flatMap((directory) =>
    readdirSync(directory)
      .filter((file) => file.endsWith(".module.css"))
      .map((file) => join(directory, file)),
  )
}

function relativePath(path: string) {
  return path.replace(`${ROOT}/`, "")
}

function collectRawDeclarations(declarations: readonly string[], file = "fixture.module.css") {
  return declarations.flatMap((line, index) => {
    const match = line.trim().match(/^([\w-]+):\s*([^;]+);$/)
    const property = match?.[1]
    const value = match?.[2]
    if (!property || !value || !measuredProperties.test(property) || structuralValues.has(value))
      return []
    return rawMeasurement.test(value) ? [`${file}:${index + 1} ${line.trim()}`] : []
  })
}

function findUndocumentedTokenDefinitions(files: readonly string[]) {
  return files.flatMap((file) =>
    [...readFileSync(file, "utf8").matchAll(/(--hm-[\w-]+)\s*:\s*([^;]+);/g)].flatMap(
      ([, token, value]) => {
        const documented = DESIGN.split("\n").some(
          (line) => line.includes(`\`${token}\``) && line.includes(`\`${value}\``),
        )
        return documented ? [] : [`${relativePath(file)}: ${token}=${value}`]
      },
    ),
  )
}

function liveSources() {
  return readSources(ROOT, findLiveCssFiles(ROOT))
}

describe("showcase design contract", () => {
  it("Given the design-system CSS, When custom properties are declared, Then DESIGN documents each token", () => {
    const declaredTokens = legacyCssFiles().flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/(--hm-[\w-]+)\s*:/g)].flatMap(
        (match) => match[1] ?? [],
      ),
    )

    expect(declaredTokens.filter((token) => !DESIGN.includes(`\`${token}\``))).toEqual([])
  })

  it("Given design-system source modules, When responsibilities are inspected, Then each module stays within 250 pure lines", () => {
    const oversized = legacyCssFiles().flatMap((file) => {
      const pureLines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("/*")).length
      return pureLines > 250 ? [{ file: relativePath(file), pureLines }] : []
    })

    expect(oversized).toEqual([])
  })

  it("Given component declarations, When measurable styling is used, Then raw values stay behind documented tokens", () => {
    const rawDeclarations = legacyCssFiles().flatMap((file) =>
      collectRawDeclarations(readFileSync(file, "utf8").split("\n"), relativePath(file)),
    )

    expect(rawDeclarations).toEqual([])
  })

  it("Given custom property definitions, When their semantic value is inspected, Then DESIGN owns the same value", () => {
    expect(findUndocumentedTokenDefinitions(legacyCssFiles())).toEqual([])
  })

  it("Given seeded raw surface declarations, When every protected CSS property is checked, Then every raw value is rejected", () => {
    const declarations = [
      "color: #fff;",
      "background: #fff;",
      "background-color: rgb(255, 255, 255);",
      "border-color: #d7d2c6;",
      "opacity: 0.52;",
      "box-shadow: 0 1px 2px #0d3425;",
      "transform: translateY(8px);",
      "grid-template-columns: 137px 1fr;",
      "inset-inline-start: 17px;",
    ] as const

    expect(collectRawDeclarations(declarations)).toHaveLength(declarations.length)
  })

  it("Given semantic token fixtures, When canonicality and raw literals are checked, Then only matching property families violate", () => {
    const sources = [
      {
        path: "app/globals.css",
        text: `:root {\n  --hm-space-1: 4px;\n  --hm-space-8: 32.0PX;\n  --hm-border-width: 1px;\n}`,
      },
      {
        path: "components/example.module.css",
        text: `.example {\n  --hm-space-8: 32px;\n  padding: 32px;\n  font-size: 32px;\n  border-block-start: 4px;\n  margin: var(--hm-undefined);\n}`,
      },
      {
        path: "app/privacy/privacy.css",
        text: `.privacy {\n  padding: 32px;\n  font-size: 32px;\n  border-block-start: 4px;\n}`,
      },
    ] as const satisfies readonly CssSource[]
    const globals = sources[0]
    if (!globals) throw new Error("semantic fixture requires app/globals.css")
    const canonical = tokenContract.canonicalDeclarations(globals)

    expect(tokenContract.localDeclarations(sources, canonical)).toEqual([
      "components/example.module.css:2 --hm-space-8: 32px",
    ])
    expect(tokenContract.missingCanonicalReferences(sources, canonical)).toEqual([
      "--hm-undefined has 0 canonical declarations in app/globals.css :root",
    ])
    expect(tokenContract.rawLiteralViolations(sources)).toEqual([
      "app/privacy/privacy.css:2 padding: 32px matches --hm-space-8: 32px",
    ])
    expect(tokenContract.valueViolations(canonical)).toEqual([])
  })

  it("Given live CSS sources, When DS-01 requires a canonical token root, Then app/globals.css defines :root", () => {
    expect(
      tokenContract.hasCanonicalRoot({
        path: "app/globals.css",
        text: readFileSync(GLOBALS_PATH, "utf8"),
      }),
    ).toBe(true)
  })

  it("Given live CSS sources, When every token reference is resolved, Then each has one app/globals.css :root declaration", () => {
    const sources = liveSources()
    const globals = sources.find((source) => source.path === "app/globals.css")
    if (!globals) throw new Error("live CSS inventory must include app/globals.css")

    expect(
      tokenContract.missingCanonicalReferences(
        sources,
        tokenContract.canonicalDeclarations(globals),
      ),
    ).toEqual([])
  })

  it("Given live CSS sources, When HM tokens are declared, Then only app/globals.css :root owns declarations", () => {
    const sources = liveSources()
    const globals = sources.find((source) => source.path === "app/globals.css")
    if (!globals) throw new Error("live CSS inventory must include app/globals.css")

    expect(
      tokenContract.localDeclarations(sources, tokenContract.canonicalDeclarations(globals)),
    ).toEqual([])
  })

  it("Given app/globals.css canonical tokens, When values are normalized, Then every value matches DESIGN", () => {
    const globals = { path: "app/globals.css", text: readFileSync(GLOBALS_PATH, "utf8") }

    expect(tokenContract.valueViolations(tokenContract.canonicalDeclarations(globals))).toEqual([])
  })

  it("Given privacy and 404 CSS, When token-equivalent literals use the same property family, Then they are rejected", () => {
    expect(tokenContract.rawLiteralViolations(liveSources())).toEqual([])
  })
})
