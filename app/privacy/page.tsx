import type { Metadata } from "next"

import { buildAbsoluteSiteUrl, getRuntimeSiteEnvironment } from "../../lib/share-links"
import { PrivacyPreference } from "./privacy-preference"
import "./privacy.css"

const canonical = buildAbsoluteSiteUrl("privacy", getRuntimeSiteEnvironment())

export const metadata: Metadata =
  canonical === null
    ? {
        title: "개인정보 및 분석 안내 | 건강식 지도",
        description: "건강식 지도의 최소 수집 분석과 로컬 선택 안내",
        robots: { follow: false, index: false },
      }
    : {
        title: "개인정보 및 분석 안내 | 건강식 지도",
        description: "건강식 지도의 최소 수집 분석과 로컬 선택 안내",
        alternates: { canonical },
      }

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <header className="privacy-heading">
        <p>건강식 지도</p>
        <h1>개인정보 및 분석 안내</h1>
        <p>지도 정보와 제안 접수, 선택적 분석이 각각 다루는 범위를 안내합니다.</p>
      </header>

      <PrivacyPreference />

      <section aria-labelledby="privacy-purpose-heading" className="privacy-section">
        <h2 id="privacy-purpose-heading">수집하는 범위와 목적</h2>
        <p>
          서비스 개선을 위해 지도 진입, 위치 요청 결과, 필터 선택, 조회 완료와 오류, 장소 열기,
          길찾기와 공유 흐름의 성공 여부만 낮은 범주 값으로 기록합니다. 조회 완료에는 검색 여부,
          선택한 메뉴 분류, 결과 수 구간만 포함됩니다. 로그인이나 개인 프로필은 만들지 않습니다.
        </p>
      </section>

      <section aria-labelledby="privacy-excluded-heading" className="privacy-section">
        <h2 id="privacy-excluded-heading">분석에서 수집하지 않는 정보</h2>
        <p>
          분석에는 정확한 위치와 지도 중심, 주소, 장소명, 메뉴명, 검색어와 자유 입력, 전체 URL과
          쿼리, 참조 URL, 세션 녹화, 자동 클릭 수집, 설문, 도구 모음, 쿠키를 보내지 않습니다.
        </p>
      </section>

      <section aria-labelledby="privacy-suggestion-heading" className="privacy-section">
        <h2 id="privacy-suggestion-heading">제안을 보낼 때</h2>
        <p>
          장소 또는 메뉴 제안을 직접 보내면 입력한 내용과 장소 링크, 확인 링크가 검토를 위해
          접수됩니다. 이 값은 분석 이벤트에 포함되지 않으며 자동으로 지도에 공개되지 않습니다. 개인
          연락처는 입력하지 마세요.
        </p>
      </section>

      <section aria-labelledby="privacy-control-heading" className="privacy-section">
        <h2 id="privacy-control-heading">로컬 식별자와 선택권</h2>
        <p>
          분석을 켠 경우에만 이 브라우저의 localStorage에 임의의 익명 식별자를 저장합니다. 다른
          기기나 계정과 연결하지 않으며, 위 설정을 끄면 이후 분석 이벤트 전송을 즉시 중단합니다.
          꺼진 동안 완료된 조회는 다시 켜도 나중에 전송하지 않습니다. 브라우저 사이트 데이터 삭제로
          익명 식별자와 선택값을 초기화할 수 있습니다.
        </p>
      </section>
    </main>
  )
}
