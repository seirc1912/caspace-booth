interface IconProps {
  name: 'add' | 'back' | 'camera' | 'check' | 'phone' | 'rotate' | 'shuffle' | 'sparkles' | 'trash' | 'zoomIn' | 'zoomOut'
  className?: string
}

const paths = {
  add: <path d="M12 5v14M5 12h14" />,
  back: <path d="m15 18-6-6 6-6" />,
  camera: <><path d="M14.5 4 16 7h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3l1.5-3h5Z" /><circle cx="12" cy="13" r="3" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></>,
  rotate: <><path d="M20 11a8.1 8.1 0 1 0 .5 4" /><path d="M20 4v7h-7" /></>,
  shuffle: <><path d="m18 4 3 3-3 3" /><path d="M3 7h3c4 0 5 10 9 10h6" /><path d="m18 14 3 3-3 3" /><path d="M3 17h3c1.2 0 2.1-.9 3-2.2" /></>,
  sparkles: <><path d="m12 3-1.2 3.8L7 8l3.8 1.2L12 13l1.2-3.8L17 8l-3.8-1.2L12 3Z" /><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8L5 14Z" /></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" /><path d="M10 11v5M14 11v5" /></>,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" /></>,
  zoomOut: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5M7.5 10.5h6" /></>,
}

export function Icon({ name, className = 'size-5' }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  )
}
