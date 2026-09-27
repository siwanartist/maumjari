import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "마음자리 — 나에게 맞는 명상 지도자",
  description: "취향 진단으로 나에게 맞는 명상 지도자를 추천받고, 클래스를 예약하세요.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#10141A" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        {process.env.PAYMENT_PROVIDER === "mock" && (
          <div role="note" style={{ background: "#C9A227", color: "#10141A", fontSize: 12.5, fontWeight: 600, textAlign: "center", padding: "6px 12px" }}>
            테스트 운영 중 — 결제는 실제로 청구되지 않습니다
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
