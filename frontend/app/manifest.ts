import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    name: "아침결 — 아침 뉴스 브리핑",
    short_name: "아침결",
    description: "평일 오전 7시 30분, 전날의 중요 뉴스를 읽기 좋은 모바일 브리핑과 관련 원문으로 전달합니다.",
    start_url: `${basePath}/briefing/`,
    display: "standalone",
    background_color: "#f7f7f5",
    theme_color: "#f7f7f5",
    icons: [
      { src: `${basePath}/mail-icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "오늘의 뉴스", short_name: "브리핑", url: `${basePath}/briefing/`, icons: [{ src: `${basePath}/mail-icon.svg`, sizes: "any", type: "image/svg+xml" }] },
      { name: "브리핑 보관함", short_name: "보관함", url: `${basePath}/archive/`, icons: [{ src: `${basePath}/mail-icon.svg`, sizes: "any", type: "image/svg+xml" }] },
      { name: "내 브리핑 설정", short_name: "설정", url: `${basePath}/preferences/`, icons: [{ src: `${basePath}/mail-icon.svg`, sizes: "any", type: "image/svg+xml" }] },
    ],
  };
}
