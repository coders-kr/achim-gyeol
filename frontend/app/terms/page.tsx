import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "../enterprise.css";

export const metadata: Metadata = { title: "이용약관 | 아침결", description: "아침결 뉴스 브리핑 서비스 이용약관" };

export default function TermsPage() {
  return <main className="enterprise-shell"><SiteHeader context="무료 알림 받기" /><article className="legal-document"><header><span>서비스 이용 안내</span><h1>서비스 이용약관</h1><p>시행일 · 2026년 8월 15일</p></header><div className="legal-notice"><strong>운영자 안내</strong><p>아침결은 GitHub 사용자 boclair98이 운영하는 무료 공개 베타 서비스입니다. 문의와 권리 침해 신고는 <a href="https://github.com/boclair98/achim-gyeol/issues">GitHub 문의 창구</a>에서 접수합니다. 현재 유료 결제와 후원 기능은 제공하지 않습니다.</p></div>
    <section><h2>1. 서비스의 목적</h2><p>아침결은 전날의 중요한 뉴스를 읽기 쉽게 정리해 평일 아침 알림과 모바일 브리핑 화면으로 제공하는 무료 공개 베타 서비스입니다.</p></section>
    <section><h2>2. 요약의 한계</h2><p>아침결의 요약은 빠른 이해를 돕기 위한 내용이며 원문 전체나 전문적인 조언을 대신하지 않습니다. 중요한 판단 전에는 함께 제공된 원문과 공식 자료를 확인해 주세요.</p></section>
    <section><h2>3. 콘텐츠와 출처</h2><p>원문에 대한 권리는 각 제공자에게 있습니다. 이용자는 아침결의 결과물을 허용 범위 밖으로 재판매하거나 원문인 것처럼 표시할 수 없습니다.</p></section>
    <section><h2>4. 알림과 수신 철회</h2><p>이용자는 뉴스 알림을 직접 선택하며 언제든 해지할 수 있습니다. 해지 후에는 법적으로 보관해야 하는 경우를 제외하고 알림에 사용한 정보를 삭제합니다.</p></section>
    <section><h2>5. 정정과 발행 중단</h2><p>중대한 오류나 출처 분쟁이 확인되면 해당 브리핑의 노출과 발송을 중지할 수 있습니다. 정정 내용, 시각, 이유와 재발송 여부는 정정 이력에 남깁니다.</p></section>
    <section><h2>6. 금지 행위</h2><p>무단 대량 수집, 서비스 장애 유발, 타인의 권리 침해, 출처 삭제, 오인·사칭, 불법 광고나 스팸 전송에 서비스를 사용할 수 없습니다.</p></section>
    <section><h2>7. 콘텐츠 오류 신고</h2><p>각 브리핑의 오류 신고 기능에서 문제가 된 내용을 알려줄 수 있습니다. 일반 문의와 권리 행사는 GitHub 문의 창구에서 접수하며 개인정보는 공개 문의에 직접 작성하지 않아야 합니다.</p></section>
  </article><SiteFooter /></main>;
}
