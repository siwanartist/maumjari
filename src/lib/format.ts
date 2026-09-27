const TZ = "Asia/Seoul";
export function fmtDateTime(d: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TZ, month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(d));
}
export function fmtDate(d: Date | string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}
export const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
