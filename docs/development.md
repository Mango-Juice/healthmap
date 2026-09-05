# 개발

## 요구 사항

Node.js 22와 `pnpm` 10을 사용합니다. 이 저장소에는 실제 카탈로그 행이나 서버 관리자 비밀값이
포함되지 않습니다.

```sh
pnpm install
cp .env.example .env.local
pnpm dev
```

`NEXT_PUBLIC_`으로 시작하는 값은 브라우저 번들에 포함될 수 있습니다. 지도와 데이터베이스를 직접
확인하려면 각자 사용할 공개 구성값을 `.env.local`에 넣으세요. 서버 관리자 키나 수집 자료는 예제
파일, 브라우저 환경 변수, 테스트 출력에 넣지 마세요.

구성되지 않은 데이터베이스는 데이터 API가 사용할 수 없음을 명시적으로 알립니다. 구성된 빈
데이터베이스는 정상적인 빈 결과를 반환해야 합니다. 데이터 없는 새 복제본에서의 전체 빌드 검증은
별도 준비 작업의 대상이므로, 아직 이 문서가 그 결과를 주장하지는 않습니다.

## 검사

다음 명령은 현재 `package.json`의 스크립트입니다.

```sh
pnpm exec biome ci .
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:integration:local
pnpm test:deployment
pnpm docs:check
pnpm test:e2e
pnpm build
```

`test:integration:local`은 로컬 Supabase 환경을 사용합니다. `supabase:start`, `supabase:status`,
`supabase:reset`, `supabase:stop`은 그 환경을 제어하는 별도 스크립트입니다. 공유 또는 호스팅된
데이터베이스에 초기화·검증 명령을 실행하지 마세요.
