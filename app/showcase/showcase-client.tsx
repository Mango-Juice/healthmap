"use client"

import {
  AlertTriangleIcon,
  NavigationIcon,
  RotateCcwIcon,
} from "../../components/ui/health-map-icons"
import {
  ActionButton,
  EmptyState,
  FilterRail,
  SkeletonDetail,
  StatusAlert,
} from "../../components/ui/health-map-primitives"
import styles from "./showcase.module.css"
import galleryStyles from "./showcase-gallery.module.css"

const buttonStates = [
  { label: "기본", state: "default" },
  { label: "호버", state: "hover" },
  { label: "포커스", state: "focus" },
  { label: "활성", state: "active" },
] as const

export function ShowcaseClient() {
  return (
    <div className={styles["showcaseBody"]}>
      <section aria-labelledby="control-states-heading" className={styles["showcaseSection"]}>
        <div className={styles["sectionHeading"]}>
          <div>
            <span className={styles["stateLabel"]}>INTERACTION STATES</span>
            <h2 id="control-states-heading">필터와 버튼</h2>
          </div>
          <span>크기는 유지하고 상태만 바뀝니다.</span>
        </div>
        <div className={galleryStyles["stateGrid"]}>
          {buttonStates.map((item) => (
            <article
              className={galleryStyles["stateCell"]}
              data-testid={`state-${item.state}`}
              key={item.state}
            >
              <span>{item.label}</span>
              <div data-demo-state={item.state}>
                <ActionButton leadingIcon={<NavigationIcon />} variant="primary">
                  길찾기
                </ActionButton>
              </div>
            </article>
          ))}
          <article className={galleryStyles["stateCell"]} data-testid="state-disabled">
            <span>비활성</span>
            <ActionButton disabled leadingIcon={<NavigationIcon />} variant="primary">
              길찾기
            </ActionButton>
          </article>
          <article className={galleryStyles["stateCell"]} data-testid="state-loading">
            <span>로딩</span>
            <ActionButton loading variant="primary">
              길찾기
            </ActionButton>
          </article>
        </div>
        <div className={galleryStyles["filterExamples"]}>
          <FilterRail selected="vegetables" />
          <FilterRail disabled selected="all" />
        </div>
      </section>

      <section aria-labelledby="feedback-heading" className={styles["showcaseSection"]}>
        <div className={styles["sectionHeading"]}>
          <div>
            <span className={styles["stateLabel"]}>FEEDBACK STATES</span>
            <h2 id="feedback-heading">알림, 로딩, 오류, 빈 상태</h2>
          </div>
          <span>복구 행동과 안정적인 높이를 함께 검증합니다.</span>
        </div>
        <div className={galleryStyles["feedbackGrid"]}>
          <article className={galleryStyles["feedbackCell"]} data-testid="state-info">
            <span>안내</span>
            <StatusAlert
              description="현재 위치를 사용 중입니다. 지도 중심은 저장하지 않아요."
              title="내 주변을 확인하고 있어요."
              tone="info"
            />
          </article>
          <article className={galleryStyles["feedbackCell"]} data-testid="state-loading-detail">
            <span>로딩</span>
            <SkeletonDetail />
          </article>
          <article className={galleryStyles["feedbackCell"]} data-testid="state-error">
            <span>오류</span>
            <StatusAlert
              action={
                <ActionButton leadingIcon={<RotateCcwIcon />} variant="danger">
                  다시 시도
                </ActionButton>
              }
              description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
              title="지도를 불러오지 못했어요."
              tone="error"
            />
          </article>
          <article className={galleryStyles["feedbackCell"]} data-testid="state-empty">
            <span>빈 상태</span>
            <EmptyState
              description="다른 건강식 유형을 선택하면 주변 장소를 다시 보여 드릴게요."
              title="조건에 맞는 장소가 없어요."
            />
          </article>
        </div>
      </section>

      <section
        aria-labelledby="stress-heading"
        className={galleryStyles["stressSection"]}
        data-testid="state-stress"
      >
        <div>
          <span className={styles["stateLabel"]}>CONTENT STRESS</span>
          <h2 id="stress-heading">긴 한국어와 끊김 없는 문자열</h2>
        </div>
        <StatusAlert
          action={
            <ActionButton leadingIcon={<AlertTriangleIcon />} variant="secondary">
              다시 시도
            </ActionButton>
          }
          description={
            <>
              주변에서 지금 선택한 조건에 맞는 건강식 장소를 아직 찾지 못했어요.{" "}
              <span className={galleryStyles["unbrokenText"]}>
                https://example.com/this-is-an-intentionally-unbroken-accessibility-stress-string
              </span>
            </>
          }
          title="선택한 식물성 중심 메뉴 조건을 다시 확인해 주세요."
          tone="info"
        />
      </section>
    </div>
  )
}
