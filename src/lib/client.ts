"use client";
/** 브라우저에서 API 호출 — 실패 시 서버가 준 한국어 메시지로 Error 를 던진다 */
export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error ?? "요청을 처리하지 못했습니다.") as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export const PENDING_PREFS_KEY = "mj_pending_prefs";
export function loadPendingPrefs() {
  try { const v = localStorage.getItem(PENDING_PREFS_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
