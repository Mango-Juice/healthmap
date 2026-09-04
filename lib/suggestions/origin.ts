export const hasSameSuggestionOrigin = (request: Request): boolean => {
  const origin = request.headers.get("origin")
  if (!origin || origin === "null") return false
  try {
    const parsed = new URL(origin)
    const target = new URL(request.url)
    return (
      parsed.origin === origin &&
      parsed.protocol === target.protocol &&
      parsed.host === (request.headers.get("host") ?? target.host)
    )
  } catch (error) {
    if (error instanceof TypeError) return false
    throw error
  }
}
