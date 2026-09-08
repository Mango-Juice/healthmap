# 검색 등록 준비

등록 기준 주소는 `https://healthmap-hazel.vercel.app/`이다.
배포의 `NEXT_PUBLIC_SITE_URL`도 이 주소로 설정한다. 홈 canonical과 sitemap은 같은 설정을 사용한다.

- 프로덕션 홈만 색인을 허용하고 sitemap에는 홈 URL 하나만 포함한다.
- 개발·프리뷰·Playwright 환경 또는 유효한 사이트 주소가 없는 환경은 색인을 허용하지 않는다.
- `/suggest`는 접근 가능하되 `noindex, nofollow`를 유지한다.
- `/about`, `/privacy`, `/showcase`는 404를 반환한다. 원래 소스는 각 폴더의
  `hidden-page.tsx`에 보존했다. 다시 공개하려면 `page.tsx`로 복원하고 색인 정책과 테스트도 갱신한다.
- 검색 입력은 `search`, 검색 결과 패널은 이름 있는 `section`으로 표시한다.
- Google·네이버 소유권 확인 메타태그는 홈의 `metadata.verification`에서 초기 HTML의
  `<head>`에 출력한다. 태그 배포와 각 서비스의 소유권 확인 완료는 별개다.

배포 후에는 홈의 HTTP 200·canonical·`index, follow`, robots.txt의 크롤링 허용,
sitemap의 홈 URL 한 개, 숨긴 세 경로의 HTTP 404·noindex를 확인한다.
Google Search Console과 네이버 서치어드바이저의 소유권 확인 및 sitemap 제출은 별도 단계다.
서비스에서 발급받은 실제 소유권 확인 값을 사용하며 등록 준비만으로 제출 완료를 주장하지 않는다.

배포 순서는 SEO 준비 브랜치에 Google·네이버 소유권 확인용 `<head>` 메타태그를 별도 커밋으로
추가한 뒤, 브랜치를 푸시하고 PR을 생성하는 방식이다. PR의 CI와 리뷰를 통과한 변경을 병합하고
기존 배포 경로로 운영에 반영한다. 현재 준비 커밋만으로 푸시하거나 직접 운영 배포하지 않는다.

현재 범위는 서비스 홈 검색 노출이다. 장소별 검색 유입에는 별도 상세 URL, 크롤링 가능한 링크,
서버에서 제공하는 공개 장소 본문이 추가로 필요하다.
