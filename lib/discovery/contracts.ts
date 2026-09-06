import { z } from "zod"
import type { PlaceIdSchema } from "../domain/contracts"
import {
  type PilotDetailResponse,
  PilotDetailResponseSchema,
  type PilotPlacesResponse,
  PilotPlacesResponseSchema,
  type PilotRegionsResponse,
  PilotRegionsResponseSchema,
} from "../pilot/dto"
import type { PilotQuery } from "../pilot/query-contract"

export const DISCOVERY_SCHEMA_VERSION = "discovery-serving-1" as const

const UtcTimestampSchema = z.iso.datetime({ offset: true }).refine((value) => value.endsWith("Z"))
const DiscoveryStateShape = {
  schemaVersion: z.literal(DISCOVERY_SCHEMA_VERSION),
  releaseId: z.string().min(1).nullable(),
  eligibleEpoch: z.string().regex(/^[a-f0-9]{64}$/u),
  evaluatedAt: UtcTimestampSchema,
  nextBoundary: UtcTimestampSchema.nullable(),
} as const

export const DiscoveryStateSchema = z.strictObject(DiscoveryStateShape).readonly()
export const DiscoveryPlacesEnvelopeSchema = z
  .strictObject({ ...DiscoveryStateShape, data: PilotPlacesResponseSchema })
  .readonly()
export const DiscoveryRegionsEnvelopeSchema = z
  .strictObject({ ...DiscoveryStateShape, data: PilotRegionsResponseSchema })
  .readonly()
export const DiscoveryDetailEnvelopeSchema = z
  .strictObject({ ...DiscoveryStateShape, data: PilotDetailResponseSchema.nullable() })
  .readonly()

const RpcErrorMessageSchema = z
  .strictObject({
    error: z.enum(["invalid_request", "stale_state", "stale_cursor"]),
    retry: z.boolean(),
  })
  .readonly()

export const DiscoveryRpcErrorResponseSchema = z
  .object({ code: z.enum(["PT400", "PT409"]), message: z.string() })
  .transform((response, context) => {
    try {
      const message: unknown = JSON.parse(response.message)
      const parsed = RpcErrorMessageSchema.safeParse(message)
      if (!parsed.success) {
        context.addIssue({ code: "custom", message: "Invalid discovery RPC error message" })
        return z.NEVER
      }
      return { code: response.code, ...parsed.data } as const
    } catch {
      context.addIssue({ code: "custom", message: "Invalid discovery RPC error JSON" })
      return z.NEVER
    }
  })

export type DiscoveryState = z.infer<typeof DiscoveryStateSchema>

export type DiscoveryReadErrorKind =
  | "cancelled"
  | "configuration"
  | "invalid_request"
  | "invalid_response"
  | "stale_cursor"
  | "stale_state"
  | "timeout"
  | "transport"

export class DiscoveryReadError extends Error {
  readonly name = "DiscoveryReadError"

  constructor(readonly kind: DiscoveryReadErrorKind) {
    super(`Discovery read failed: ${kind}`)
  }
}

export type DiscoveryQueryRequest = Readonly<{
  readonly expectedRelease: string | null
  readonly expectedEpoch: string
  readonly mode: PilotQuery["mode"]
  readonly query: string
  readonly filter: PilotQuery["filter"]
  readonly ingredient: PilotQuery["ingredient"]
  readonly region?: string | undefined
  readonly south?: number | undefined
  readonly north?: number | undefined
  readonly west?: number | undefined
  readonly east?: number | undefined
  readonly limit: number
  readonly cursor?: string | undefined
}>

export type DiscoveryDetailRequest = Readonly<{
  readonly expectedRelease: string | null
  readonly expectedEpoch: string
  readonly id: z.infer<typeof PlaceIdSchema>
}>

export interface DiscoveryRpcClient {
  getState(signal?: AbortSignal): Promise<unknown>
  query(request: DiscoveryQueryRequest, signal?: AbortSignal): Promise<unknown>
  getPlace(request: DiscoveryDetailRequest, signal?: AbortSignal): Promise<unknown>
}

export interface DiscoveryReader {
  query(
    query: PilotQuery,
    signal?: AbortSignal,
  ): Promise<PilotPlacesResponse | PilotRegionsResponse>
  getPlace(
    id: z.infer<typeof PlaceIdSchema>,
    signal?: AbortSignal,
  ): Promise<PilotDetailResponse | null>
}
