import { IconButton } from "../Button";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Pin, PinOff, X } from "lucide-react";
import type { Bounds, Point } from "../topology";

export function FloatingInspector({ host, anchor, title, closeLabel, onClose, children }: {
  host: HTMLElement | null; anchor: Bounds; title: string; closeLabel: string; onClose(): void; children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [metrics, setMetrics] = useState({ width: 0, height: 0, panelWidth: 320, panelHeight: 400 });
  const [manual, setManual] = useState<Point>();
  const [pinned, setPinned] = useState(false);
  const drag = useRef<{ pointer: number; start: Point; origin: Point } | null>(null);
  useLayoutEffect(() => {
    if (!host || !panel.current) return;
    const element = panel.current;
    const measure = () => setMetrics({ width: host.clientWidth, height: host.clientHeight, panelWidth: element.offsetWidth, panelHeight: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure); observer.observe(host); observer.observe(element);
    return () => observer.disconnect();
  }, [host]);
  useEffect(() => {
    const cancel = () => { drag.current = null; };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, []);
  if (!host) return null;
  const clamp = (point: Point) => ({ x: Math.max(12, Math.min(point.x, metrics.width - metrics.panelWidth - 12)), y: Math.max(12, Math.min(point.y, metrics.height - metrics.panelHeight - 12)) });
  const preferred = { x: anchor.x + anchor.width + 16 + metrics.panelWidth <= metrics.width - 12 ? anchor.x + anchor.width + 16 : anchor.x - metrics.panelWidth - 16, y: anchor.y };
  const position = clamp(manual ?? preferred);
  return createPortal(<aside ref={panel} className="topology-details topology-inspector" role="dialog" aria-modal="false" aria-label={title}
    style={{ left: position.x, top: position.y }} onPointerDown={event => {
      event.stopPropagation();
      if (event.button !== 0 || !(event.target as Element).closest("[data-inspector-handle]") || (event.target as Element).closest("button")) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: position };
    }} onPointerMove={event => {
      const gesture = drag.current;
      if (!gesture || gesture.pointer !== event.pointerId) return;
      setManual(clamp({ x: gesture.origin.x + event.clientX - gesture.start.x, y: gesture.origin.y + event.clientY - gesture.start.y })); setPinned(true);
    }} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} onLostPointerCapture={() => { drag.current = null; }}>
    <header data-inspector-handle>
      <h2 tabIndex={0} aria-label="移动属性面板" onKeyDown={event => {
        const delta: Record<string, Point> = { ArrowLeft: { x: -16, y: 0 }, ArrowRight: { x: 16, y: 0 }, ArrowUp: { x: 0, y: -16 }, ArrowDown: { x: 0, y: 16 } };
        if (delta[event.key]) { event.preventDefault(); event.stopPropagation(); setManual(clamp({ x: position.x + delta[event.key].x, y: position.y + delta[event.key].y })); setPinned(true); }
      }}>{title}</h2>
      <IconButton hitArea="compact" aria-label={pinned ? "取消固定浮窗位置" : "固定浮窗位置"} aria-pressed={pinned} onClick={() => { setPinned(!pinned); setManual(pinned ? undefined : position); }}>{pinned ? <PinOff size={16}/> : <Pin size={16}/>}</IconButton>
      <IconButton hitArea="compact" aria-label={closeLabel} onClick={onClose}><X size={18}/></IconButton>
    </header>
    <div className="topology-inspector-content">{children}</div>
  </aside>, host);
}
