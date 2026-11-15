// Original Arasn glyphs: 24px grid, rounded terminals, open contours and quiet inset fills.
const shapes = {
  mark: <><path d="M5 18 10 6q2-4 4 0l5 12q1 3-2 2l-5-4-5 4q-3 1-2-2Z"/><path d="m10 12 2-1 2 1"/></>,
  board: <><rect x="4" y="4" width="16" height="16" rx="6"/><path d="M9 4v16m0-10h11"/><path className="glyph-wash" d="M10 11h9v4q0 4-4 4h-5Z"/></>,
  tray: <><path d="m4 10 2-5q.5-1 2-1h8q1.5 0 2 1l2 5v7q0 3-3 3H7q-3 0-3-3Z"/><path d="M4 12h4q0 4 4 4t4-4h4"/></>,
  plus: <><path d="M12 5v14M5 12h14"/><circle className="glyph-wash" cx="12" cy="12" r="9"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  hide: <><rect x="4" y="5" width="16" height="14" rx="5"/><path d="M9 5v14m4-10 3 3-3 3"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9 9q0-4 4-2t-1 6v1m0 3v.1"/></>,
  leaf: <><path className="glyph-wash" d="M19 4Q3 2 5 16q12 6 14-12Z"/><path d="M19 4Q3 2 5 16q12 6 14-12ZM5 20l9-10"/></>,
  moon: <path d="M19 14A9 9 0 0 1 10 4a9 9 0 1 0 9 10Z"/>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  spark: <path d="M12 3q0 9 9 9-9 0-9 9 0-9-9-9 9 0 9-9Z"/>,
};
export function Glyph({ name, size = 22 }: { name: keyof typeof shapes; size?: number }) { return <svg className={`arasn-glyph glyph-${name}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>; }
