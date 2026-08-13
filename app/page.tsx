import { getMissingPublicEnvironmentNames } from "./public-environment"

export default function HomePage() {
  const missingEnvironmentNames = getMissingPublicEnvironmentNames(process.env)

  return (
    <main>
      <h1>건강식 지도</h1>
      {missingEnvironmentNames.length > 0 ? (
        <section aria-labelledby="configuration-heading">
          <h2 id="configuration-heading">환경 설정이 필요합니다</h2>
          <p>다음 공개 환경 변수 이름을 배포 환경에 설정해 주세요.</p>
          <ul>
            {missingEnvironmentNames.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      ) : (
        <p>공개 환경 설정이 완료되었습니다.</p>
      )}
    </main>
  )
}
