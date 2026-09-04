export type PilotEnvironment = Readonly<Record<string, string | undefined>>

export const isPublicPilotEnabled = (environment: PilotEnvironment): boolean =>
  environment["HEALTHMAP_PUBLIC_PILOT"] === "1"

export const isPilotEnabled = (environment: PilotEnvironment): boolean => {
  if (isPublicPilotEnabled(environment)) return true
  if (environment["VERCEL_ENV"] === "production") return false
  if (environment["HEALTHMAP_PILOT_ENABLED"] !== "1") return false
  return environment["VERCEL_ENV"] === "preview" || environment["NODE_ENV"] === "development"
}
