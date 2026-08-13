import type { Metadata } from "next"

import { PrivacyPreference } from "./privacy-preference"
import "./privacy.css"

export const metadata: Metadata = {
  title: "개인정보 및 분석 안내 | 건강식 지도",
  description: "건강식 지도의 최소 수집 분석과 로컬 선택 안내",
}

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-heading">
        <p>건강식 지도</p>
        <h1>개인정보 및 분석 안내</h1>
        <p>이 서비스의 장소와 메뉴 정보는 실제 운영 정보가 아닌 명시적인 목업 데이터입니다.</p>
      </header>

      <PrivacyPreference />

      <section aria-labelledby="privacy-purpose-heading" className="privacy-section">
        <h2 id="privacy-purpose-heading">수집하는 범위와 목적</h2>
        <p>
          서비스 개선을 위해 지도 진입, 위치 요청 결과, 필터 선택, 장소 열기, 길찾기와 공유 흐름의
          성공 여부만 낮은 범주 값으로 기록합니다. 로그인이나 개인 프로필은 만들지 않습니다.
        </p>
      </section>

      <section aria-labelledby="privacy-excluded-heading" className="privacy-section">
        <h2 id="privacy-excluded-heading">수집하지 않는 정보</h2>
        <p>
          정확한 위치와 지도 중심, 주소, 장소명, 메뉴명, 검색어와 자유 입력, 전체 URL과 쿼리, 참조
          URL, 세션 녹화, 자동 클릭 수집, 설문, 도구 모음, 쿠키는 수집하지 않습니다.
        </p>
      </section>

      <section aria-labelledby="privacy-control-heading" className="privacy-section">
        <h2 id="privacy-control-heading">로컬 식별자와 선택권</h2>
        <p>
          분석을 켠 경우에만 이 브라우저의 localStorage에 임의의 익명 식별자를 저장합니다. 다른
          기기나 계정과 연결하지 않으며, 위 설정을 끄면 이후 분석 이벤트 전송을 즉시 중단합니다.
          브라우저 사이트 데이터 삭제로 익명 식별자와 선택값을 초기화할 수 있습니다.
        </p>
      </section>

      <section aria-labelledby="privacy-contact-heading" className="privacy-section">
        <h2 id="privacy-contact-heading">문의</h2>
        <p>개인정보 및 분석 관련 문의 담당자: 추후 지정 예정</p>
      </section>
    </main>
  )
}
