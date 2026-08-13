import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROOT = process.cwd()
const DESIGN = readFileSync(join(ROOT, "DESIGN.md"), "utf8")
const CSS_ROOTS = [join(ROOT, "app/showcase"), join(ROOT, "components/ui")] as const

const cssFiles = CSS_ROOTS.flatMap((directory) =>
  readdirSync(directory)
    .filter((file) => file.endsWith(".module.css"))
    .map((file) => join(directory, file)),
)

const measuredProperties =
  /^(?:block-size|inline-size|max-block-size|max-inline-size|min-block-size|min-inline-size|font-size|font-weight|line-height|letter-spacing|gap|row-gap|column-gap|margin(?:-[\w-]+)?|padding(?:-[\w-]+)?|inset(?:-[\w-]+)?|border(?:-[\w-]+)?|border-radius|outline(?:-[\w-]+)?|opacity|filter|transition(?:-[\w-]+)?|animation(?:-[\w-]+)?|z-index)$/
const rawMeasurement =
  /(?:#[\da-f]{3,8}\b|rgba?\(|(?<![-\w])\d*\.?\d+(?:px|ms|ch|dvb|%|deg)\b|\bbrightness\([^v][^)]+\)|^\d{2,}$)/i
const structuralValues = new Set(["0", "1", "100%"])

describe("showcase design contract", () => {
  it("Given the design-system CSS, When custom properties are declared, Then DESIGN documents each token", () => {
    // Given / When
    const declaredTokens = cssFiles.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/(--hm-[\w-]+)\s*:/g)].map((match) => match[1]),
    )

    // Then
    expect(declaredTokens.filter((token) => !DESIGN.includes(`\`${token}\``))).toEqual([])
  })

  it("Given design-system source modules, When responsibilities are inspected, Then each module stays within 250 pure lines", () => {
    // Given / When
    const oversized = cssFiles.flatMap((file) => {
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
    const rawDeclarations = cssFiles.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => {
          const match = line.trim().match(/^([\w-]+):\s*([^;]+);$/)
          const property = match?.[1]
          const value = match?.[2]
          if (
            !property ||
            !value ||
            !measuredProperties.test(property) ||
            structuralValues.has(value)
          )
            return []
          return rawMeasurement.test(value)
            ? [`${file.replace(`${ROOT}/`, "")}:${index + 1} ${line.trim()}`]
            : []
        }),
    )

    // Then
    expect(rawDeclarations).toEqual([])
  })
})
