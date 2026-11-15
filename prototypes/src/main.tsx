import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Dialog } from '@base-ui/react/dialog';
import { Command, Search, Plus, Layers3, FolderOpen, Network, Settings2, ArrowUpRight, PanelLeftClose, LayoutGrid, FileText, CircleHelp, X, Check, Sparkles } from 'lucide-react';
import { Canvas } from './Canvas';
import type { Viewport } from './Canvas';
import { FileShelf } from './FileShelf';
import { CommandPalette } from './CommandPalette';
import { demoAssets, directions, fileKind, initialNotes } from './model';
import type { Asset, Direction, Note } from './model';
import './style.css';

function Mark() { return <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><path d="M5 26 15 5h3l9 21h-7l-4-10-5 10Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M14 24h8" stroke="currentColor" strokeWidth="2" /></svg>; }
function Explorer() {
  const initial = new URLSearchParams(location.search).get('direction');
  const [direction, setDirection] = useState<Direction>(initial === 'B' || initial === 'C' ? initial : 'A');
  const [notes, setNotes] = useState<Note[]>(initialNotes), [selected, setSelected] = useState('meeting');
  const [paths, setPaths] = useState<string[]>([]);
  const views = useRef<Partial<Record<Direction, Viewport>>>({});
  const [assets, setAssets] = useState<Asset[]>(demoAssets);
  const urls = useRef(new Set(assets.map(asset => asset.url)));
  const [busy, setBusy] = useState(false), [status, setStatus] = useState('');
  const [filesOpen, setFilesOpen] = useState(true), [command, setCommand] = useState(false), [audit, setAudit] = useState(false), [hidden, setHidden] = useState(false), [tool, setTool] = useState('select'), [toast, setToast] = useState('');
  const reduced = useReducedMotion();
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2600); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setHidden(false); if (!audit) setCommand(open => !open); } };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [audit]);
  function choose(value: Direction) { setDirection(value); setTool('select'); setFilesOpen(true); setHidden(false); history.replaceState(null, '', `?direction=${value}`); }
  function add() { const note = { id: crypto.randomUUID(), title: '新的想法', text: '', x: 120 + notes.length % 3 * 80, y: 100 + notes.length % 3 * 64, tag: '新便签' }; setNotes(values => [...values, note]); setSelected(note.id); setToast('已新建便签 · 当前原型会话'); }
  function update(id: string, patch: Partial<Note>) { setNotes(values => values.map(note => note.id === id ? { ...note, ...patch } : note)); }
  const busyRef = useRef(false);
  async function ingest(files: File[]) {
    if (!files.length || busyRef.current) return;
    busyRef.current = true; setBusy(true); let imported = 0;
    const failures: string[] = [];
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`读取 ${index + 1}/${files.length}：${file.name}`);
        try {
          if (file.size > 20 * 1024 * 1024) throw new Error('超过原型的 20MB 限制');
          const bytes = await file.arrayBuffer();
          const blob = new Blob([bytes], { type: file.type || 'application/octet-stream' });
          const url = URL.createObjectURL(blob); urls.current.add(url);
          const asset: Asset = { id: crypto.randomUUID(), name: file.name, kind: fileKind(file), size: bytes.byteLength, url };
          setAssets(values => [...values, asset]); imported++;
        } catch (error) { failures.push(`${file.name}：${(error as Error).message}`); }
      }
      setStatus(`已读取 ${imported} 个文件${failures.length ? `；${failures.join('；')}` : ' · 仅当前浏览器会话'}`);
      setToast(imported ? `${imported} 个文件已放入中转站` : '未导入文件，请查看中转站提示');
    } finally { busyRef.current = false; setBusy(false); }
  }
  function run(id: string) {
    if (id === 'new') add();
    if (id === 'files') { setFilesOpen(true); setToast('文件中转站已展开'); }
    if (id === 'draw') { setTool('pen'); setToast('画笔已就绪，在画布空白处按住绘制'); }
    if (id === 'focus') setAudit(true);
    if (id === 'hide') setHidden(true);
  }
  const navigation = <>
    <button className="nav-add" onClick={add} aria-label="新增便签" onPointerMove={event => { if (direction !== 'B' || reduced || event.pointerType !== 'mouse') return; const rect = event.currentTarget.getBoundingClientRect(); event.currentTarget.style.setProperty('--magnet-x', `${((event.clientX - rect.x) / rect.width - .5) * 6}px`); event.currentTarget.style.setProperty('--magnet-y', `${((event.clientY - rect.y) / rect.height - .5) * 4}px`); }} onPointerLeave={event => { event.currentTarget.style.setProperty('--magnet-x', '0px'); event.currentTarget.style.setProperty('--magnet-y', '0px'); }}><Plus size={18} /><span>快速记录</span><kbd>＋</kbd></button>
    <button className="nav-item current" aria-label="显示工作画布" onClick={() => { setTool('select'); setHidden(false); }}><Layers3 size={18} /><span>工作画布</span></button>
    <button className="nav-item" aria-label="切换文件中转站" aria-pressed={filesOpen} onClick={() => setFilesOpen(open => !open)}><FolderOpen size={18} /><span>文件中转站</span></button>
    <button className="nav-item" aria-label="共享功能说明" onClick={() => setAudit(true)}><Network size={18} /><span>局域网共享</span></button>
  </>;
  return <MotionConfig reducedMotion="user"><div className={`explorer direction-${direction}`}>
    <header className="exploration-bar"><div><span className="exploration-label">Arasn / Design Lab</span><small>第一阶段 · 独立交互原型</small></div><nav aria-label="比较设计方向">{(['A', 'B', 'C'] as Direction[]).map(key => <button key={key} aria-pressed={direction === key} onClick={() => choose(key)}><b>{key}</b><span>{directions[key].name}</span></button>)}</nav><button className="scope-button" onClick={() => setAudit(true)}><CircleHelp size={16} /><span>功能核实</span></button></header>
    <main className="prototype-shell">
      <AnimatePresence mode="wait" initial={false}>{hidden ? <motion.div key="hidden" className="hidden-workspace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><Mark /><h1>工作台暂时收起</h1><p>这是浏览器内的呼出模拟，不会控制桌面窗口或注册全局快捷键。</p><button onClick={() => setHidden(false)}>呼出工作台 <ArrowUpRight size={16} /></button></motion.div> : <motion.div className={`workspace-layout layout-${direction}`} key={direction} initial={reduced ? false : { opacity: 0, y: direction === 'B' ? 8 : 0 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .14 }}>
        {direction !== 'C' && <aside className="navigation"><div className="product-brand"><Mark /><span>Arasn<small>{direction === 'B' ? '留一点空间，给思考。' : '本机工作台'}</small></span></div>{direction === 'B' && <button className="nav-search" onClick={() => setCommand(true)}><Search size={15} /><span>搜索与操作</span><kbd>⌘ K</kbd></button>}<nav>{navigation}</nav>{direction === 'B' && <div className="nav-note-list"><span>此页便签</span>{notes.map(note => <button key={note.id} className={note.id === selected ? 'selected' : ''} onClick={() => { setSelected(note.id); setToast('便签已选中，可在画布中编辑'); }}><FileText size={14} />{note.title || '未命名便签'}</button>)}</div>}<div className="nav-bottom"><button aria-label="查看设计方向说明" onClick={() => setAudit(true)}><Settings2 size={18} /><span>原型说明</span></button></div></aside>}
        <header className="work-header">{direction === 'C' ? <><div className="product-brand"><Mark /><span>Arasn</span></div><nav>{navigation}</nav></> : <div className="work-path"><LayoutGrid size={15} /><span>我的空间</span><span>/</span><strong>工作画布</strong></div>}<button className="command-entry" aria-label="打开原型命令面板" onClick={() => setCommand(true)}><Search size={15} /><span>{direction === 'A' ? '搜索或执行命令' : direction === 'C' ? '捕捉、整理、打开…' : '搜索工作台'}</span><kbd>Ctrl K</kbd></button><div className="work-header-actions"><span className="session-state"><i />浏览器会话</span><button aria-label="模拟收起工作台" onClick={() => setHidden(true)}><PanelLeftClose size={17} /></button><button className="file-toggle" aria-label="展开文件中转站" onClick={() => setFilesOpen(open => !open)}><FolderOpen size={17} /></button></div></header>
        {direction === 'C' && <aside className="minimal-index"><span>这一页</span>{notes.map(note => <button className={selected === note.id ? 'selected' : ''} key={note.id} onClick={() => setSelected(note.id)}><i />{note.title}</button>)}<button aria-label="新增便签" onClick={add}><Plus size={16} /></button></aside>}
        <div className="canvas-area"><Canvas key={direction} direction={direction} notes={notes} paths={paths} addPath={path => setPaths(values => [...values, path])} views={views.current} selected={selected} select={setSelected} update={update} add={add} remove={id => { setNotes(values => values.filter(note => note.id !== id)); setToast('便签已移除 · 示例会话'); }} tool={tool} setTool={setTool} /></div>
        <AnimatePresence>{filesOpen && <FileShelf key={direction} direction={direction} assets={assets} busy={busy} status={status} ingest={ingest} close={() => setFilesOpen(false)} />}</AnimatePresence>
        <footer className="work-footer"><span><i />{directions[direction].short}</span><span>{notes.length} 张便签 · {assets.length} 个会话文件</span><span>探索原型，未连接桌面服务</span></footer>
      </motion.div>}</AnimatePresence>
    </main>
    <CommandPalette direction={direction} open={command} setOpen={setCommand} run={run} />
    <Dialog.Root open={audit} onOpenChange={setAudit}><Dialog.Portal><Dialog.Backdrop className={`prototype-backdrop direction-${direction}`} /><Dialog.Popup className={`audit-popup direction-${direction}`}><Dialog.Title>先分清，什么已经存在</Dialog.Title><Dialog.Description>来自当前 0.6.0 源码的能力核实；本次只交付隔离设计原型。</Dialog.Description><dl><dt>已有实现</dt><dd>React / TypeScript / Electron、Base UI、固定工作页便签与绘图、Ctrl+K、局域网共享接口、本地文件导入与图片缩略图。</dd><dt>本轮仅原型探索</dt><dd>无边界平移缩放、三套布局、Motion 动效、浏览器内文件预览及投递反馈。文件只存在于当前浏览器会话，不写入正式存储。</dd><dt>没有宣称已完成</dt><dd>正式无限画布、Office 内容解析、真实两机与原生呼出动画验收。此原型的共享入口仅显示说明，不建立网络共享。</dd></dl><Dialog.Close className="audit-close">知道了 <Check size={15} /></Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>
    <AnimatePresence>{toast && <motion.div className="prototype-toast" role="status" key={toast} initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={15} />{toast}</motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<Explorer />);
