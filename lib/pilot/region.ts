const PROVINCE_ABBREVIATIONS: Readonly<Record<string, string>> = {
  충청북: "충북",
  충청남: "충남",
  전라북: "전북",
  전라남: "전남",
  경상북: "경북",
  경상남: "경남",
}

export const canonicalPilotRegion = (value: string): string => {
  const [province = "", district] = value.trim().split(/\s+/u)
  const short = province.replace(/(?:특별자치시|특별자치도|특별시|광역시|시|도)$/u, "")
  return [PROVINCE_ABBREVIATIONS[short] ?? short, district].filter(Boolean).join(" ")
}
