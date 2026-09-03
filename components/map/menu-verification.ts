import type { Menu } from "../../lib/domain/catalog"

export const MENU_VERIFICATION_LABELS = {
  direct_confirmation: "직접 확인",
  government_exact: "공공자료 일치",
  merchant_submission: "매장 제출",
  official_menu: "공식 메뉴",
} as const satisfies Record<Menu["verificationMethod"], string>
