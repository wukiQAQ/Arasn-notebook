import { useEffect, useRef, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { GripHorizontal, MoreHorizontal, Plus, MousePointer2, Pencil, Hand, Minus, Focus, Type, Trash2 } from 'lucide-react';
import type { Direction, Note } from './model';

export type Viewport = { x: number; y: number; zoom: number };
type Props = { direction: Direction; notes: Note[]; selected: string; select: (id: string) => void; update: (id: string, patch: Partial<Note>) => void; add: () => void; remove: (id: string) => void; tool: string; setTool: (tool: string) => void; paths: string[]; addPath: (path: string) => void; views: Partial<Record<Direction, Viewport>> };
function NoteView({ note, selected, direction, zoom, select, update, remove }: { note: Note; selected: boolean; direction: Direction; zoom: number; select: () => void; update: (patch: Partial<Note>) => void; remove: () => void }) {
  const x = useMotionValue(note.x), y = useMotionValue(note.y);
  const [dragging, setDragging] = useState(false);
  const reduced = useReducedMotion();
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  return <motion.article className={`note ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`} data-note={note.id} style={{ x, y, zIndex: dragging ? 20 : selected ? 5 : 2 }}
    initial={reduced ? false : { opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1, boxShadow: dragging ? '0 16px 32px #0002' : direction === 'B' ? '0 6px 18px #2436470d' : '0 1px 3px #00000008' }}
    transition={reduced ? { duration: 0 } : direction === 'B' ? { type: 'spring', stiffness: 380, damping: 32 } : { duration: .16 }} onPointerDown={select}>
    <div className="note-grip" aria-label={`拖动${note.title}`} role="button" tabIndex={0}
      onKeyDown={event => { if (!event.key.startsWith('Arrow')) return; event.preventDefault(); select(); const dx = event.key === 'ArrowRight' ? 8 : event.key === 'ArrowLeft' ? -8 : 0, dy = event.key === 'ArrowDown' ? 8 : event.key === 'ArrowUp' ? -8 : 0; x.set(x.get() + dx); y.set(y.get() + dy); update({ x: x.get(), y: y.get() }); }}
      onPointerDown={event => { if (event.button !== 0) return; event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); select(); drag.current = { x: event.clientX, y: event.clientY, startX: x.get(), startY: y.get() }; setDragging(true); }}
      onPointerMove={event => { if (!drag.current) return; x.set(drag.current.startX + (event.clientX - drag.current.x) / zoom); y.set(drag.current.startY + (event.clientY - drag.current.y) / zoom); }}
      onPointerUp={() => { if (drag.current) { const targetX = direction === 'B' ? Math.round(x.get() / 8) * 8 : x.get(), targetY = direction === 'B' ? Math.round(y.get() / 8) * 8 : y.get(); if (direction === 'B' && !reduced) { animate(x, targetX, { duration: .14 }); animate(y, targetY, { duration: .14 }); } else { x.set(targetX); y.set(targetY); } update({ x: targetX, y: targetY }); } drag.current = null; setDragging(false); }} onPointerCancel={() => { if (drag.current) update({ x: x.get(), y: y.get() }); drag.current = null; setDragging(false); }}>
      <span><GripHorizontal size={14} />{note.tag}</span><span className="note-controls"><button aria-label={`删除${note.title}`} onPointerDown={e => e.stopPropagation()} onClick={remove}><Trash2 size={13} /></button><MoreHorizontal size={15} /></span>
    </div>
    <input className="note-title" aria-label={`便签标题 ${note.id}`} value={note.title} onChange={event => update({ title: event.target.value })} />
    <textarea aria-label={`便签正文 ${note.id}`} value={note.text} onChange={event => update({ text: event.target.value })} spellCheck={false} />
    <footer><span>{selected ? '正在编辑' : '自由便签'}</span><span>{selected ? '已选中' : '示例内容'}</span></footer>
    {selected && <><i className="corner top-left" /><i className="corner bottom-right" /></>}
  </motion.article>;
}
export function Canvas({ direction, notes, selected, select, update, add, remove, tool, setTool, paths, addPath, views }: Props) {
  const mobile = innerWidth < 700;
  const saved = views[direction];
  const panX = useMotionValue(saved?.x ?? (mobile ? -220 : direction === 'B' ? 228 : direction === 'C' ? 128 : 0)), panY = useMotionValue(saved?.y ?? 0);
  const [zoom, setZoom] = useState(saved?.zoom ?? (mobile ? .78 : 1));
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const viewport = useRef<HTMLDivElement>(null);
  const pan = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const [ink, setInk] = useState('');
  useEffect(() => () => { views[direction] = { x: panX.get(), y: panY.get(), zoom: zoomRef.current }; }, [direction, views, panX, panY]);
  const draft = useRef('');
  const [space, setSpace] = useState(false);
  const selectedNote = useRef(notes.find(note => note.id === selected));
  selectedNote.current = notes.find(note => note.id === selected) || notes[0];
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    let previousWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === previousWidth) return;
      previousWidth = el.clientWidth;
      const note = selectedNote.current;
      if (el.clientWidth < 600 && note) {
        const scale = .78;
        setZoom(scale);
        panX.set((el.clientWidth - 280 * scale) / 2 - note.x * scale);
        panY.set(Math.max(64, (el.clientHeight - 338 * scale) / 2) - note.y * scale);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [panX, panY]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || document.querySelector('[role="dialog"]')) return; if (e.code === 'Space') { e.preventDefault(); setSpace(true); } };
    const up = () => setSpace(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', up);
    const wheel = (e: WheelEvent) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); setZoom(z => Math.max(.45, Math.min(1.7, z - e.deltaY * .001))); };
    const el = viewport.current; el?.addEventListener('wheel', wheel, { passive: false });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', up); el?.removeEventListener('wheel', wheel); };
  }, []);
  const point = (event: React.PointerEvent) => { const rect = viewport.current!.getBoundingClientRect(); return `${((event.clientX - rect.x - panX.get()) / zoomRef.current).toFixed(1)} ${((event.clientY - rect.y - panY.get()) / zoomRef.current).toFixed(1)}`; };
  return <>
    <div className={`canvas ${tool === 'pen' ? 'drawing' : ''} ${space || tool === 'hand' ? 'panning' : ''}`} ref={viewport} aria-label="原型画布" data-testid="prototype-canvas"
      onPointerDown={event => {
        if ((event.target as HTMLElement).closest('.note') && event.button !== 1) return;
        if (event.button === 1 || space || tool === 'hand') { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); pan.current = { x: event.clientX, y: event.clientY, startX: panX.get(), startY: panY.get() }; }
        else if (tool === 'pen') { event.currentTarget.setPointerCapture(event.pointerId); draft.current = `M ${point(event)}`; setInk(draft.current); }
      }}
      onPointerMove={event => { if (pan.current) { panX.set(pan.current.startX + event.clientX - pan.current.x); panY.set(pan.current.startY + event.clientY - pan.current.y); } else if (draft.current) { draft.current += ` L ${point(event)}`; setInk(draft.current); } }}
      onPointerUp={() => { pan.current = null; if (draft.current) { addPath(draft.current); draft.current = ''; setInk(''); } }} onPointerCancel={() => { pan.current = null; draft.current = ''; setInk(''); }}>
      <div className="canvas-caption"><span>我的工作页</span><span>示例内容 · 本页仅用于设计比较</span></div>
      <motion.div className="world" style={{ x: panX, y: panY, scale: zoom }}>
        <svg className="sketch-layer" width="2400" height="1600" aria-hidden="true"><path d="M 340 202 C 390 202 346 292 392 292 m -10 -6 10 6 -9 7" className="demo-arrow" />{paths.map((d, i) => <path key={i} d={d} />)}{ink && <path d={ink} />}</svg>
        {notes.map(note => <NoteView key={note.id} note={note} selected={selected === note.id} direction={direction} zoom={zoom} select={() => select(note.id)} update={patch => update(note.id, patch)} remove={() => remove(note.id)} />)}
      </motion.div>
      <div className="canvas-hint">空格 + 拖动平移 · Ctrl/⌘ + 滚轮缩放</div>
    </div>
    <div className="tool-dock" role="toolbar" aria-label="画布工具">
      <button title="选择" aria-label="选择工具" aria-pressed={tool === 'select'} onClick={() => setTool('select')}><MousePointer2 size={17} /></button>
      <button title="新便签" aria-label="新建便签" onClick={add}><Type size={18} /></button>
      <button title="画笔" aria-label="画笔工具" aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><Pencil size={17} /></button>
      <button title="平移" aria-label="平移工具" aria-pressed={tool === 'hand'} onClick={() => setTool('hand')}><Hand size={17} /></button>
      <span className="tool-divider" /><span className="ink-dot" /><span className="pen-width">细笔</span>
    </div>
    <div className="zoom-dock"><button aria-label="缩小画布" onClick={() => setZoom(z => Math.max(.45, z - .1))}><Minus size={14} /></button><span aria-live="polite">{Math.round(zoom * 100)}%</span><button aria-label="放大画布" onClick={() => setZoom(z => Math.min(1.7, z + .1))}><Plus size={14} /></button><button aria-label="重置画布视角" onClick={() => { panX.set(mobile ? -220 : direction === 'B' ? 228 : direction === 'C' ? 128 : 0); panY.set(0); setZoom(mobile ? .78 : 1); }}><Focus size={15} /></button></div>
  </>;
}
