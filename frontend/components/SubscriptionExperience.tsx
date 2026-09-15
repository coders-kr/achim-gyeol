"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { BellRing, CheckCircle2, Clock3, LockKeyhole, Smartphone, X } from "lucide-react";
import { PushControls } from "@/components/PushControls";
import { deviceHeaders } from "@/lib/device";

const openEvent = "achim:open-subscription";
const interestCategories = ["정책", "경제", "금융", "사회", "국제", "테크", "생활", "문화", "스포츠", "e스포츠"];
const defaultInterestCategories = [...interestCategories];
type DigestSize = "compact" | "standard" | "deep";

function readStoredCategories(): string[] {
  if (typeof window === "undefined") return defaultInterestCategories;
  try {
    const stored = JSON.parse(window.localStorage.getItem("achim-gyeol-reader-preferences") ?? "null") as { categories?: unknown } | null;
    const categories = Array.isArray(stored?.categories)
      ? stored.categories.filter((item): item is string => typeof item === "string" && interestCategories.includes(item))
      : [];
    return categories.length > 0 ? categories : defaultInterestCategories;
  } catch {
    return defaultInterestCategories;
  }
}

function readStoredDigestSize(): DigestSize {
  if (typeof window === "undefined") return "standard";
  try {
    const stored = JSON.parse(window.localStorage.getItem("achim-gyeol-reader-preferences") ?? "null") as { digestSize?: unknown } | null;
    return stored?.digestSize === "compact" || stored?.digestSize === "standard" || stored?.digestSize === "deep"
      ? stored.digestSize
      : "standard";
  } catch {
    return "standard";
  }
}

export function SubscriptionTrigger({ className, children }: { className?: string; children: ReactNode }) {
  return <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(openEvent))}>{children}</button>;
}

export function SubscriptionExperience({ onNotice }: { onNotice: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const deliveryTime = "07:30";
  const [subscribed, setSubscribed] = useState(false);
  const [externalBrowserHref, setExternalBrowserHref] = useState<string | null>(null);
  const [quickSubscribe, setQuickSubscribe] = useState(false);
  const [iphoneSafariSetup, setIphoneSafariSetup] = useState(false);
  const [deviceLabel, setDeviceLabel] = useState("이 브라우저에서 바로 등록할 수 있어요");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(readStoredCategories);
  const [digestSize, setDigestSize] = useState<DigestSize>(readStoredDigestSize);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("achim-gyeol-delivery");
    try {
      if (stored) JSON.parse(stored);
      if (stored) window.localStorage.setItem("achim-gyeol-delivery", JSON.stringify({ time: deliveryTime }));
    } catch {
      window.localStorage.removeItem("achim-gyeol-delivery");
    }
    fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/api/reader/preferences`, { headers: deviceHeaders(), cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((server: { categories?: string; digestSize?: DigestSize }) => {
        const serverCategories = server.categories?.split(",").filter((item) => interestCategories.includes(item)) ?? [];
        if (serverCategories.length > 0) setSelectedCategories(serverCategories);
        if (server.digestSize === "compact" || server.digestSize === "standard" || server.digestSize === "deep") setDigestSize(server.digestSize);
      })
      .catch(() => undefined);
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const detectedInAppBrowser = /KAKAOTALK|NAVER|Instagram|FBAN|FBAV/i.test(navigator.userAgent);
    const androidInAppBrowser = detectedInAppBrowser && /android/i.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    const detectedDeviceLabel = detectedInAppBrowser
      ? "알림 받기를 누르면 지원 브라우저로 자동 연결해요"
      : ios && !standalone
      ? "아이폰은 홈 화면에 추가한 뒤 등록할 수 있어요"
      : standalone
        ? "홈 화면에 설치된 아침결에서 등록 중이에요"
        : !("PushManager" in window)
          ? "Safari 또는 최신 Chrome·Edge에서 열어주세요"
          : "이 브라우저에서 바로 등록할 수 있어요";
    queueMicrotask(() => {
      setIphoneSafariSetup(ios && !standalone);
      setExternalBrowserHref(androidInAppBrowser ? buildAndroidBrowserHref() : null);
      setDeviceLabel(detectedDeviceLabel);
      const params = new URLSearchParams(window.location.search);
      const shouldQuickSubscribe = params.get("subscribe") === "1";
      setQuickSubscribe(shouldQuickSubscribe);
      if (params.get("ios-guide") === "1" || shouldQuickSubscribe) setOpen(true);
    });

    const show = () => {
      if (androidInAppBrowser) {
        window.location.href = buildAndroidBrowserHref();
        return;
      }
      setOpen(true);
    };
    window.addEventListener(openEvent, show);
    return () => window.removeEventListener(openEvent, show);
  }, []);

  const toggleCategory = (category: string) => {
    setSelectedCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category]);
  };

  const saveInterestPreferences = async () => {
    const categories = selectedCategories.length ? selectedCategories : defaultInterestCategories;
    const payload = { categories, digestSize, consent: true };
    window.localStorage.setItem("achim-gyeol-reader-preferences", JSON.stringify({
      categories,
      deliveryTime,
      digestSize,
      channels: ["알림"],
      consent: true,
    }));
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? ""}/api/reader/preferences`, {
        method: "PUT",
        headers: deviceHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("preference save failed");
    } catch {
      onNotice("관심 분야는 이 기기에 저장했어요. 알림 등록 후 잠시 뒤 다시 동기화해 주세요.");
    }
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => closeButton.current?.focus(), 40);
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <>
    {externalBrowserHref ? <a className="mobile-subscribe-bar" href={externalBrowserHref}>
      <BellRing size={17} />
      <span>무료 알림 받기</span>
      <b>한 번에</b>
    </a> : <button className={subscribed ? "mobile-subscribe-bar subscribed" : "mobile-subscribe-bar"} type="button" onClick={() => setOpen(true)}>
      {subscribed ? <CheckCircle2 size={17} /> : <BellRing size={17} />}
      <span>{subscribed ? `알림 등록됨 · ${deliveryTime}` : iphoneSafariSetup ? "Safari에서 무료 알림 설정" : "무료 알림 받기"}</span>
      <b>{subscribed ? "설정" : iphoneSafariSetup ? "안내" : "30초"}</b>
    </button>}

    {open && <div className="subscription-modal-layer" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-title">
        <header>
          <div><span>FREE SUBSCRIPTION</span><h2 id="subscription-title">내 아침 뉴스 알림</h2></div>
          <button ref={closeButton} type="button" aria-label="알림 등록 창 닫기" onClick={() => setOpen(false)}><X /></button>
        </header>

        <div className="device-readiness"><Smartphone size={19} /><div><strong>현재 기기 확인</strong><span>{deviceLabel}</span></div></div>

        {!quickSubscribe && <div className="modal-setting-grid">
          <div className="modal-time-field"><span><Clock3 size={15} /> 평일 고정 도착</span><div className="fixed-delivery-time"><strong>평일 오전 7:30</strong><small>주말에는 알림을 쉬어요</small></div></div>
        </div>}

        {!quickSubscribe && <div className="modal-arrival-preview">
          <div className="push-app-icon"><BellRing size={18} /></div>
          <div><strong>아침결 · 오늘 알아야 할 뉴스가 도착했어요</strong><span>평일 오전 7:30 · 핵심 내용과 알아야 할 것</span></div>
        </div>}

        {!iphoneSafariSetup && <section className="interest-survey" aria-labelledby="interest-survey-title">
          <header>
            <span>맞춤형 브리핑</span>
            <h3 id="interest-survey-title">어떤 뉴스를 먼저 볼까요?</h3>
            <p>관심 분야를 알려주시면 공통으로 중요한 뉴스는 모두 보내고, 선택한 분야를 앞쪽에 배치합니다.</p>
          </header>
          <div className="interest-choice-grid" role="group" aria-label="관심 뉴스 분야">
            {interestCategories.map((category) => {
              const selected = selectedCategories.includes(category);
              return <button key={category} type="button" className={selected ? "interest-choice active" : "interest-choice"} role="checkbox" aria-checked={selected} onClick={() => toggleCategory(category)}>
                <CheckCircle2 size={15} />{category}
              </button>;
            })}
          </div>
          <p className="interest-survey-note">선택하지 않은 분야도 중요한 뉴스라면 빠지지 않습니다.</p>
        </section>}

        <PushControls
          deliveryTime={deliveryTime}
          onNotice={(message) => { onNotice(message); }}
          onSubscriptionChange={setSubscribed}
          onBeforeSubscribe={saveInterestPreferences}
        />
        <p className="modal-privacy"><LockKeyhole size={14} /> 이름·이메일·전화번호 없이 알림에 필요한 정보만 사용합니다.</p>
      </section>
    </div>}
  </>;
}

function buildAndroidBrowserHref() {
  const target = new URL(window.location.href);
  target.searchParams.set("subscribe", "1");
  target.hash = "";
  const destination = `${target.host}${target.pathname}${target.search}`;
  return `intent://${destination}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;S.browser_fallback_url=${encodeURIComponent(target.toString())};end`;
}
