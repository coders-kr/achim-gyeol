"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  ChevronDown,
  ExternalLink,
  Newspaper,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { DeliveryDeck } from "@/components/DeliveryDeck";
import { StoryVisual } from "@/components/StoryVisual";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { SubscriptionExperience, SubscriptionTrigger } from "@/components/SubscriptionExperience";
import { briefingCategoryOrder, demoBriefing, unavailableBriefing, type Briefing, type Story } from "@/lib/briefing";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export function BriefingApp() {
  const [briefing, setBriefing] = useState<Briefing>(unavailableBriefing);
  const [category, setCategory] = useState("전체");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);
  const [notice, setNotice] = useState("오늘의 아침 뉴스를 불러오고 있어요.");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${apiBase}/api/briefings/today`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("briefing unavailable");
        return response.json();
      })
      .then((data: Briefing) => {
        setBriefing(data);
        setLoadError(false);
        setNotice(data.productionReady ? "" : "현재는 사용법을 보여드리는 화면 예시입니다. 준비된 뉴스는 평일 오전 7시 30분에 보내드립니다.");
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setBriefing(unavailableBriefing);
        setLoadError(true);
        setNotice("오늘의 브리핑을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = safeJsonParse<{ categories?: unknown }>(window.localStorage.getItem("achim-gyeol-reader-preferences"), {});
      setPreferredCategories(Array.isArray(stored.categories) ? stored.categories.filter((value): value is string => typeof value === "string") : []);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const stories = useMemo(
    () => {
      const editorialStories = briefing.stories.length <= 3 || preferredCategories.length === 0
        ? briefing.stories
        : [
            ...briefing.stories.slice(0, 3),
            ...briefing.stories.slice(3).sort((a, b) => Number(preferredCategories.includes(b.category)) - Number(preferredCategories.includes(a.category))),
          ];
      return category === "전체" ? editorialStories : editorialStories.filter((story) => story.category === category);
    },
    [briefing, category, preferredCategories],
  );
  const categories = useMemo(
    () => ["전체", ...briefingCategoryOrder.filter((item) => briefing.stories.some((story) => story.category === item))],
    [briefing.stories],
  );

  return (
    <main className="page-shell landing-shell">
      <SiteHeader />

      <section className="landing-hero" id="top">
        <div className="landing-hero-copy">
          <span className="landing-kicker"><Sparkles size={15} /> 바쁜 사람을 위한 아침 뉴스 브리핑</span>
          <h1>어제 뉴스를,<br /><em>평일 아침 한 번에.</em></h1>
          <p>가장 중요한 3건부터 전체 흐름까지. 한 줄 결론, 쉬운 이해 포인트, 원문 출처를 한 화면에 정리해 드립니다.</p>
          <div className="landing-hero-actions">
            <SubscriptionTrigger className="landing-primary"><BellRing size={18} /> 무료 알림 받기</SubscriptionTrigger>
            <Link className="landing-text-link" href="/briefing">오늘의 뉴스 읽기 <ArrowRight size={16} /></Link>
          </div>
          <div className="landing-promises">
            <span><Check size={14} /> 회원가입 없음</span>
            <span><Check size={14} /> 무료 이용</span>
            <span><Check size={14} /> 원문 출처 제공</span>
          </div>
        </div>

        <div className="landing-hero-visual" aria-label="아침결 알림과 뉴스 카드 예시">
          <div className="hero-orbit hero-orbit-one" aria-hidden="true" />
          <div className="hero-orbit hero-orbit-two" aria-hidden="true" />
          <div className="phone-mockup">
            <HeroNewsCarousel stories={briefing.stories} readMinutes={briefing.readMinutes} />
          </div>
          <div className="hero-floating-note"><ShieldCheck size={18} /><div><strong>출처까지 함께</strong><span>요약만 믿지 않아도 돼요</span></div></div>
        </div>
      </section>

      <section className="landing-proof" aria-label="서비스 핵심 특징">
        <div><strong>07:30</strong><span>평일 아침 정규 도착</span></div>
        <div><strong>TOP 3</strong><span>먼저 보는 핵심 뉴스</span></div>
        <div><strong>10+</strong><span>하루의 주요 흐름</span></div>
        <div><strong>0원</strong><span>회원가입 없이 무료</span></div>
      </section>

      <section className="how-section" id="how-it-works">
        <div className="landing-section-heading">
          <span>HOW IT WORKS</span>
          <h2>아침결은 이렇게 도착해요</h2>
          <p>설정은 한 번만. 그다음부터는 전날의 중요한 흐름을 평일 아침 가볍게 확인하세요.</p>
        </div>
        <div className="how-grid">
          <article><div className="how-icon mint"><Clock3 /></div><small>01 · 핵심만</small><h3>중요한 흐름을 골라 드려요</h3><p>정책·경제·금융부터 문화·스포츠·e스포츠까지, 하루를 시작하기 전에 알아야 할 소식을 분야별로 담습니다.</p></article>
          <article><div className="how-icon violet"><BookOpen /></div><small>02 · 읽기 쉽게</small><h3>배경부터 의미까지 풀어드려요</h3><p>낯선 용어와 배경은 일상어로 풀고, 무엇이 달라지는지와 관련 원문을 함께 보여드립니다.</p></article>
          <article><div className="how-icon yellow"><Smartphone /></div><small>03 · 평일 아침</small><h3>오전 7시 30분에 받아요</h3><p>휴대폰 알림을 누르면 큰 글자로 정리된 뉴스 전용 화면이 바로 열립니다. 주말에는 알림을 쉬어요.</p></article>
        </div>
      </section>

      <DeliveryDeck briefing={briefing} />

      <section className="archive-section" id="archive">
        <div className="landing-section-heading split-heading">
          <div><span>TODAY&apos;S BRIEFING</span><h2>오늘 아침, 이 뉴스부터</h2></div>
          <p>짧게 읽고 더 궁금한 뉴스만 원문으로 이어서 확인할 수 있습니다.</p>
        </div>
        <nav className="archive-nav" aria-label="뉴스 분야">
          {categories.map((item) => <button key={item} className={category === item ? "active" : ""} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
        </nav>
        {preferredCategories.length > 0 && <div className="archive-personalized-note" role="status"><Sparkles size={14} /><span><strong>내 관심 분야를 먼저 보여드려요</strong><small>{preferredCategories.slice(0, 3).join(" · ")}</small></span></div>}
        <div className="story-list">
          {loading ? <LoadingRows /> : loadError ? <div className="empty briefing-error" role="alert"><strong>오늘의 브리핑을 불러오지 못했어요.</strong><span>실제 뉴스 대신 예시 데이터를 보여주지 않습니다.</span><button type="button" onClick={() => setRequestVersion((version) => version + 1)}>다시 시도</button></div> : stories.length ? stories.slice(0, 4).map((story, index) => <StoryRow key={story.id} story={story} index={index + 1} personalized={preferredCategories.includes(story.category)} onNotice={setNotice} />) : <div className="empty">오늘 이 분야에 선정된 브리핑은 없습니다.</div>}
        </div>
        <div className="archive-more"><Link href="/archive">지난 브리핑 전체 보기 <ArrowRight size={15} /></Link></div>
      </section>

      <section className="trust-strip">
        <div><span>WHY ACHIMGYEOL</span><h2>바쁜 아침에도<br />중요한 뉴스는 놓치지 않게</h2><p>핵심은 짧게 읽고, 더 궁금한 내용은 함께 제공되는 원문으로 바로 이어서 확인할 수 있습니다.</p><Link href="/trust">서비스 원칙 보기 <ArrowRight size={15} /></Link></div>
        <ol>
          <li><ShieldCheck /><div><strong>핵심부터 한눈에</strong><span>한 줄 결론과 알아야 할 점을 먼저 보여드립니다.</span></div></li>
          <li><BookOpen /><div><strong>원문을 바로 확인</strong><span>모든 뉴스 카드에 언론사와 원문 링크를 표시합니다.</span></div></li>
          <li><RefreshCw /><div><strong>오류는 바로 수정</strong><span>잘못된 내용을 발견하면 알리고 바로잡습니다.</span></div></li>
        </ol>
      </section>

      <section className="faq-section">
        <div className="landing-section-heading"><span>FAQ</span><h2>자주 묻는 질문</h2></div>
        <div className="faq-list">
          <details open><summary>아침결은 무료인가요?</summary><p>네. 현재 회원가입과 결제 없이 무료로 이용할 수 있으며, 도네이트·유료 구독 기능도 사용하지 않습니다.</p></details>
          <details><summary>어떤 뉴스가 오나요?</summary><p>정책·경제·사회·국제·테크·생활·문화·스포츠·e스포츠에서 하루를 시작하기 전에 알아야 할 중요한 소식을 골라 다음 날 아침에 보내드립니다.</p></details>
          <details><summary>아이폰에서도 알림을 받을 수 있나요?</summary><p>네. Safari에서 아침결을 홈 화면에 추가한 뒤 홈 화면 아이콘으로 열고 ‘이 기기에 알림 등록’을 누르면 됩니다.</p></details>
          <details><summary>언제 받아볼 수 있나요?</summary><p>한 번 알림을 등록하면 평일 오전 7시 30분(한국 시간)에 받아볼 수 있습니다. 토요일과 일요일에는 알림을 보내지 않습니다.</p></details>
        </div>
      </section>

      <section className="closing-cta">
        <div><span>내일부터 시작해요</span><h2>어제의 뉴스를<br />아침 한 번으로 끝내세요.</h2><p>30초면 설정이 끝납니다. 회원가입 없이 이 기기에 바로 등록하세요.</p></div>
        <SubscriptionTrigger className="landing-primary light"><BellRing size={18} /> 무료 알림 받기</SubscriptionTrigger>
      </section>

      <SiteFooter />
      <SubscriptionExperience onNotice={setNotice} />

      {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>확인</button></div>}
    </main>
  );
}

function HeroNewsCarousel({ stories, readMinutes }: { stories: Story[]; readMinutes: number }) {
  const previewStories = useMemo(() => (stories.length ? stories : demoBriefing.stories).slice(0, 5), [stories]);
  const hasLiveStories = stories.length > 0;
  const [cycle, setCycle] = useState(0);
  const [visible, setVisible] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const signature = previewStories.map((story) => story.id).join(":");
  const activeIndex = previewStories.length ? cycle % previewStories.length : 0;
  const previousIndex = cycle > 0 && previewStories.length ? (cycle - 1) % previewStories.length : -1;

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || previewStories.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setCycle((current) => current + 1);
    }, 4800);
    return () => window.clearInterval(timer);
  }, [previewStories.length, visible, signature]);

  return (
    <div ref={rootRef} className="hero-auto-carousel" aria-label="중요 뉴스가 자동으로 넘어가는 미리보기" aria-live="off">
      <div className="phone-status">
        <span>7:30</span>
        <span className="hero-slide-dots" aria-hidden="true">
          {previewStories.map((story, index) => <i key={`${story.id}-dot`} className={index === activeIndex ? "active" : ""} />)}
        </span>
      </div>
      <div className="push-mockup">
        <div className="push-app-icon"><Newspaper size={19} /></div>
        <div><strong>아침결</strong><span>지금</span><p>{hasLiveStories ? `어제 핵심 뉴스 ${stories.length}건이 도착했어요` : "예시 뉴스 카드 미리보기"}</p></div>
      </div>
      <div className="hero-news-window">
        {previewStories.map((story, index) => {
          const state = index === activeIndex ? "active" : index === previousIndex ? "leaving" : "waiting";
          return (
            <article key={`${story.id}-${index}`} className={`hero-news-card ${state}`} aria-hidden={state !== "active"}>
              <StoryVisual story={story} variant="hero" priority={index === 0} />
              <div><span>{story.category}</span><b>원문 포함</b></div>
              <h2>{story.title}</h2>
              <p>{story.summary}</p>
              <footer><span>약 {readMinutes}분</span><span>출처 {story.sources.length}개</span></footer>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function StoryRow({ story, index, personalized = false, onNotice }: { story: Story; index: number; personalized?: boolean; onNotice: (message: string) => void }) {
  const verified = story.verificationStatus === "VERIFIED";
  const evidenceReady = story.evidenceAvailable && Boolean(story.claims?.length);
  const featuredLayout = index === 1 && Boolean(story.imageUrl);
  return (
    <article className={`story-row${featuredLayout ? " story-row-featured" : ""}`}>
      <div className="story-index">{String(index).padStart(2, "0")}</div>
      <div className="story-body">
        <div className="story-card-main">
          <StoryVisual story={story} variant="row" />
          <div className="story-card-copy">
            <div className="story-kicker"><span className="category">{story.category}</span>{personalized && <span className="story-personalized"><Sparkles size={12} /> 맞춤 추천</span>}<span className={verified && evidenceReady ? "verified" : "verified developing"}><CheckCircle2 size={13} />{evidenceReady ? (verified ? "출처 보기" : "내용 확인 중") : "원문 제공"}</span></div>
            <h3>{story.title}</h3>
            <div className="story-conclusion"><strong>한 줄 결론</strong><p>{story.oneLineSummary || firstSentence(story.summary)}</p></div>
            <div className="story-easy"><strong>이해 포인트</strong><p>{story.plainExplanation || story.summary}</p></div>
            <details className="story-details">
              <summary><span>핵심 내용과 맥락</span><ChevronDown size={16} aria-hidden="true" /></summary>
              <div className="story-details-content">
                <div className="story-summary"><strong>핵심 내용</strong>{evidenceReady ? <ul>{story.claims!.slice(0, 3).map((claim, claimIndex) => {
                  const sourceNumbers = claim.sources.map((source) => story.sources.findIndex((item) => item.url === source.url) + 1).filter((number) => number > 0);
                  return <li key={`${claim.statement}-${claimIndex}`}>{claim.statement}{sourceNumbers.length > 0 && <small> [{sourceNumbers.join("·")}]</small>}</li>;
                })}</ul> : <p className="summary">{story.summary}</p>}</div>
                <div className="why"><strong>알아야 할 것</strong><span>{story.whyItMatters}</span></div>
                {story.uncertainty && <div className="story-uncertainty"><strong>더 지켜볼 내용</strong><span>{story.uncertainty}</span></div>}
              </div>
            </details>
          </div>
        </div>
        <div className="source-row">
          <span>출처 {story.sources.map((source) => source.publisher).join(" · ")}</span>
          <div className="story-actions">
            <button type="button" aria-label="오류 신고" onClick={() => onNotice("오류 신고를 기록했어요. 검수 대기열에서 확인하겠습니다.")}><RefreshCw size={15} /></button>
            <a aria-label="첫 번째 원문 열기" href={story.sources[0]?.url ?? "#"} target="_blank" rel="noreferrer">원문 <ExternalLink size={14} /></a>
          </div>
        </div>
      </div>
    </article>
  );
}

function firstSentence(summary: string) {
  return summary.trim().split(/(?<=[.!?])\s+/)[0] || summary;
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function LoadingRows() {
  return <>{[1, 2, 3].map((item) => <div className="story-row loading-row" key={item}><div className="story-index">0{item}</div><div className="story-body"><div className="skeleton short" /><div className="skeleton title" /><div className="skeleton copy" /></div></div>)}</>;
}
