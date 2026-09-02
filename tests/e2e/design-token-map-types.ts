export const TEST_ID = "DS-01-map-design-token-equivalence"
export const TRIGGER_NAME = "새싹 네모식당 상세 보기"
export const VIEWPORTS = [
  { height: 812, name: "375x812", width: 375 },
  { height: 1024, name: "768x1024", width: 768 },
  { height: 800, name: "1280x800", width: 1280 },
] as const
export const ZOOM_VIEWPORT = { height: 406, name: "188x406-at-2x", width: 188 } as const

export type CapturePhase = "before" | "after"
export type CaptureState = "discovery" | "detail" | "detail-reduced-motion" | "status-error"
export type Viewport = (typeof VIEWPORTS)[number] | typeof ZOOM_VIEWPORT
export type Box = Readonly<{
  readonly bottom: number
  readonly height: number
  readonly left: number
  readonly right: number
  readonly top: number
  readonly width: number
}>
export type ScrollMeasurement = Readonly<{
  readonly clientHeight: number
  readonly overflowY: string
  readonly scrollHeight: number
}>
export type CaptureReceipt = Readonly<{
  readonly capturedAt: string
  readonly consoleErrors: readonly string[]
  readonly deviceScaleFactor: number
  readonly focus: Readonly<{ readonly accessibleName: string; readonly tagName: string }>
  readonly geometry: Readonly<Record<string, Box | null>>
  readonly image: Readonly<{ readonly height: number; readonly width: number }>
  readonly pageErrors: readonly string[]
  readonly phase: CapturePhase
  readonly reducedMotion: "no-preference" | "reduce"
  readonly screenshotSha256: string
  readonly scroll: Readonly<{
    readonly documentOverflow: boolean
    readonly overflowingOwners: readonly string[]
    readonly owners: readonly string[]
    readonly regions: Readonly<Record<string, ScrollMeasurement>>
  }>
  readonly sourceManifestSha256: string
  readonly state: CaptureState
  readonly statusError: Readonly<{
    readonly mapScopeSpace8: string
    readonly maxInlineSize: string
    readonly referencesSpace8: boolean
  }> | null
  readonly targetSizes: readonly Readonly<{
    readonly accessibleName: string
    readonly height: number
    readonly tagName: string
    readonly width: number
  }>[]
  readonly testId: typeof TEST_ID
  readonly tokens: Readonly<Record<string, string>>
  readonly url: string
  readonly viewport: Readonly<{ readonly height: number; readonly width: number }>
}>
export type SourceManifest = Readonly<{
  readonly files: readonly Readonly<{ readonly path: string; readonly sha256: string }>[]
  readonly sha256: string
  readonly testId: typeof TEST_ID
}>
export type CaptureFacts = Readonly<{
  readonly statusRuleReferencesSpace8: boolean
  readonly tokenNames: readonly string[]
}>
export type ErrorRecords = Readonly<{
  readonly consoleErrors: readonly string[]
  readonly pageErrors: readonly string[]
}>
export type EvidenceSession = Readonly<{
  readonly baselineDirectory: string | null
  readonly directory: string
  readonly phase: CapturePhase
}>

export class CaptureConfigurationError extends Error {}
export class BaselineExistsError extends Error {}
export class BaselineMismatchError extends Error {}
