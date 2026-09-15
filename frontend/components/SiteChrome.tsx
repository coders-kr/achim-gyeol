import Link from "next/link";
import { ArrowUpRight, BellRing, Mail, Menu } from "lucide-react";
import { SubscriptionTrigger } from "@/components/SubscriptionExperience";

export function SiteHeader({ context = "무료 알림 받기" }: { context?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <i aria-hidden="true"><Mail size={15} strokeWidth={2.4} /></i>
        <strong>아침결</strong>
        <span>평일 아침, 어제의 뉴스</span>
      </Link>
      <nav aria-label="주요 메뉴">
        <div className="site-header-links">
          <Link href="/#how-it-works">이용 방법</Link>
          <Link href="/briefing">오늘의 뉴스</Link>
          <Link href="/archive">지난 뉴스</Link>
          <Link href="/trust">서비스 원칙</Link>
        </div>
        <details className="site-mobile-nav">
          <summary aria-label="메뉴 열기"><Menu size={17} aria-hidden="true" /><span>메뉴</span></summary>
          <div className="site-mobile-menu">
            <Link href="/#how-it-works">이용 방법</Link>
            <Link href="/briefing">오늘의 뉴스</Link>
            <Link href="/archive">지난 뉴스</Link>
            <Link href="/trust">서비스 원칙</Link>
            <Link href="/preferences">알림 설정</Link>
          </div>
        </details>
      </nav>
      <SubscriptionTrigger className="site-context"><BellRing size={14} /> {context}</SubscriptionTrigger>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="enterprise-footer">
      <div>
        <strong>아침결</strong>
        <p>어제 쏟아진 뉴스에서 오늘 알아야 할 흐름만 골라, 평일 아침 한 번에 전합니다.</p>
      </div>
      <nav aria-label="정책 문서">
        <Link href="/trust">서비스 원칙</Link>
        <Link href="/archive">지난 뉴스</Link>
        <Link href="/preferences">알림 설정</Link>
        <Link href="/privacy">개인정보처리방침</Link>
        <Link href="/terms">이용약관</Link>
        <a href="https://github.com/boclair98/achim-gyeol" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={12} /></a>
      </nav>
      <span>회원가입 없이 무료로 이용할 수 있습니다. 모든 뉴스에 관련 원문을 함께 제공합니다.</span>
    </footer>
  );
}
