import type { ReactNode } from 'react';
const paths: Record<string, ReactNode> = {
  mark: <><path d="M5 17 10 6q2-4 4 0l5 11q1 4-2 2l-5-3-5 3q-3 2-2-2Z"/><path d="m9 13 3-2 3 2"/></>,
  board: <><rect x="4" y="4" width="16" height="16" rx="5"/><path d="M10 4v16m0-10h10"/></>,
  note: <><path d="M7 4h10q3 0 3 3v7l-6 6H7q-3 0-3-3V7q0-3 3-3Z"/><path d="M14 20v-4q0-2 2-2h4M8 9h8M8 12h3"/></>,
  tray: <><path d="m4 10 2-5q.5-1 2-1h8q1.5 0 2 1l2 5v7q0 3-3 3H7q-3 0-3-3Z"/><path d="M4 12h4q0 4 4 4t4-4h4"/></>,
  plus: <><circle cx="12" cy="12" r="9" className="icon-fill"/><path d="M12 6v12M6 12h12"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  moon: <path d="M19 14A9 9 0 0 1 10 4a9 9 0 1 0 9 10Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
  pen: <><path d="m5 15 10-10q2-2 4 0t0 4L9 19l-5 1Z"/><path d="m13 7 4 4M5 15l4 4"/></>,
  hand: <path d="M8 12V6q0-3 2-2v7-7q2-3 3 0v7-6q2-2 3 0v7-4q2-1 3 1v6q0 6-6 6h-1q-3 0-5-3l-3-4q-1-3 2-2l2 2"/>,
  pointer: <path d="m5 4 14 6-6 3-3 6Z"/>,
  fit: <><path d="M4 9V6q0-2 2-2h3m6 0h3q2 0 2 2v3m0 6v3q0 2-2 2h-3M9 20H6q-2 0-2-2v-3"/><rect x="8" y="8" width="8" height="8" rx="2"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  trash: <><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5m4-5v5"/></>,
  hide: <><rect x="4" y="5" width="16" height="14" rx="5"/><path d="M9 5v14m4-10 3 3-3 3"/></>,
  minus: <path d="M6 12h12"/>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9 9q0-4 4-2t-1 6v1m0 3v.1"/></>,
};
export function Icon({ name, size = 22 }: { name: keyof typeof paths; size?: number }) { return <svg className={`s-icon icon-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>; }
