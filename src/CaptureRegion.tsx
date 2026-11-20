import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Bounds } from './topology';

export function CaptureRegion({ target, cancel, select }: { target: HTMLElement; cancel(): void; select(box: Bounds): void }) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number } | null>(null);
  const [rect, setRect] = useState<Bounds>();
  const [box, setBox] = useState<Bounds>();
  const [hint, setHint] = useState('拖动框选画布区域 · Esc 退出');
  useLayoutEffect(() => {
    const root = document.getElementById('root')!, previous = root.inert, focus = document.activeElement;
    const capturing = document.documentElement.getAttribute('data-capturing');
    document.documentElement.setAttribute('data-capturing', 'true');
    root.inert = true;
    const measure = () => {
      const r = target.getBoundingClientRect();
      if (!target.isConnected || !target.clientWidth || !target.clientHeight) { cancel(); return; }
      setRect({ x: r.left + target.clientLeft, y: r.top + target.clientTop, width: target.clientWidth, height: target.clientHeight });
      drag.current = null; setBox(undefined);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(target);
    const wheel = (event: WheelEvent) => event.preventDefault();
    window.addEventListener('wheel', wheel, { capture: true, passive: false });
    stage.current?.focus({ preventScroll: true });
    return () => {
      observer.disconnect(); window.removeEventListener('wheel', wheel, true); root.inert = previous;
      if (capturing === null) document.documentElement.removeAttribute('data-capturing');
      else document.documentElement.setAttribute('data-capturing', capturing);
      if (focus instanceof HTMLElement && focus.isConnected) focus.focus({ preventScroll: true });
      else if (target.isConnected) target.focus({ preventScroll: true });
    };
  }, [target]);
  function position(event: React.PointerEvent) {
    // Fractional-DPI pointer coordinates carry float32 noise; use CSS layout precision.
    return { x: Math.max(0, Math.min(rect!.width, Math.round((event.clientX - rect!.x) * 64) / 64)),
      y: Math.max(0, Math.min(rect!.height, Math.round((event.clientY - rect!.y) * 64) / 64)) };
  }
  function selection(event: React.PointerEvent) {
    const start = drag.current!, p = position(event);
    return { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), width: Math.abs(p.x - start.x), height: Math.abs(p.y - start.y) };
  }
  return createPortal(<div className="capture-overlay" role="dialog" aria-modal="true" aria-label="框选画布区域" onContextMenu={event => event.preventDefault()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); cancel(); }
    else if (event.key === 'Tab') {
      event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button,[tabindex="0"]')];
      const i = items.indexOf(document.activeElement as HTMLElement); items[(i + (event.shiftKey ? -1 : 1) + items.length) % items.length]?.focus();
    } else if (event.target === stage.current) event.preventDefault();
  }}>
    {rect && <>
      <div className="capture-outside" style={{ inset: `0 0 auto 0`, height: rect.y }} />
      <div className="capture-outside" style={{ left: 0, top: rect.y, bottom: 0, width: rect.x }} />
      <div className="capture-outside" style={{ left: rect.x + rect.width, top: rect.y, right: 0, bottom: 0 }} />
      <div className="capture-outside" style={{ left: rect.x, right: 0, top: rect.y + rect.height, bottom: 0 }} />
    </>}
    <div ref={stage} className="capture-stage" tabIndex={0} aria-label="拖出矩形截图范围" aria-describedby="capture-hint" style={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height } : undefined} data-selecting={!!box || undefined}
      onPointerDown={event => {
        if (!rect || drag.current || event.button !== 0) return; event.preventDefault(); event.stopPropagation();
        event.currentTarget.focus({ preventScroll: true }); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { pointer: event.pointerId, ...position(event) }; setBox(undefined);
      }}
      onPointerMove={event => { if (drag.current?.pointer === event.pointerId) setBox(selection(event)); }}
      onPointerUp={event => {
        if (drag.current?.pointer !== event.pointerId) return;
        const result = selection(event); drag.current = null;
        if (result.width >= 4 && result.height >= 4) select(result);
        else { setBox(undefined); setHint('范围太小，请重新拖出至少 4 × 4 像素的区域。'); }
      }}
      onPointerCancel={() => { drag.current = null; setBox(undefined); }} onLostPointerCapture={() => {
        if (drag.current) { drag.current = null; setBox(undefined); setHint('框选已中断，请重新拖动。'); }
      }}>
      {box && <div className="capture-selection" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}><span>{Math.round(box.width)} × {Math.round(box.height)}</span></div>}
    </div>
    <div className="capture-controls" role="toolbar" aria-label="截图操作"><span id="capture-hint" role="status">{hint}</span>
      <button className="button" onClick={() => rect && select({ x: 0, y: 0, width: rect.width, height: rect.height })}>使用整个视口</button>
      <button className="button" onClick={cancel}>退出截图</button>
    </div>
  </div>, document.body);
}
