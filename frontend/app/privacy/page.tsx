import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "../enterprise.css";

export const metadata: Metadata = { title: "개인정보처리방침 | 아침결", description: "아침결 구독 및 발송 서비스의 개인정보 처리 원칙" };

export default function PrivacyPage() {
  return <main className="enterprise-shell"><SiteHeader context="무료 알림 받기" /><LegalDocument title="개인정보처리방침" updated="시행일 · 2026년 9월 14일">
    <section><h2>운영 주체와 문의</h2><p>아침결은 GitHub 사용자 boclair98이 운영합니다. 개인정보 열람·삭제, 서비스 문의와 권리 침해 신고는 <a href="https://github.com/boclair98/achim-gyeol/issues">아침결 GitHub 문의 창구</a>에서 접수하며, 공개 게시가 곤란한 내용은 개인정보 자체를 적지 않고 비공개 연락 방법을 요청해 주세요.</p></section>
    <section><h2>1. 처리 원칙</h2><p>아침결은 뉴스 알림과 개인 설정 제공에 필요한 최소 정보만 사용합니다. 이름, 이메일, 전화번호와 위치정보는 요구하지 않습니다.</p></section>
    <section><h2>2. 처리 항목과 목적</h2><table><thead><tr><th>항목</th><th>이용 목적</th><th>보유 기간</th></tr></thead><tbody><tr><td>알림 등록과 발송 정보</td><td>평일 아침 뉴스 알림 보내기</td><td>알림 해지 시 삭제</td></tr><tr><td>관심 분야·읽을 분량·수신 동의</td><td>내 설정에 맞는 브리핑 제공</td><td>설정 삭제 또는 동의 철회 시까지</td></tr><tr><td>뉴스 열람·원문 이동·공유 여부</td><td>서비스 이용 편의 개선</td><td>최대 90일</td></tr><tr><td>다음 기능 선호 선택</td><td>서비스 개선과 기능 수요 파악</td><td>최대 90일</td></tr><tr><td>뉴스 오류 신고 내용</td><td>내용 확인과 수정</td><td>접수 후 최대 90일</td></tr></tbody></table></section>
    <section><h2>3. 외부 서비스 이용</h2><p>뉴스와 알림을 제공하기 위해 외부 서비스의 도움을 받을 수 있습니다. 이 경우 서비스 제공에 필요한 범위에서만 정보를 전달하며, 각 제공자는 자신의 개인정보처리방침에 따라 정보를 보호합니다.</p></section>
    <section><h2>4. 이용자의 권리</h2><p>알림 설정에서 아침결에 저장된 내 정보를 내려받거나 모두 삭제할 수 있습니다. 알림은 언제든 해지할 수 있습니다.</p></section>
    <section><h2>5. 정보 보호</h2><p>저장된 정보는 안전하게 관리하며, 서비스 운영에 필요한 사람만 접근할 수 있도록 보호합니다.</p></section>
    <section><h2>6. 문의와 내용 수정</h2><p>개인정보 관련 요청은 위 문의 창구에서 접수합니다. 뉴스 내용 오류는 각 브리핑의 오류 신고 기능으로 알려주시면 확인 후 필요한 내용을 바로잡습니다.</p></section>
  </LegalDocument><SiteFooter /></main>;
}

function LegalDocument({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return <article className="legal-document"><header><span>개인정보 안내</span><h1>{title}</h1><p>{updated}</p></header><div className="legal-notice"><strong>쉽고 분명하게 안내하겠습니다</strong><p>이용자 정보의 사용 목적이나 보유 기간이 바뀌면 이 문서를 함께 갱신합니다.</p></div>{children}</article>;
}
