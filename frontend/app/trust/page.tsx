import type { Metadata } from "next";
import { BookOpenCheck, CheckCircle2, FileClock, Flag, Newspaper, ShieldCheck } from "lucide-react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "../enterprise.css";

export const metadata: Metadata = {
  title: "서비스 원칙 | 아침결",
  description: "아침결이 독자에게 드리는 핵심 뉴스, 원문 제공, 오류 수정 약속을 안내합니다.",
};

const readerPromises = [
  { icon: Newspaper, title: "중요한 뉴스만", text: "하루를 시작하기 전에 알아야 할 소식을 골라 한곳에 담습니다." },
  { icon: CheckCircle2, title: "읽기 쉬운 요약", text: "한 줄 결론과 알아야 할 점을 먼저 보여드립니다." },
  { icon: BookOpenCheck, title: "관련 원문 제공", text: "더 궁금한 내용은 언론사 원문에서 바로 확인할 수 있습니다." },
  { icon: Flag, title: "오류 신고와 수정", text: "잘못된 내용을 알려주시면 확인하고 필요한 내용을 바로잡습니다." },
];

export default function TrustPage() {
  return <main className="enterprise-shell">
    <SiteHeader context="무료 알림 받기" />
    <section className="trust-hero"><span>아침결 서비스 원칙</span><h1>중요한 뉴스는 짧게,<br /><em>더 궁금하면 원문까지.</em></h1><p>아침결은 바쁜 아침에 꼭 필요한 뉴스를 읽기 편하게 전하고, 더 자세히 보고 싶은 독자에게 관련 원문을 함께 제공합니다.</p><div><b><Newspaper /> 핵심 뉴스</b><b><BookOpenCheck /> 관련 원문</b><b><FileClock /> 오류 수정</b></div></section>

    <section className="trust-section"><div className="trust-section-head"><span>독자에게 드리는 약속</span><h2>받는 사람이 편한 뉴스를 만듭니다.</h2><p>복잡한 설명보다 평일 실제로 받아볼 수 있는 가치를 보여드리겠습니다.</p></div><div className="method-grid">{readerPromises.map((item) => { const Icon = item.icon; return <article key={item.title}><Icon /><strong>{item.title}</strong><p>{item.text}</p><span><ShieldCheck /> 아침결 약속</span></article>; })}</div></section>

    <section className="ai-disclosure"><div><span>브리핑 구성</span><h2>아침에 필요한 순서로<br />간단하게 보여드립니다.</h2></div><ol><li><strong>한 줄 결론</strong><span>뉴스의 핵심을 먼저 읽습니다.</span></li><li><strong>핵심 내용</strong><span>꼭 알아야 할 내용을 짧게 확인합니다.</span></li><li><strong>알아야 할 점</strong><span>오늘의 생활과 일에 어떤 의미가 있는지 살펴봅니다.</span></li><li><strong>관련 원문</strong><span>더 자세한 내용은 원문으로 이어서 읽습니다.</span></li></ol></section>

    <section className="correction-public"><div className="trust-section-head"><span>오류 수정</span><h2>잘못된 내용은 그냥 두지 않습니다.</h2><p>신고된 내용을 확인해 필요한 경우 수정하고, 중요한 변경은 해당 브리핑에 안내합니다.</p></div><div><article><time><FileClock /> 이용자 제보</time><h3>각 뉴스에서 바로 알려주세요.</h3><p>어떤 내용이 원문과 다른지 적어주시면 확인에 도움이 됩니다.</p><footer><span>개인정보는 신고 내용에 적지 마세요.</span><b>신고 접수 중</b></footer></article></div></section>

    <section className="trust-contact"><Flag /><div><span>콘텐츠 오류 신고</span><h2>문제가 있는 내용을 발견하셨나요?</h2><p>해당 뉴스 아래에서 무엇이 다른지 알려주세요.</p></div><a href="/briefing">브리핑에서 신고하기</a></section>
    <SiteFooter />
  </main>;
}
