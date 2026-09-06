# 개발

## 요구 사항

Node.js 22와 `pnpm` 10을 사용합니다. 이 저장소에는 실제 카탈로그 행이나 서버 관리자 비밀값이
포함되지 않습니다.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
pnpm dev
```

`NEXT_PUBLIC_`으로 시작하는 값은 브라우저 번들에 포함될 수 있습니다. 지도와 데이터베이스를 직접
확인하려면 각자 사용할 공개 구성값을 `.env.local`에 넣으세요. 서버 관리자 키나 수집 자료는 예제
파일, 브라우저 환경 변수, 테스트 출력에 넣지 마세요. 구성된 실제 개발 데이터베이스가 없으면 장소
API는 사용 불가 또는 빈 결과를 명시합니다. 앱과 E2E는 배송되는 가짜 장소 데이터를 만들지 않습니다.

구성되지 않은 데이터베이스는 데이터 API가 사용할 수 없음을 명시적으로 알립니다. 구성된 빈
데이터베이스는 정상적인 빈 결과를 반환합니다. 로컬 Supabase를 사용한다면 개발 환경에서만
`HEALTHMAP_ALLOW_LOCAL_DISCOVERY=1`과 루프백 `NEXT_PUBLIC_SUPABASE_URL`을 함께 설정하세요.
이 설정은 운영 환경의 HTTPS 구성 요구를 완화하지 않습니다.

## 검사

다음 명령은 현재 `package.json`의 스크립트입니다.

```sh
pnpm exec biome ci .
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:deployment
pnpm test:e2e
pnpm build
```

`test:e2e`는 테스트 소유 HTTP 응답으로 브라우저의 요청·오류 처리를 확인합니다. 이는 외부 장소
데이터의 사실성이나 운영 환경을 검증하지 않습니다. `.local/`은 개발 중 제안 임시 저장소로만 쓰이며
Git과 배포 업로드에서 제외됩니다.

`pnpm test:integration:local`은 Docker의 일회성 PostgreSQL 17 컨테이너에서 추적된 마이그레이션과
discovery·제안 SQL 계약을 확인합니다. 호스트 포트나 기존 데이터베이스를 사용하지 않습니다.
처음 실행하기 전에 `docker pull public.ecr.aws/supabase/postgres:17.6.1.158`으로 이미지를 준비해야 하며,
검사 명령은 이미지가 없으면 내려받지 않고 실패합니다.

구성된 배포 원본의 최소 응답을 확인하려면 다음을 실행합니다. 이 명령은 루트와 개인정보 안내,
현재 지도와 같은 `mode=places`, 기본 필터, 경계, 50개 제한 요청과 `limit=0`의 입력 오류 응답만 확인합니다.

```sh
pnpm deploy:smoke -- --base-url https://your-origin.example
```
