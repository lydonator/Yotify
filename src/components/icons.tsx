import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  ...props
})

export const Play = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 5.5v13l11-6.5z" fill="currentColor" stroke="none" />
  </svg>
)
export const Pause = (p: P) => (
  <svg {...base(p)}>
    <rect x="6.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
    <rect x="14" y="5" width="3.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
export const Stop = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />
  </svg>
)
export const Next = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 5.5v13l9-6.5z" fill="currentColor" stroke="none" />
    <rect x="16" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
export const Prev = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 5.5v13L9 12z" fill="currentColor" stroke="none" />
    <rect x="5.5" y="5" width="2.5" height="14" rx="1" fill="currentColor" stroke="none" />
  </svg>
)
export const Shuffle = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7h4l10 10h4M17 7h4M3 17h4l3-3M14 10l3-3" />
    <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
  </svg>
)
export const Repeat = (p: P) => (
  <svg {...base(p)}>
    <path d="M17 2l3 3-3 3" />
    <path d="M4 11V9a4 4 0 014-4h12" />
    <path d="M7 22l-3-3 3-3" />
    <path d="M20 13v2a4 4 0 01-4 4H4" />
  </svg>
)
export const Search = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
)
export const Mic = (p: P) => (
  <svg {...base(p)}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0014 0M12 18v3" />
  </svg>
)
export const VolumeHigh = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M16 8a5 5 0 010 8M18.5 5.5a9 9 0 010 13" />
  </svg>
)
export const VolumeMute = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor" stroke="none" />
    <path d="M22 9l-6 6M16 9l6 6" />
  </svg>
)
export const SettingsGear = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
)
export const MusicNote = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
)
export const Waves = (p: P) => (
  <svg {...base(p)}>
    <path d="M2 12c2 0 2-5 4-5s2 10 4 10 2-10 4-10 2 5 4 5" />
  </svg>
)
export const Trash = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
)
export const Close = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
)
export const Minimize = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14" />
  </svg>
)
export const Maximize = (p: P) => (
  <svg {...base(p)}>
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
)
export const Plus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)
export const Library = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5h10M4 10h10M4 15h7" />
    <path d="M17 5l3 14M17 5l-1 0" />
    <circle cx="18" cy="18" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)
export const Clock = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)
export const Download = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3v12M7 11l5 4 5-4" />
    <path d="M5 19h14" />
  </svg>
)
export const Check = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12l5 5L20 6" />
  </svg>
)
export const Heart = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 21s-7-4.5-9.5-9A5 5 0 0112 5a5 5 0 019.5 7c-2.5 4.5-9.5 9-9.5 9z" />
  </svg>
)
