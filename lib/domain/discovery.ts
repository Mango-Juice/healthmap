export const normalizeDiscoveryQuery = (query: string): string =>
  query.normalize("NFKC").toLocaleLowerCase("en-US").trim().replaceAll(/\s+/gu, " ")
