import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf8")
const CSS_ROOTS = [join(ROOT, "app/showcase"), join(ROOT, "components/ui")] as const

const findCssFiles = () =>
  CSS_ROOTS.flatMap((directory) =>
    readdirSync(directory)
      .filter((file) => file.endsWith(".module.css"))
      .map((file) => join(directory, file)),
  )

const measuredProperties =
  /^(?:background(?:-color)?|color|block-size|inline-size|max-block-size|max-inline-size|min-block-size|min-inline-size|font-size|font-weight|line-height|letter-spacing|gap|row-gap|column-gap|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|inset(?:-[\w-]+)?|border(?:-[\w-]+)?|border-radius|outline(?:-[\w-]+)?|opacity|box-shadow|transform|grid-template-(?:columns|rows)|filter|transition(?:-[\w-]+)?|animation(?:-[\w-]+)?|z-index)$/
const rawMeasurement =
  /(?:#[\da-f]{3,8}\b|rgba?\(|(?<![-\w])\d*\.?\d+(?:px|ms|ch|dvb|%|deg)\b|\bbrightness\([^v][^)]+\)|^\d*\.?\d+$)/i
const structuralValues = new Set(["0", "1", "100%"])

function normaliseValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/\s/g, "")
    .replaceAll(/(?<=\d)0+\b/g, "")
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
          (line) =>
            line.includes(`\`${token}\``) &&
            normaliseValue(line).includes(normaliseValue(`\`${value}\``)),
        )
        return documented ? [] : [`${file.replace(`${ROOT}/`, "")}: ${token}=${value}`]
      },
    ),
  )
}

describe("showcase design contract", () => {
  it("Given the design-system CSS, When custom properties are declared, Then DESIGN documents each token", () => {
    // Given / When
    const declaredTokens = findCssFiles().flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/(--hm-[\w-]+)\s*:/g)].map((match) => match[1]),
    )

    // Then
    expect(declaredTokens.filter((token) => !DESIGN.includes(`\`${token}\``))).toEqual([])
  })

  it("Given design-system source modules, When responsibilities are inspected, Then each module stays within 250 pure lines", () => {
    // Given / When
    const oversized = findCssFiles().flatMap((file) => {
      const pureLines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() && !line.trim().startsWith("/*")).length
      return pureLines > 250 ? [{ file: file.replace(`${ROOT}/`, ""), pureLines }] : []
    })

    // Then
    expect(oversized).toEqual([])
  })

  it("Given component declarations, When measurable styling is used, Then raw values stay behind documented tokens", () => {
    // Given / When
    const rawDeclarations = findCssFiles().flatMap((file) =>
      collectRawDeclarations(readFileSync(file, "utf8").split("\n"), file.replace(`${ROOT}/`, "")),
    )

    // Then
    expect(rawDeclarations).toEqual([])
  })

  it("Given custom property definitions, When their semantic value is inspected, Then DESIGN owns the same value", () => {
    // Given / When
    const undocumented = findUndocumentedTokenDefinitions(findCssFiles())

    // Then
    expect(undocumented).toEqual([])
  })

  it("Given seeded raw surface declarations, When every protected CSS property is checked, Then every raw value is rejected", () => {
    // Given
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

    // When
    const violations = collectRawDeclarations(declarations)

    // Then
    expect(violations).toHaveLength(declarations.length)
  })
})
