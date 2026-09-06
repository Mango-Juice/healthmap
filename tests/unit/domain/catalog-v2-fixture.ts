import { VALID_CATALOG_SNAPSHOT } from "./fixtures.ts"

const legacyPlace = VALID_CATALOG_SNAPSHOT.places[0]
const legacyMenu = VALID_CATALOG_SNAPSHOT.menus[0]
export const V2_PLACE = {
  schemaVersion: "2.0.0",
  id: legacyPlace.id,
  slug: legacyPlace.slug,
  name: "부산 생선구이",
  address: "부산광역시 중구 테스트로 1",
  latitude: 35.1,
  longitude: 129.03,
  naverPlaceUrl: legacyPlace.naverPlaceUrl,
  published: true,
  dataMode: "production",
  phone: null,
  brandId: null,
  brandVariant: null,
  media: [],
} as const
export const V2_MENU = {
  schemaVersion: "2.0.0",
  id: legacyMenu.id,
  placeId: legacyMenu.placeId,
  name: "생선구이 정식",
  evidenceUrl: legacyMenu.evidenceUrl,
  verificationMethod: legacyMenu.verificationMethod,
  verifiedAt: legacyMenu.verifiedAt,
  validUntil: legacyMenu.validUntil,
  displayOrder: 0,
  published: true,
  dataMode: "production",
  brandId: null,
  brandVariant: null,
  branchApplicability: "branch_confirmed",
  facts: {
    scope: "meal",
    form: "main_dish",
    ingredients: ["fish"],
    rice_base: "unknown",
    base_is_option: false,
    dietary: "unknown",
    ordering_note: null,
    cooking: ["grilled"],
    selection_reasons: [{ kind: "ingredient_cooking", basis: "menu_name", text: "생선구이" }],
  },
} as const
export const V2_CATALOG = {
  schemaVersion: "2.0.0",
  catalogVersion: "2026-09-04.v2-test",
  dataMode: "production",
  places: [V2_PLACE],
  menus: [V2_MENU],
} as const
