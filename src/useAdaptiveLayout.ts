import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type ToolbarMode = "full" | "compact" | "minimal";
export type NavMode = "full" | "compact" | "collapsed";

// CSS pixels already reflect Electron zoom/DPI. Never multiply the thresholds by DPR.
export function useAdaptiveLayout(canvas: { width: number; height: number }, properties: boolean, canvasActive: boolean) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<{ nav: NavMode; toolbar: ToolbarMode }>({ nav: "compact", toolbar: "compact" });
  const canvasRef = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const refresh = useRef(() => {});
  const update = useCallback(() => {
    if (dragging.current || !element?.getClientRects().length) return;
    const { width, height } = element.getBoundingClientRect();
    const workspace = canvasRef.current;
    const box = workspace && !workspace.hidden
      ? (workspace.querySelector(".paper-scroll") ?? workspace).getBoundingClientRect()
      : null;
    setLayout(previous => {
      // Hysteresis prevents boundary flicker; the shell measurement is independent of the rail width.
      const nav: NavMode = width >= (previous.nav === "full" ? 1176 : 1200) && height >= 640 ? "full"
        : width >= (previous.nav === "collapsed" ? 960 : 936) && height >= 560 ? "compact" : "collapsed";
      const toolbar: ToolbarMode = !box ? previous.toolbar
        : box.width >= (previous.toolbar === "full" ? 856 : 880) && box.height >= 590 ? "full"
        : box.width >= 440 && box.height >= (previous.toolbar === "minimal" ? 490 : 466) ? "compact" : "minimal";
      return previous.nav === nav && previous.toolbar === toolbar ? previous : { nav, toolbar };
    });
  }, [element]);
  // The visible canvas has measurable bounds before its ResizeObserver reports.
  useLayoutEffect(() => { update(); }, [canvasActive, update]);
  useEffect(() => {
    if (!element) return;
    let timer = 0;
    const schedule = () => { clearTimeout(timer); timer = window.setTimeout(update, 100); };
    refresh.current = schedule;
    const start = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest('.paper-scroll') && !target.closest('button, input, textarea, select')) dragging.current = true;
    };
    const end = () => { dragging.current = false; schedule(); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    document.addEventListener('pointerdown', start, true);
    window.addEventListener('pointerup', end, true);
    window.addEventListener('pointercancel', end, true);
    window.addEventListener('blur', end);
    return () => {
      refresh.current = () => {};
      clearTimeout(timer); observer.disconnect();
      document.removeEventListener('pointerdown', start, true);
      window.removeEventListener('pointerup', end, true);
      window.removeEventListener('pointercancel', end, true);
      window.removeEventListener('blur', end);
    };
  }, [element, update]);
  useEffect(() => { refresh.current(); }, [canvas.width, canvas.height, properties]);
  return { ...layout, shellRef: setElement, canvasRef };
}
