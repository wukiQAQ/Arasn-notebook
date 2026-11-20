import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent } from 'react';
import { useNotification } from './Notification';
type Mode = 'full' | 'compact' | 'hidden';
const key = 'arasn.sidebar.v1';
function load(): { mode: Mode; width: number } {
  try { const value = JSON.parse(localStorage.getItem(key) || '{}'); return { mode: ['full','compact','hidden'].includes(value.mode) ? value.mode : 'full', width: Number.isFinite(value.width) ? Math.max(180, Math.min(280, value.width)) : 200 }; }
  catch { return { mode: 'full', width: 200 }; }
}
export function useResizableSidebar() {
  const [preference, setPreference] = useState(load);
  const [ready, setReady] = useState(!window.desktop);
  const { notify } = useNotification();
  const writes = useRef(Promise.resolve());
  const lastSaved = useRef('');
  const visibleMode = useRef<Exclude<Mode, 'hidden'>>('full');
  useEffect(() => {
    let cancelled = false;
    if (window.desktop) void window.desktop.info().then(info => {
      if (cancelled) return;
      if (info.sidebar) { lastSaved.current = JSON.stringify(info.sidebar); setPreference(info.sidebar); }
      setReady(true);
    }).catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, []);
  const [windowWidth, setWindowWidth] = useState(innerWidth);
  const [dragging, setDragging] = useState(false);
  const max = Math.max(180, Math.min(280, windowWidth - 320));
  const width = Math.min(preference.width, max);
  useEffect(() => { const resize = () => setWindowWidth(innerWidth); window.addEventListener('resize', resize); return () => window.removeEventListener('resize', resize); }, []);
  useEffect(() => {
    if (!ready || dragging) return;
    const encoded = JSON.stringify(preference);
    if (lastSaved.current === encoded) return;
    lastSaved.current = encoded;
    try { localStorage.setItem(key, encoded); } catch { /* Desktop preferences also persist through IPC. */ }
    if (window.desktop) writes.current = writes.current.then(async () => { await window.desktop!.settings({ sidebar: preference }); }).catch(() => {
      lastSaved.current = ''; notify('导航宽度未能保存，请重新调整后重试', { tone: 'error' });
    });
  }, [preference, dragging, ready, notify]);
  const setMode = (mode: Mode) => setPreference(value => ({ ...value, mode }));
  return { mode: preference.mode, width, max, dragging,
    toggle: () => {
      if (preference.mode === 'hidden') setMode(visibleMode.current);
      else {
        visibleMode.current = preference.mode;
        setMode('hidden');
      }
    },
    toggleCompact: () => setMode(preference.mode === 'compact' ? 'full' : 'compact'),
    resizeProps: {
      onPointerDown(event: ReactPointerEvent<HTMLDivElement>) { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); },
      onPointerMove(event: ReactPointerEvent<HTMLDivElement>) { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const width = Math.max(180, Math.min(max, event.clientX)); setPreference(value => ({ ...value, width })); },
      onPointerUp(event: ReactPointerEvent<HTMLDivElement>) { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); },
      onLostPointerCapture() { setDragging(false); },
      onPointerCancel() { setDragging(false); },
      onKeyDown(event: KeyboardEvent<HTMLDivElement>) { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); setPreference(value => ({ ...value, width: event.key === 'Home' ? 180 : event.key === 'End' ? max : Math.max(180, Math.min(max, width + (event.key === 'ArrowLeft' ? -10 : 10))) })); },
    }
  };
}
