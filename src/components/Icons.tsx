/* Anan 아이콘 — 24px 격자, 둥근 선(stroke) SVG. 색은 currentColor를 따릅니다. */
type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Svg({ size = 22, strokeWidth = 1.8, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5V9" /><path d="M10 20v-5.5h4V20" /></Svg>
);
export const SearchIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></Svg>
);
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></Svg>
);
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}><path d="M20.5 11.5c0 4.1-3.8 7.5-8.5 7.5-1.2 0-2.3-.2-3.3-.6L4 20l1.3-3.7c-1.1-1.3-1.8-3-1.8-4.8C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.5Z" /></Svg>
);
export const UserIcon = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" /></Svg>
);
export const BellIcon = (p: IconProps) => (
  <Svg {...p}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 21a2.2 2.2 0 0 0 4 0" /></Svg>
);
export const BackIcon = (p: IconProps) => (
  <Svg {...p}><path d="M15 5 8 12l7 7" /></Svg>
);

/** 인증 지도자 배지 — 채워진 톱니 원 + 체크 */
export function VerifiedIcon({ size = 16, className, decorative }: { size?: number; className?: string; decorative?: boolean }) {
  const a11y = decorative ? { "aria-hidden": true } : { role: "img", "aria-label": "인증 지도자" };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} focusable="false" style={{ flexShrink: 0 }} {...a11y}>
      <path style={{ fill: "var(--accent-ink)" }} d="M12 1.8l2.4 1.8 3-.2 1 2.8 2.6 1.6-.8 2.9 1.2 2.8-2.3 1.9-.4 3-3 .5L14 21.6l-2-.9-2 .9-1.8-2.5-3-.5-.4-3-2.3-1.9 1.2-2.8-.8-2.9 2.6-1.6 1-2.8 3 .2Z" />
      <path d="m8 12.2 2.7 2.6L16 9.6" style={{ fill: "none", stroke: "var(--bg)" }} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
