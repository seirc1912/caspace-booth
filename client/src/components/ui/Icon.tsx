import type { ReactNode } from 'react'

export type IconName =
  | 'add' | 'alert' | 'arrowRight' | 'back' | 'camera' | 'check' | 'chevronRight' | 'close' | 'contrast' | 'crop'
  | 'download' | 'expand' | 'facebook' | 'globe' | 'image' | 'instagram' | 'lock' | 'unlock' | 'mail' | 'minus' | 'mobile'
  | 'moveX' | 'moveY' | 'phone' | 'pin' | 'send' | 'sparkles' | 'swap' | 'tiktok' | 'trash' | 'upload' | 'wifiOff'
  | 'zalo' | 'zoomIn'

interface IconProps {
  name: IconName
  className?: string
}

const paths: Record<IconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5h.01" /></>,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  back: <path d="m15 18-6-6 6-6" />,
  camera: <><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z" /><circle cx="12" cy="13" r="3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  contrast: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" /></>,
  crop: <><path d="M6 2v14a2 2 0 0 0 2 2h14" /><path d="M2 6h14a2 2 0 0 1 2 2v14" /></>,
  download: <><path d="M12 4v11m0 0 4.5-4.5M12 15l-4.5-4.5" /><path d="M5 20h14" /></>,
  expand: <><path d="M14 4h6v6M10 20H4v-6" /><path d="m20 4-6.5 6.5M4 20l6.5-6.5" /></>,
  facebook: <path d="M15 3h-2.5A3.5 3.5 0 0 0 9 6.5V10H6.5v3.5H9V21h3.5v-7.5H15l.5-3.5h-3V7a1 1 0 0 1 1-1H15V3Z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="9.5" r="1.8" /><path d="m21 16-5-5-9 9" /></>,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.2 6.8h.01" /></>,
  lock: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="11" width="14" height="9.5" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.6-1.7" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  minus: <path d="M5 12h14" />,
  mobile: <><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></>,
  moveX: <path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" />,
  moveY: <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />,
  phone: <path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.8 1.8 0 0 1-2 1.8A15.8 15.8 0 0 1 3.2 6 1.8 1.8 0 0 1 5 4Z" />,
  pin: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" /></>,
  send: <path d="M21 3 10 14M21 3l-6.5 18-4.5-7-7-4.5L21 3Z" />,
  sparkles: <><path d="M10 3.5 11.6 8.4 16.5 10l-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6L10 3.5Z" /><path d="m18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z" /></>,
  swap: <path d="M4 8h15m0 0-3.5-3.5M19 8l-3.5 3.5M20 16H5m0 0 3.5-3.5M5 16l3.5 3.5" />,
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.4 2.6 2.2 4.4 5 4.6" />,
  trash: <><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /><path d="M10 11v5M14 11v5" /></>,
  upload: <><path d="M12 15V4m0 0 4.5 4.5M12 4 7.5 8.5" /><path d="M5 20h14" /></>,
  wifiOff: <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.2-2.4M19 13a10 10 0 0 0-2.6-1.8M2 9.3a15 15 0 0 1 4.3-2.6M22 9.3A15 15 0 0 0 11 5.1M12 20h.01" /></>,
  zalo: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4A2.5 2.5 0 0 1 4 13.5v-8Z" /><path d="M8.5 7.5h3l-3 4.5h3M14.5 7.5V12" /></>,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" /></>,
}

/** 2 px rounded-stroke SVG icons (no Unicode/emoji glyphs as icons). */
export function Icon({ name, className = 'size-5' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" focusable="false" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}
