import { z } from "zod"
import { CleanHttpsUrlSchema, ExactNaverPlaceUrlSchema } from "./place-links.ts"

export const PublicNaverSearchUrlSchema = CleanHttpsUrlSchema.refine((value) => {
  const url = URL.parse(value)
  if (
    url === null ||
    url.hostname !== "map.naver.com" ||
    url.search !== "" ||
    !url.pathname.startsWith("/p/search/")
  )
    return false
  const encodedQuery = url.pathname.slice("/p/search/".length)
  if (encodedQuery === "" || encodedQuery.includes("/")) return false
  try {
    const query = decodeURIComponent(encodedQuery)
    return (
      query === query.trim() &&
      /^\S(?:.*\S)?\s\S(?:.*\S)?$/u.test(query) &&
      !/[\p{Cc}]/u.test(query)
    )
  } catch (error) {
    if (error instanceof URIError) return false
    throw error
  }
})
export const PublicNaverUrlSchema = z.union([ExactNaverPlaceUrlSchema, PublicNaverSearchUrlSchema])
export const getPublicNaverLinkKind = (value: unknown): "exact" | "search" => {
  const url = PublicNaverUrlSchema.parse(value)
  return ExactNaverPlaceUrlSchema.safeParse(url).success ? "exact" : "search"
}
export const matchesPublicNaverSearchTarget = (
  url: string,
  target: { readonly name: string; readonly address: string },
): boolean => {
  if (!PublicNaverSearchUrlSchema.safeParse(url).success) return true
  return (
    decodeURIComponent(new URL(url).pathname.slice("/p/search/".length)) ===
    `${target.name} ${target.address}`
  )
}
