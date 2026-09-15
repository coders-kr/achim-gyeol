"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { BellRing, ChevronLeft, ChevronRight, Images } from "lucide-react";
import { demoBriefing, type Briefing } from "@/lib/briefing";
import { buildBriefingCards, type BriefingCard } from "@/lib/briefing-card";
import { defaultBrand } from "@/lib/product";
import { SubscriptionTrigger } from "@/components/SubscriptionExperience";

const assetBase = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
type Props = {
  briefing: Briefing;
};

export function DeliveryDeck({ briefing }: Props) {
  const previewOnly = briefing.stories.length === 0;
  const cards = useMemo(() => buildBriefingCards(previewOnly ? demoBriefing : briefing, defaultBrand), [briefing, previewOnly]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentCard = cards[currentIndex];

  return (
    <section className="delivery-studio subscription-studio" id="delivery-deck">
      <div className="landing-section-heading delivery-heading-clean">
        <span>FREE SUBSCRIPTION</span>
        <h2>한 번 등록하면 평일 도착해요</h2>
        <p>회원가입도, 앱스토어 설치도 필요 없습니다. 이 기기의 알림만 한 번 허용해 주세요.</p>
      </div>

      <div className="delivery-layout subscription-layout">
        <div className="deck-preview">
          <div className="deck-counter"><Images size={15} /> {previewOnly ? "예시 뉴스 카드 미리보기" : "공유용 뉴스 카드 미리보기"} · {currentIndex + 1}/{cards.length}</div>
          <div className="card-stack" aria-live="polite">
            <div className="stack-sheet stack-two" aria-hidden="true" />
            <div className="stack-sheet stack-one" aria-hidden="true" />
            <BriefingCardPreview card={currentCard} />
          </div>
          <div className="deck-navigation">
            <button aria-label="이전 카드" onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))} disabled={currentIndex === 0}><ChevronLeft /></button>
            <div className="deck-dots" aria-label="카드 선택">
              {cards.map((card, index) => <button key={card.id} className={index === currentIndex ? "active" : ""} aria-label={`${index + 1}번 카드`} onClick={() => setCurrentIndex(index)} />)}
            </div>
            <button aria-label="다음 카드" onClick={() => setCurrentIndex((index) => Math.min(cards.length - 1, index + 1))} disabled={currentIndex === cards.length - 1}><ChevronRight /></button>
          </div>
          <Link className="deck-detail-link" href="/briefing">오늘의 모바일 뉴스 전체 보기 →</Link>
        </div>

        <div className="subscription-panel quick-subscription-card">
          <div className="subscription-panel-head">
            <div className="subscription-bell"><BellRing /></div>
            <div><span>30초 무료 등록</span><h3>내일부터 받아보세요</h3></div>
          </div>
          <p className="subscription-description">버튼을 누르고 알림만 허용하면 됩니다. 다른 페이지로 이동하거나 회원가입할 필요가 없습니다.</p>
          <div className="quick-arrival-card"><span>정규 도착 시간</span><strong>오전 7:30</strong><small>꼭 필요한 뉴스를 한눈에</small></div>
          <div className="simple-onboarding">
            <span><b>1</b> 알림 버튼 누르기</span>
            <i />
            <span><b>2</b> 알림 허용</span>
            <i />
            <span><b>3</b> 다음 아침부터 수신</span>
          </div>
          <SubscriptionTrigger className="quick-subscribe-button"><BellRing size={17} /> 이 기기에 무료 알림 등록</SubscriptionTrigger>
          <div className="privacy-note">알림에 필요한 최소 정보만 사용하며, 이름·이메일·전화번호를 받지 않습니다.</div>
        </div>
      </div>
    </section>
  );
}

export function BriefingCardPreview({ card }: { card: BriefingCard }) {
  if (card.kind === "cover") {
    return (
      <article className="delivery-card cover-card" style={{ "--tenant-accent": card.brand.accent, backgroundImage: `linear-gradient(180deg, rgba(7,53,37,.08), rgba(7,45,32,.92)), url(${assetBase}/briefing-card-bg.png)` } as CSSProperties}>
        <span className="delivery-badge">평일 아침 · 어제의 뉴스</span>
        <div className="cover-brand">{card.brand.name}</div>
        <div className="cover-copy"><h3>어제의 소음은 빼고,<br />오늘 필요한 뉴스만.</h3><p>{card.briefing.lead}</p></div>
        <div className="cover-stats"><strong>{card.briefing.stories.length}개 핵심 뉴스</strong><span>원문 함께 제공 · 약 {card.briefing.readMinutes}분</span></div>
      </article>
    );
  }
  if (card.kind === "closing") {
    return (
      <article className="delivery-card closing-card">
        <span>YESTERDAY IN ONE PAGE</span><h3>어제의 흐름,<br />이렇게 기억하세요.</h3>
        <ol>{card.briefing.stories.map((story, index) => <li key={story.id}><strong>{String(index + 1).padStart(2, "0")}</strong><span>{story.title}</span></li>)}</ol>
        <footer><strong>{card.brand.name}</strong><span>핵심 요약과 원문을 함께 제공합니다</span></footer>
      </article>
    );
  }
  const verified = card.story.verificationStatus === "VERIFIED";
  const evidenceReady = card.story.evidenceAvailable && Boolean(card.story.claims?.length);
  const claims = evidenceReady ? card.story.claims!.slice(0, 2) : summaryPoints(card.story.summary).slice(0, 2).map((statement) => ({ statement, sources: [] }));
  return (
    <article className="delivery-card summary-card">
      <header><strong>{card.brand.name} · MORNING NEWS</strong><span>{String(card.index).padStart(2, "0")} / {String(card.briefing.stories.length).padStart(2, "0")}</span></header>
      <div className="summary-kicker"><span>{card.story.category}</span><em>{evidenceReady ? (verified ? "● 원문 함께 보기" : "● 내용 정리 중") : "● 원문 목록 제공"}</em></div>
      <h3>{card.story.title}</h3>
      <div className="card-conclusion"><strong>한 줄 결론</strong><p>{storyConclusion(card.story)}</p></div>
      <div className="ai-summary"><strong>핵심 내용</strong><ul>{claims.map((claim, index) => <li key={`${claim.statement}-${index}`}><span>{claim.statement}</span>{claim.sources.length > 0 && <small> [{claim.sources.map((source) => card.story.sources.findIndex((item) => item.url === source.url) + 1).filter((number) => number > 0).join("·")}]</small>}</li>)}</ul></div>
      <div className="matter-box"><strong>알아야 할 것</strong><p>{card.story.whyItMatters}</p></div>
      <footer><span>관련 원문 {card.story.sources.length}개</span><span>약 {card.briefing.readMinutes}분 브리핑</span></footer>
    </article>
  );
}

function summaryPoints(summary: string) {
  const points = summary.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return points.length > 1 ? points.slice(0, 3) : [summary];
}

function storyConclusion(story: Briefing["stories"][number]) {
  return story.oneLineSummary?.trim() || summaryPoints(story.summary)[0] || story.title;
}
