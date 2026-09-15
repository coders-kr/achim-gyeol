"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BellRing, BookOpen, Check, Clock3, Download, KeyRound, RotateCcw, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, Users } from "lucide-react";
import { defaultReaderPreferences, type ReaderPreferences } from "@/lib/experience";
import { deviceHeaders } from "@/lib/device";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
const categories = ["정책", "경제", "금융", "사회", "국제", "테크", "생활", "문화", "스포츠", "e스포츠"];
const discoveryFeatures = [
  { key: "deep_briefing", icon: BookOpen, title: "심화 브리핑·주간 리포트", description: "한 주의 흐름과 배경까지 이어서 보기" },
  { key: "custom_topics", icon: KeyRound, title: "내가 고른 주제·키워드", description: "관심 키워드의 변화를 따로 모아 보기" },
  { key: "team_digest", icon: Users, title: "팀·가족과 함께 보기", description: "같은 브리핑을 공유하고 읽은 흐름 확인" },
] as const;
type DiscoveryFeatureKey = (typeof discoveryFeatures)[number]["key"];
const discoveryFeatureKeys = new Set<DiscoveryFeatureKey>(discoveryFeatures.map(({ key }) => key));

export function PreferenceCenter() {
  const [preferences, setPreferences] = useState<ReaderPreferences>(defaultReaderPreferences);
  const [notice, setNotice] = useState("");
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [featureVotes, setFeatureVotes] = useState<DiscoveryFeatureKey[]>([]);
  const [interestBusy, setInterestBusy] = useState(false);
  const [interestNotice, setInterestNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem("achim-gyeol-reader-preferences");
      if (stored) try {
        const parsed = JSON.parse(stored) as ReaderPreferences & { weekdays?: number[] };
        setPreferences({
          categories: parsed.categories,
          deliveryTime: "07:30",
          digestSize: parsed.digestSize,
          channels: parsed.channels,
          consent: parsed.consent,
        });
      } catch { /* Ignore malformed local data. */ }
      const storedInterest = window.localStorage.getItem("achim-gyeol-feature-interest");
      if (storedInterest) try {
        const parsed = JSON.parse(storedInterest) as { keys?: unknown };
        const keys = Array.isArray(parsed.keys) ? parsed.keys.filter((key): key is DiscoveryFeatureKey => typeof key === "string" && discoveryFeatureKeys.has(key as DiscoveryFeatureKey)) : [];
        setFeatureVotes(keys);
      } catch { /* Ignore malformed local data. */ }
      fetch(`${apiBase}/api/reader/preferences`, { headers: deviceHeaders(), cache: "no-store" })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((server: { categories: string; digestSize: ReaderPreferences["digestSize"]; consent: boolean }) => setPreferences((current) => ({ ...current, categories: server.categories.split(",").filter(Boolean), digestSize: server.digestSize, consent: server.consent })))
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const toggle = (field: "categories" | "channels", value: string) => setPreferences((current) => ({ ...current, [field]: current[field].includes(value) ? current[field].filter((item) => item !== value) : [...current[field], value] }));
  const toggleFeature = (key: DiscoveryFeatureKey) => setFeatureVotes((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  const saveFeatureInterest = async () => {
    if (featureVotes.length === 0) {
      setInterestNotice("관심 가는 기능을 하나 이상 선택해 주세요.");
      return;
    }
    setInterestBusy(true);
    window.localStorage.setItem("achim-gyeol-feature-interest", JSON.stringify({ version: 1, keys: featureVotes }));
    try {
      const events = [
        { type: "PREMIUM_INTENT", eventKey: "discovery_card" },
        ...featureVotes.map((eventKey) => ({ type: "PREMIUM_FEATURE_VOTE", eventKey })),
      ];
      const responses = await Promise.all(events.map((event) => fetch(`${apiBase}/api/reader/events`, {
        method: "POST",
        headers: deviceHeaders(),
        body: JSON.stringify({ ...event, editionId: 0, storyId: null }),
      })));
      if (responses.some((response) => !response.ok)) throw new Error("interest save failed");
      setInterestNotice("관심 기능을 기록했어요. 현재 결제나 자동 결제는 없습니다.");
    } catch {
      setInterestNotice("이 기기에 관심 기능을 저장했어요. 서버 연결 후 다시 보내 주세요. 결제는 없습니다.");
    } finally {
      setInterestBusy(false);
    }
  };
  const save = async () => {
    window.localStorage.setItem("achim-gyeol-reader-preferences", JSON.stringify({ ...preferences, deliveryTime: "07:30" }));
    try {
      const response = await fetch(`${apiBase}/api/reader/preferences`, { method: "PUT", headers: deviceHeaders(), body: JSON.stringify({ categories: preferences.categories, digestSize: preferences.digestSize, consent: preferences.consent }) });
      if (!response.ok) throw new Error("save failed");
      setNotice("내 관심 분야와 분량을 저장했습니다.");
    } catch { setNotice("이 기기에는 저장했습니다. 잠시 후 다시 한 번 저장해 주세요."); }
  };
  const exportData = async () => {
    setPrivacyBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/reader/data`, { headers: deviceHeaders(), cache: "no-store" });
      if (!response.ok) throw new Error("export failed");
      const serverData = await response.json();
      const deviceData = Object.fromEntries(
        Object.keys(window.localStorage)
          .filter((key) => key.startsWith("achim-gyeol-"))
          .map((key) => [key, window.localStorage.getItem(key)]),
      );
      const blob = new Blob([JSON.stringify({ server: serverData, device: deviceData }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "achim-gyeol-my-data.json"; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("아침결에 저장된 내 데이터를 내려받았습니다.");
    } catch { setNotice("내 데이터를 내려받지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setPrivacyBusy(false); }
  };
  const clearData = async () => {
    if (!window.confirm("아침결에 저장된 알림·설정·이용 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;
    setPrivacyBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/reader/data`, { method: "DELETE", headers: deviceHeaders() });
      if (!response.ok) throw new Error("delete failed");
      try {
        const registration = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
        const subscription = await registration?.pushManager?.getSubscription();
        await subscription?.unsubscribe();
      } catch {
        // The server record is already gone; unsupported browser APIs must not leave local personal data behind.
      }
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith("achim-gyeol-"))
        .forEach((key) => window.localStorage.removeItem(key));
      setPreferences(defaultReaderPreferences);
      setFeatureVotes([]);
      setInterestNotice("");
      setNotice("아침결에 저장된 내 데이터를 모두 삭제했습니다.");
    } catch { setNotice("데이터 삭제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setPrivacyBusy(false); }
  };

  return <>
    <section className="preference-hero"><span>내 브리핑 설정</span><h1>뉴스가 나를 방해하지 않도록,<br /><em>분량과 관심사를 직접 정합니다.</em></h1><p>관심 분야, 읽을 분량과 알림 여부를 한곳에서 관리합니다. 브리핑은 평일 오전 7시 30분에 도착합니다.</p></section>
    <section className="preference-layout">
      <div className="preference-main">
        <PreferenceBlock icon={SlidersHorizontal} title="관심 분야" description="분야를 가리지 않고 중요한 뉴스는 모두 제공하며, 선택한 분야의 카드를 먼저 보여드립니다."><div className="choice-grid">{categories.map((item) => <button key={item} className={preferences.categories.includes(item) ? "active" : ""} onClick={() => toggle("categories", item)}><Check size={14} />{item}</button>)}</div></PreferenceBlock>
        <PreferenceBlock icon={Clock3} title="도착 일정" description="등록된 기기에는 요일 선택 없이 평일 오전 7시 30분에 브리핑을 보냅니다."><div className="schedule-preference"><input aria-label="평일 고정 도착 시각" type="time" value="07:30" readOnly /></div></PreferenceBlock>
        <PreferenceBlock icon={BellRing} title="읽을 분량" description="아침에 읽고 싶은 설명의 길이를 정합니다."><div className="digest-options">{(["compact", "standard", "deep"] as const).map((size) => <button key={size} className={preferences.digestSize === size ? "active" : ""} onClick={() => setPreferences({ ...preferences, digestSize: size })}><strong>{size === "compact" ? "빠르게" : size === "standard" ? "기본" : "깊게"}</strong><span>{size === "compact" ? "결론 중심" : size === "standard" ? "핵심 내용 포함" : "원문까지 자세히"}</span></button>)}</div></PreferenceBlock>
        <PreferenceBlock icon={Sparkles} title="다음에 생기면 좋을 기능" description="지금은 계속 무료입니다. 어떤 기능이 생기면 더 자주 쓸지 알려주시면 다음 업데이트의 우선순위를 정하는 데 반영합니다."><div className="discovery-options">{discoveryFeatures.map(({ key, icon: Icon, title, description }) => { const selected = featureVotes.includes(key); return <button key={key} type="button" role="checkbox" aria-checked={selected} aria-label={title} className={`discovery-option${selected ? " active" : ""}`} onClick={() => toggleFeature(key)}><span className="discovery-option-icon"><Icon size={17} /></span><span className="discovery-option-copy"><strong>{title}</strong><small>{description}</small></span><span className="discovery-option-check" aria-hidden="true"><Check size={14} /></span></button>; })}</div><div className="discovery-footer"><p><ShieldCheck size={15} /> 선택한 기능만 익명으로 집계합니다. 이름·연락처는 받지 않습니다.</p><button type="button" className="studio-secondary" onClick={() => void saveFeatureInterest()} disabled={interestBusy}><Sparkles size={15} /> {interestBusy ? "저장 중…" : "관심 기능 저장"}</button></div>{interestNotice && <p className="discovery-status" role="status">{interestNotice}</p>}</PreferenceBlock>
      </div>
      <aside className="preference-summary"><span>MY BRIEFING</span><h2>나의 아침결</h2><dl><div><dt>관심 분야</dt><dd>{preferences.categories.length}개</dd></div><div><dt>도착 시간</dt><dd>{preferences.deliveryTime}</dd></div><div><dt>주기</dt><dd>평일</dd></div><div><dt>브리핑</dt><dd>{preferences.digestSize === "compact" ? "빠르게" : preferences.digestSize === "standard" ? "기본" : "깊게"}</dd></div></dl><label><input type="checkbox" checked={preferences.consent} onChange={(event) => setPreferences({ ...preferences, consent: event.target.checked })} /><span><strong>브리핑 수신에 동의합니다</strong><small>언제든 변경하거나 철회할 수 있습니다.</small></span></label><button className="studio-primary" onClick={() => void save()} disabled={privacyBusy}><Check size={15} /> 설정 저장</button><div className="privacy-actions"><button onClick={() => void exportData()} disabled={privacyBusy}><Download size={14} /> 내 데이터 받기</button><button onClick={() => setPreferences(defaultReaderPreferences)} disabled={privacyBusy}><RotateCcw size={14} /> 초기화</button><button className="danger" onClick={() => void clearData()} disabled={privacyBusy}><Trash2 size={14} /> 전체 데이터 삭제</button></div><footer><ShieldCheck size={16} /> 이름·이메일·전화번호 없이 설정을 저장합니다.</footer></aside>
    </section>
    {notice && <div className="notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>확인</button></div>}
  </>;
}

function PreferenceBlock({ icon: Icon, title, description, children }: { icon: typeof SlidersHorizontal; title: string; description: string; children: ReactNode }) {
  return <article className="preference-block"><header><Icon /><div><h2>{title}</h2><p>{description}</p></div></header>{children}</article>;
}
