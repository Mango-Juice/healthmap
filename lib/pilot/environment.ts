export type PilotEnvironment = Readonly<Record<string, string | undefined>>

export const isPilotEnabled = (environment: PilotEnvironment): boolean => {
  if (environment["HEALTHMAP_PILOT_ENABLED"] !== "1") return false
  return environment["VERCEL_ENV"] === "preview" || environment["NODE_ENV"] === "development"
}
