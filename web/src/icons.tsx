import type { CSSProperties, SVGProps } from "react";

interface IconProps {
  size?: number;
  stroke?: number;
  style?: CSSProperties;
}

const base = (size: number, stroke: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: stroke,
  strokeLinecap: "round",
  strokeLinejoin: "round",
});

export const Logo = ({ size = 19 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path d="M12 3.5 21 20H3L12 3.5Z" fill="#fff" />
    <path d="M12 10.5 16.2 18H7.8L12 10.5Z" fill="var(--accent)" />
  </svg>
);

export const ExternalArrow = ({ size = 12, stroke = 2.2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);

export const QrIcon = ({ size = 18, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" />
    <rect x="7.5" y="7.5" width="3.5" height="3.5" rx=".6" />
    <path d="M13.5 13.5h3M13.5 16.5h1.4M16.5 13.5v3" />
  </svg>
);

export const Moon = ({ size = 16, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  </svg>
);
export const Sun = ({ size = 16, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
  </svg>
);
export const Monitor = ({ size = 16, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8M12 16v4" />
  </svg>
);

export const Search = ({ size = 16, stroke = 2.4 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
);
export const Spinner = ({ size = 16, stroke = 2.4 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="#fff"
    strokeWidth={stroke}
    className="spin"
  >
    <path d="M12 3a9 9 0 1 0 9 9" strokeLinecap="round" />
  </svg>
);
export const Close = ({ size = 16, stroke = 2.2 }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
  >
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const Copy = ({ size = 16, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
export const Download = ({ size = 15, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);
export const Check = ({ size = 22, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const GridIcon = ({ size = 15, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="3" width="8" height="8" rx="1.5" />
    <rect x="13" y="3" width="8" height="5" rx="1.5" />
    <rect x="13" y="11" width="8" height="10" rx="1.5" />
    <rect x="3" y="14" width="8" height="7" rx="1.5" />
  </svg>
);
export const Brackets = ({ size = 15, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="m8 6-5 6 5 6M16 6l5 6-5 6" />
  </svg>
);
export const Person = ({ size = 17, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20a8 8 0 0 1 16 0" />
  </svg>
);
export const Shield = ({ size = 17, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M12 2 4 6v6c0 5 3.4 8 8 10 4.6-2 8-5 8-10V6l-8-4Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);
export const Key = ({ size = 17, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <circle cx="8" cy="15" r="4" />
    <path d="m10.8 12.2 8.2-8.2M15 6l3 3M18.5 8.5 21 6" />
  </svg>
);
export const Link = ({ size = 17, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
    <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
  </svg>
);
export const Server = ({ size = 17, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 4v5" />
  </svg>
);
export const Gear = ({ size = 20, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
);
export const Nodes = ({ size = 20, stroke = 2 }: IconProps) => (
  <svg {...base(size, stroke)}>
    <circle cx="5" cy="12" r="2" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="19" cy="19" r="2" />
    <path d="M7 12h6M13 12l4-6M13 12l4 6" />
  </svg>
);
