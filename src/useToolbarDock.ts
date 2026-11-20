import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
type Preference = { mode: 'fixed' | 'free'; side: 'left' | 'right' | 'free'; x: number; y: number };
const defaults: Preference = { mode: 'free', side: 'left', x: 0, y: 0 };
function read(key: string): Preference {
  try { const p = JSON.parse(localStorage.getItem(key) || 'null'); if (p && ['fixed','free'].includes(p.mode) && ['left','right','free'].includes(p.side) && Number.isFinite(p.x) && p.x >= 0 && p.x <= 1 && Number.isFinite(p.y) && p.y >= 0 && p.y <= 1) return p; } catch {}
  return defaults;
}
export function useToolbarDock(canvas: 'free' | 'relation', active = true, layoutMode?: string) {
  const key = canvas === 'free' ? 'arasn-toolbar-dock-v1' : 'arasn-relation-toolbar-dock-v1';
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [preference, setPreference] = useState(() => read(key));
  const [bounds, setBounds] = useState({ width: 0, height: 0, toolWidth: 0, toolHeight: 0 });
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number; original: Preference } | undefined>(undefined);
  const allowed = bounds.width >= 900 && bounds.height >= 520;
  const mode = allowed ? preference.mode : 'fixed';
  const maxX = Math.max(0, bounds.width - bounds.toolWidth - 24), maxY = Math.max(0, bounds.height - bounds.toolHeight - 24);
  const effective = allowed ? preference : defaults;
  const left = 12 + (effective.side === 'right' ? maxX : effective.side === 'left' ? 0 : effective.x * maxX);
  const top = 12 + effective.y * maxY;
  const commit = (next: Preference) => { setPreference(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  useLayoutEffect(() => {
    if (!element || !active) return;
    const boundary = element.closest(canvas === 'free' ? '.free-workspace' : '.topology-surface'); if (!boundary) return;
    const measure = () => {
      const r = (canvas === 'free' ? boundary.querySelector('.paper-scroll') ?? boundary : boundary).getBoundingClientRect();
      const t = element.getBoundingClientRect();
      setBounds({ width: r.width, height: r.height, toolWidth: t.width, toolHeight: t.height });
    };
    const observer = new ResizeObserver(measure); observer.observe(boundary); observer.observe(element); measure();
    return () => observer.disconnect();
  }, [canvas, element, active, layoutMode]);
  const fromPixels = (x: number, y: number, snap: boolean): Preference => {
    const px = Math.max(0, Math.min(maxX, x - 12)), py = Math.max(0, Math.min(maxY, y - 12));
    const side = snap && px <= 28 ? 'left' : snap && maxX - px <= 28 ? 'right' : 'free';
    let ny = maxY ? py / maxY : 0;
    if (snap && Math.abs(py - maxY / 2) <= 28) ny = .5;
    if (snap && py <= 28) ny = 0;
    return { mode: preference.mode, side, x: maxX ? px / maxX : 0, y: ny };
  };
  const finish = (event: PointerEvent, cancel = false) => {
    const g = drag.current; if (!g || event.pointerId !== g.pointer) return;
    event.stopPropagation();
    drag.current = undefined; setDragging(false);
    if (cancel) setPreference(g.original);
    else commit(fromPixels(g.left + event.clientX - g.x, g.top + event.clientY - g.y, true));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  return { ref: setElement, style: { left, top, transform: 'none' }, side: effective.side, mode, dragging, allowed,
    toggle: () => commit({ ...preference, mode: preference.mode === 'fixed' ? 'free' : 'fixed' }),
    reset: () => commit({ ...defaults, mode: preference.mode }),
    handle: {
      onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        if (mode !== 'free' || event.button !== 0) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left, top, original: preference }; setDragging(true);
      },
      onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const g = drag.current; if (!g || event.pointerId !== g.pointer) return;
        event.preventDefault(); event.stopPropagation(); setPreference(fromPixels(g.left + event.clientX - g.x, g.top + event.clientY - g.y, false));
      },
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => finish(event),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => finish(event, true),
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => { if (drag.current) finish(event, true); },
      onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
        if (mode !== 'free') return;
        if (event.key === 'Home') { event.preventDefault(); commit(defaults); }
        const delta = { ArrowLeft: [-20,0], ArrowRight: [20,0], ArrowUp: [0,-20], ArrowDown: [0,20] }[event.key];
        if (delta) { event.preventDefault(); event.stopPropagation(); commit(fromPixels(left + delta[0], top + delta[1], true)); }
      },
    },
  };
}
