import { useEffect, useRef, type PointerEvent } from 'react';

export const CARD_LIMITS = { minWidth: 220, minHeight: 144, maxWidth: 720, maxHeight: 640 };
export function cardSize(width: number, height: number, limits = CARD_LIMITS) {
  return { width: Math.round(Math.max(limits.minWidth, Math.min(limits.maxWidth, width))), height: Math.round(Math.max(limits.minHeight, Math.min(limits.maxHeight, height))) };
}

// Pointer deltas are screen pixels; only deliberate resizing writes world dimensions.
export function CardResizeHandle({ width, height, zoom, limits, onPreview, onCommit, onCancel }: {
  width: number; height: number; zoom: number;
  limits?: typeof CARD_LIMITS;
  onPreview(size: { width: number; height: number }): void;
  onCommit(size: { width: number; height: number }): void; onCancel(): void;
}) {
  const gesture = useRef<{ pointer: number; x: number; y: number; width: number; height: number; zoom: number } | null>(null);
  const cancel = useRef(onCancel); cancel.current = onCancel;
  useEffect(() => { const reset = () => { if (gesture.current) { gesture.current = null; cancel.current(); } }; window.addEventListener('blur', reset); return () => window.removeEventListener('blur', reset); }, []);
  const size = (e: PointerEvent) => { const g = gesture.current!; return cardSize(g.width + (e.clientX - g.x) / g.zoom, g.height + (e.clientY - g.y) / g.zoom, limits); };
  return <button className="card-resize-handle" aria-label="调整便签卡片尺寸" title="拖动调整尺寸；方向键微调" style={{ scale: 1 / zoom }}
    onClick={e => e.stopPropagation()}
    onPointerDown={e => { e.stopPropagation(); if (e.button !== 0) return; e.preventDefault(); gesture.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, width, height, zoom }; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { e.stopPropagation(); if (gesture.current?.pointer === e.pointerId) onPreview(size(e)); }}
    onPointerUp={e => { e.stopPropagation(); if (gesture.current?.pointer !== e.pointerId) return; const next = size(e); gesture.current = null; onCommit(next); }}
    onPointerCancel={e => { e.stopPropagation(); if (gesture.current) { gesture.current = null; onCancel(); } }}
    onLostPointerCapture={() => { if (gesture.current) { gesture.current = null; onCancel(); } }}
    onKeyDown={e => { if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const step = e.shiftKey ? 50 : 10; onCommit(cardSize(width + (e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0), height + (e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0), limits)); }}
  ><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 9 9 3M7 9l2-2" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg></button>;
}
