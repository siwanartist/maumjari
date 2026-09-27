/* eslint-disable @next/next/no-img-element */
export default function Avatar({ name, url, size }: { name: string; url?: string; size?: number }) {
  const style = size ? { width: size, height: size, fontSize: size / 3 } : undefined;
  return (
    <div className="avatar" style={style} aria-hidden>
      {url ? <img src={url} alt="" /> : (name || "?").slice(0, 1)}
    </div>
  );
}
