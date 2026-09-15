import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/PwaRegister";

import "./globals.css";
import "./chrome.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://morningnews.coders.kr";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const socialImageUrl = new URL("og-v2.png", `${siteUrl.replace(/\/$/, "")}/`).toString();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "아침결 — 어제 뉴스를 평일 아침 한 번에",
  description: "전날의 중요한 뉴스를 읽기 쉽게 정리해 평일 오전 7시 30분 알림으로 전하는 무료 뉴스 브리핑.",
  manifest: `${basePath}/manifest.webmanifest`,
  icons: {
    icon: [{ url: `${basePath}/mail-icon.svg`, type: "image/svg+xml" }],
    shortcut: `${basePath}/mail-icon.svg`,
    apple: `${basePath}/mail-icon.svg`,
  },
  applicationName: "아침결",
  appleWebApp: { capable: true, title: "아침결", statusBarStyle: "default" },
  openGraph: {
    title: "아침결 — 어제 뉴스를 평일 아침 한 번에",
    description: "출처를 확인한 전날의 중요 뉴스를 모바일 브리핑으로 받아보세요.",
    images: [{ url: socialImageUrl, width: 1792, height: 896, alt: "아침결 뉴스 브리핑" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "아침결 — 어제 뉴스를 평일 아침 한 번에",
    description: "출처를 확인한 전날의 중요 뉴스를 모바일 브리핑으로 받아보세요.",
    images: [socialImageUrl],
  },
};

export const viewport: Viewport = {
  themeColor: "#18b779",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="ko">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
