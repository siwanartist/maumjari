import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anan — 나에게 맞는 명상 지도자",
  description: "취향 진단으로 나에게 맞는 명상 지도자를 추천받고, 클래스를 예약하세요.",
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: "#FFFFFF",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 모든 글자: Pretendard Variable (한글 동적 서브셋) */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="" />
        <link rel="stylesheet" crossOrigin="" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
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
