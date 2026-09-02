import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"

export type CssSource = {
  readonly path: string
  readonly text: string
}

type TokenDeclaration = {
  readonly file: string
  readonly line: number
  readonly offset: number
  readonly token: string
  readonly value: string
}

type CssDeclaration = {
  readonly file: string
  readonly line: number
  readonly property: string
  readonly value: string
}

const routeLiteralPaths = new Set(["app/privacy/privacy.css", "app/not-found.module.css"])
const declarationPattern = /(--hm-[\w-]+)\s*:\s*([^;{}]+);/g
const referencePattern = /var\(\s*(--hm-[\w-]+)/g
const propertyPattern = /^\s*([\w-]+)\s*:\s*([^;{}]+);/gm
const tokenPattern = /--hm-[\w-]+/g
const structuralValues = new Set(["0", "1", "100%"])

function normaliseDecimal(_match: string, sign: string, whole: string, fraction: string) {
  const normalisedWhole = whole.replace(/^0+(?=\d)/, "") || "0"
  const normalisedFraction = fraction.replace(/0+$/, "")
  return `${sign}${normalisedWhole}${normalisedFraction ? `.${normalisedFraction}` : ""}`
}

export function normaliseValue(value: string) {
  return value
    .toLowerCase()
    .replaceAll(/\s/g, "")
    .replaceAll(/(-?)(\d*)\.(\d+)/g, normaliseDecimal)
}

function lineNumber(text: string, offset: number) {
  return text.slice(0, offset).split("\n").length
}

export function findLiveCssFiles(root: string): readonly string[] {
  function filesIn(directory: string): readonly string[] {
    return readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const path = join(directory, entry.name)
        if (entry.isDirectory()) return filesIn(path)
        return entry.isFile() && entry.name.endsWith(".css") ? [path] : []
      })
      .sort((left, right) => left.localeCompare(right))
  }

  return [join(root, "app"), join(root, "components")]
    .flatMap(filesIn)
    .sort((left, right) => left.localeCompare(right))
}

export function readSources(root: string, paths: readonly string[]): readonly CssSource[] {
  return paths.map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }))
}

function tokenDeclarations(sources: readonly CssSource[]): readonly TokenDeclaration[] {
  return sources.flatMap((source) => {
    declarationPattern.lastIndex = 0
    return [...source.text.matchAll(declarationPattern)].flatMap((match) => {
      const [token, value] = [match[1], match[2]]
      if (!token || !value || match.index === undefined) return []
      return [
        {
          file: source.path,
          line: lineNumber(source.text, match.index),
          offset: match.index,
          token,
          value: value.trim(),
        },
      ]
    })
  })
}

function rootTokenDeclarations(globals: CssSource): readonly TokenDeclaration[] {
  return [...globals.text.matchAll(/:root\s*\{([^{}]*)\}/g)].flatMap((block) => {
    const content = block[1]
    if (!content || block.index === undefined) return []
    const contentOffset = block[0].indexOf(content)
    declarationPattern.lastIndex = 0
    return [...content.matchAll(declarationPattern)].flatMap((match) => {
      const [token, value] = [match[1], match[2]]
      if (!token || !value || match.index === undefined) return []
      return [
        {
          file: globals.path,
          line: lineNumber(globals.text, block.index + contentOffset + match.index),
          offset: block.index + contentOffset + match.index,
          token,
          value: value.trim(),
        },
      ]
    })
  })
}

function tokenReferences(sources: readonly CssSource[]) {
  return sources.flatMap((source) => {
    referencePattern.lastIndex = 0
    return [...source.text.matchAll(referencePattern)].flatMap((match) => match[1] ?? [])
  })
}

function cssDeclarations(sources: readonly CssSource[]): readonly CssDeclaration[] {
  return sources.flatMap((source) => {
    propertyPattern.lastIndex = 0
    return [...source.text.matchAll(propertyPattern)].flatMap((match) => {
      const [property, value] = [match[1], match[2]]
      if (!property || !value || match.index === undefined) return []
      return [
        {
          file: source.path,
          line: lineNumber(source.text, match.index),
          property,
          value: value.trim(),
        },
      ]
    })
  })
}

function documentedTokenValues(design: string) {
  const values = new Map<string, string>()
  for (const line of design.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim())
    for (let index = 0; index < cells.length - 1; index += 1) {
      const [tokenCell, valueCell] = [cells[index], cells[index + 1]]
      if (!tokenCell || !valueCell) continue
      tokenPattern.lastIndex = 0
      const tokens = [...tokenCell.matchAll(tokenPattern)].flatMap((match) => match[0] ?? [])
      const valuesInCell = [...valueCell.matchAll(/`([^`]+)`/g)].flatMap((match) => match[1] ?? [])
      if (tokens.length !== valuesInCell.length) continue
      for (const [tokenIndex, token] of tokens.entries()) {
        const value = valuesInCell[tokenIndex]
        if (value) values.set(token, value)
      }
    }
  }
  return values
}

function tokenFamily(token: string) {
  if (token.startsWith("--hm-space-")) return "spacing"
  if (token.startsWith("--hm-type-")) return "font-size"
  if (token.startsWith("--hm-weight-")) return "font-weight"
  if (token.startsWith("--hm-leading-")) return "line-height"
  if (token.startsWith("--hm-radius-")) return "radius"
  if (token === "--hm-border-width") return "border"
  if (token === "--hm-focus-ring") return "outline"
  if (token.startsWith("--hm-icon-") || token.endsWith("-block") || token.endsWith("-measure"))
    return "size"
  if (token === "--hm-control-min" || token === "--hm-empty-glyph" || token === "--hm-pane-wide")
    return "size"
  if (token.startsWith("--hm-layer-")) return "layer"
  if (token.includes("opacity")) return "opacity"
  if (token.includes("brightness")) return "filter"
  if (token.startsWith("--hm-motion-") || token.startsWith("--hm-ease-")) return "motion"
  if (token.startsWith("--hm-press-") || token.startsWith("--hm-spinner-")) return "transform"
  if (token.startsWith("--hm-shadow-")) return "shadow"
  return "color"
}

function propertyFamily(property: string) {
  if (property.startsWith("padding") || property.startsWith("margin") || property.endsWith("gap"))
    return "spacing"
  if (property === "font-size" || property === "font-weight" || property === "line-height")
    return property
  if (property === "border-radius") return "radius"
  if (property.startsWith("border")) return "border"
  if (property.startsWith("outline")) return "outline"
  if (property.includes("inline-size") || property.includes("block-size")) return "size"
  if (property === "z-index") return "layer"
  if (
    property === "opacity" ||
    property === "filter" ||
    property === "transform" ||
    property === "box-shadow"
  )
    return property
  if (property.startsWith("transition") || property.startsWith("animation")) return "motion"
  if (property === "color" || property.startsWith("background")) return "color"
  return undefined
}

export function createDesignTokenContract(design: string) {
  const documented = documentedTokenValues(design)
  return {
    canonicalDeclarations: rootTokenDeclarations,
    hasCanonicalRoot: (globals: CssSource) => /:root\s*\{/.test(globals.text),
    localDeclarations: (sources: readonly CssSource[], canonical: readonly TokenDeclaration[]) => {
      const locations = new Set(
        canonical.map((declaration) => `${declaration.file}:${declaration.offset}`),
      )
      return tokenDeclarations(sources)
        .filter((declaration) => !locations.has(`${declaration.file}:${declaration.offset}`))
        .map(
          (declaration) =>
            `${declaration.file}:${declaration.line} ${declaration.token}: ${declaration.value}`,
        )
    },
    missingCanonicalReferences: (
      sources: readonly CssSource[],
      canonical: readonly TokenDeclaration[],
    ) => {
      const counts = new Map<string, number>()
      for (const declaration of canonical)
        counts.set(declaration.token, (counts.get(declaration.token) ?? 0) + 1)
      return [...new Set(tokenReferences(sources))]
        .sort((left, right) => left.localeCompare(right))
        .flatMap((token) => {
          const count = counts.get(token) ?? 0
          return count === 1
            ? []
            : [`${token} has ${count} canonical declarations in app/globals.css :root`]
        })
    },
    valueViolations: (canonical: readonly TokenDeclaration[]) =>
      canonical.flatMap((declaration) => {
        const value = documented.get(declaration.token)
        if (!value)
          return [
            `${declaration.file}:${declaration.line} ${declaration.token} is not documented in DESIGN`,
          ]
        return normaliseValue(declaration.value) === normaliseValue(value)
          ? []
          : [
              `${declaration.file}:${declaration.line} ${declaration.token}: ${declaration.value} does not match DESIGN ${value}`,
            ]
      }),
    rawLiteralViolations: (sources: readonly CssSource[]) =>
      cssDeclarations(sources).flatMap((declaration) => {
        if (!routeLiteralPaths.has(declaration.file) || structuralValues.has(declaration.value))
          return []
        const family = propertyFamily(declaration.property)
        if (!family) return []
        return [...documented.entries()]
          .filter(
            ([token, value]) =>
              tokenFamily(token) === family &&
              declaration.value
                .split(/\s+/)
                .some((literal) => normaliseValue(literal) === normaliseValue(value)),
          )
          .map(
            ([token, value]) =>
              `${declaration.file}:${declaration.line} ${declaration.property}: ${declaration.value} matches ${token}: ${value}`,
          )
      }),
  }
}
