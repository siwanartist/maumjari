import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "마음자리 — 나에게 맞는 명상 지도자",
  description: "취향 진단으로 나에게 맞는 명상 지도자를 추천받고, 클래스를 예약하세요.",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1620" },
    { media: "(prefers-color-scheme: light)", color: "#F2F4F3" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 본문: Pretendard Variable (한글 동적 서브셋) / 로고·히어로·지도자 이름: Gowun Batang */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" crossOrigin="" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Gowun+Batang:wght@700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {process.env.PAYMENT_PROVIDER === "mock" && (
          <div role="note" className="testbar">
            테스트 운영 중 — 결제는 실제로 청구되지 않습니다
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
