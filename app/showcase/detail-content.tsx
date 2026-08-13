import { LeafIcon, LocateIcon, NavigationIcon, XIcon } from "../../components/ui/health-map-icons"
import { ActionButton } from "../../components/ui/health-map-primitives"
import detailStyles from "./detail-surface.module.css"
import mapStyles from "./map-shell.module.css"

type DetailContentProperties = { readonly onClose: () => void }

export function DetailContent({ onClose }: DetailContentProperties) {
  return (
    <>
      <header className={detailStyles["detailHeader"]}>
        <div>
          <span className={detailStyles["detailKicker"]}>균형식 · 도보 5분</span>
          <h2 id="showcase-place-title" tabIndex={-1}>
            그린테이블 강남점
          </h2>
        </div>
        <ActionButton
          aria-label="상세 닫기"
          className={mapStyles["iconButton"]}
          onClick={onClose}
          variant="quiet"
        >
          <XIcon />
        </ActionButton>
      </header>
      <div className={detailStyles["detailBody"]}>
        <div className={detailStyles["placeFact"]}>
          <LeafIcon />
          <span>채소 · 단백질 · 균형식</span>
        </div>
        <div className={detailStyles["placeFact"]}>
          <LocateIcon />
          <span>서울 강남구 테헤란로 123</span>
        </div>
        <p>신선한 채소와 곡물을 중심으로 고른 대표 메뉴를 확인할 수 있어요.</p>
      </div>
      <footer className={detailStyles["detailActions"]}>
        <ActionButton leadingIcon={<NavigationIcon />} variant="primary">
          길찾기
        </ActionButton>
        <ActionButton variant="secondary">공유</ActionButton>
      </footer>
    </>
  )
}
