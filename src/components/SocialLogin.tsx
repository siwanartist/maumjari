"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/** 구글·네이버 간편 로그인 버튼 — 서버에 키가 설정된 제공자만 표시 */
export default function SocialLogin({ next }: { next: string }) {
  const [providers, setProviders] = useState<string[]>([]);
  useEffect(() => { api<{ providers: string[] }>("/api/auth/oauth").then((d) => setProviders(d.providers)).catch(() => {}); }, []);
  if (providers.length === 0) return null;
  const href = (p: string) => `/api/auth/oauth/${p}?next=${encodeURIComponent(next)}`;
  return (
    <div className="social">
      {providers.includes("google") && (
        <a className="btn social-btn google" href={href("google")}>
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.5 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h12.7c-.5 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17z" />
            <path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.7 24c0-1.6.3-3.1.8-4.6l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6.1z" />
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-10l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
          </svg>
          Google로 계속하기
        </a>
      )}
      {providers.includes("naver") && (
        <a className="btn social-btn naver" href={href("naver")}>
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden><path fill="currentColor" d="M13.6 10.7 6.1 0H0v20h6.4V9.3L13.9 20H20V0h-6.4z" /></svg>
          네이버로 계속하기
        </a>
      )}
      <div className="social-or"><span>또는 이메일로</span></div>
    </div>
  );
}
