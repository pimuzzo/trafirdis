import type { CSSProperties } from "react";
const paths = {
  search: "m21 21-5-5 M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3",
  arrow: "m9 5 7 7-7 7",
  play: "m8 4 12 8-12 8V4",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  close: "m6 6 12 12 M6 18 18 6",
  refresh: "M20 7v5h-5 M20 12a8 8 0 1 0-2 6",
  sound: "m11 4-6 5H2v6h3l6 5V4 M15 8a6 6 0 0 1 0 8 M18 5a10 10 0 0 1 0 14",
  muted: "m11 4-6 5H2v6h3l6 5V4 M16 9l6 6 M16 15l6-6",
  filter: "M4 7h16 M7 12h10 M10 17h4 M7 5v4 M16 10v4 M12 15v4",
  check: "m5 12 4 4L19 6",
  external: "M14 3h7v7 M21 3 10 14 M10 3H4v17h17v-6",
  film: "M4 3h16v18H4V3 M4 8h16 M4 16h16 M8 3v18 M16 3v18",
  pause: "M8 5v14 M16 5v14",
  copy: "M8 8h13v13H8V8 M16 8V3H3v13h5",
};
export type IconName = keyof typeof paths;
export function Icon({
  name,
  size = 20,
  style,
}: {
  name: IconName;
  size?: number;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        p<span>›</span>
      </span>
      plexplore<span className="brand-dot">.</span>
    </span>
  );
}
