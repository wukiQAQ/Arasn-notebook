import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { screenToWorld, worldLimit, zoomAt, type Camera } from "./topology";

// Local, per-room camera; content continues through BoardClient's recovery queue.
export function useFreeViewport(roomId: string, notify: (message: string) => void, active: boolean) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState<Camera>({ x: 800, y: 500, zoom: .8 });
  const current = useRef(camera);
  const frame = useRef(0);
  const timer = useRef(0);
  const key = `arasn-free-viewport:${roomId}`;
  const loaded = useRef(false);
  const writing = useRef(Promise.resolve(true));
  const save = useCallback((): Promise<boolean> => {
    clearTimeout(timer.current);
    if (!roomId || !loaded.current) return writing.current;
    const next = { ...current.current, roomId };
    writing.current = writing.current.then(async () => {
      try {
        if (window.desktop) await window.desktop.settings({ freeViewport: next });
        else localStorage.setItem(key, JSON.stringify(next));
        return true;
      } catch { notify("工作页视图位置未保存，请重试"); return false; }
    });
    return writing.current;
  }, [key, roomId, notify]);
  const show = useCallback((next: Camera) => {
    current.current = { x: worldLimit(next.x), y: worldLimit(next.y), zoom: Math.max(.25, Math.min(4, next.zoom)) };
    if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; setCamera(current.current); });
    clearTimeout(timer.current);
    timer.current = window.setTimeout(save, 180);
  }, [save]);
  useEffect(() => {
    let active = true;
    loaded.current = false;
    if (roomId) void (async () => {
      let next = { x: 800, y: 500, zoom: .8 };
      try {
        const value = window.desktop ? (await window.desktop.info()).freeViewport : JSON.parse(localStorage.getItem(key) || "null");
        if (value && (!value.roomId || value.roomId === roomId) && Number.isFinite(value.x) && Math.abs(value.x) <= 1e6 && Number.isFinite(value.y) && Math.abs(value.y) <= 1e6 && value.zoom >= .25 && value.zoom <= 4) next = value;
      } catch { notify("工作页视图位置读取失败，已使用默认视图"); }
      if (active) { current.current = next; setCamera(next); loaded.current = true; }
    })();
    const flush = () => { void save(); };
    window.addEventListener("pagehide", flush);
    window.addEventListener("blur", flush);
    return () => { active = false; void save(); cancelAnimationFrame(frame.current); frame.current = 0; window.removeEventListener("pagehide", flush); window.removeEventListener("blur", flush); };
  }, [key, save, notify, roomId]);
  // The viewport may mount after compact mode or the mobile reader closes.
  useLayoutEffect(() => {
    if (!element || !active) return;
    const measure = () => {
      const width = element.clientWidth, height = element.clientHeight;
      if (width && height) setSize(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, active]);
  const point = (x: number, y: number) => {
    const rect = element!.getBoundingClientRect();
    const result = screenToWorld({ x: x - rect.left, y: y - rect.top }, size, current.current);
    return [worldLimit(result.x), worldLimit(result.y)] as [number, number];
  };
  useEffect(() => {
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      if ((event.target as Element).closest("textarea,input,select")) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
      show(zoomAt(current.current, size, { x: event.clientX - rect.left, y: event.clientY - rect.top }, current.current.zoom * Math.exp(-event.deltaY * units * .002), 4));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [element, size, show]);
  return { view: setElement, size, camera, current, show, point, save,
    zoom: (factor: number) => show(zoomAt(current.current, size, { x: size.width / 2, y: size.height / 2 }, current.current.zoom * factor, 4)) };
}
