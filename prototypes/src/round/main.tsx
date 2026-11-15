import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Canvas } from '../Canvas';
import type { Viewport } from '../Canvas';
import { FileShelf } from '../FileShelf';
import { CommandPalette } from '../CommandPalette';
import { demoAssets, fileKind } from '../model';
import type { Asset, Note } from '../model';
import { Glyph } from './Icons';
import { Dialog } from '@base-ui/react/dialog';
import '../style.css';
import './style.css';

const concepts = {
  mellow: { name: 'Mellow', subtitle: '给想法，一点柔软的空间。', label: '柔白纸面 / 莓灰 / 软工具' },
  cove: { name: 'Cove', subtitle: '收拢工具，展开思绪。', label: '鼠尾草 / 胶囊工具轨 / 嵌入画布' },
  afterglow: { name: 'Afterglow', subtitle: '夜深了，想法还亮着。', label: '深咖墨色 / 杏色 / 浮动收纳' },
};
type Concept = keyof typeof concepts;
function App() {
  const query = new URLSearchParams(location.search).get('concept');
  const [concept, setConcept] = useState<Concept>(query === 'cove' || query === 'afterglow' ? query : 'mellow');
  const [notes, setNotes] = useState<Note[]>([
    { id: 'capture', title: '留住，一闪而过', text: '不急着整理。\n\n先把脑海里的那句话，\n放在这里。', x: 70, y: 68, tag: '随手记' },
    { id: 'meeting', title: '让工作轻一点', text: '明天讨论的三件事\n\n把复杂的流程，变成一个动作\n给临时文件，一个落脚的地方\n留一点空白，给新的想法', x: 438, y: 142, tag: '正在想' },
  ]);
  const [selected, setSelected] = useState('meeting'), [tool, setTool] = useState('select');
  const [paths, setPaths] = useState<string[]>([]), [assets, setAssets] = useState<Asset[]>(demoAssets);
  const urls = useRef(new Set(assets.map(a => a.url))), views = useRef<Partial<Record<'C', Viewport>>>({});
  const [command, setCommand] = useState(false), [files, setFiles] = useState(true), [hidden, setHidden] = useState(false), [about, setAbout] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [toast, setToast] = useState('');
  const busyRef = useRef(false), reduce = useReducedMotion();
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 2400); return () => clearTimeout(t); }, [toast]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setHidden(false); setAbout(false); setCommand(v => !v); } if (e.key === 'Escape') setAbout(false); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => { document.body.dataset.round = concept; return () => { delete document.body.dataset.round; }; }, [concept]);
  function add() { const note: Note = { id: crypto.randomUUID(), title: '新的想法', text: '', tag: '随手记', x: 130 + notes.length % 3 * 65, y: 90 + notes.length % 3 * 55 }; setNotes(n => [...n, note]); setSelected(note.id); setToast('新便签已放好'); }
  async function ingest(incoming: File[]) {
    if (busyRef.current || !incoming.length) return;
    busyRef.current = true; setBusy(true); let count = 0; const failures: string[] = [];
    try { for (const file of incoming) { setStatus(`正在读取 ${file.name}`); try { if (file.size > 20 * 1024 * 1024) throw Error('单文件上限 20MB'); const bytes = await file.arrayBuffer(); const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'application/octet-stream' })); urls.current.add(url); setAssets(a => [...a, { id: crypto.randomUUID(), name: file.name, url, kind: fileKind(file), size: bytes.byteLength }]); count++; } catch (error) { failures.push(`${file.name}：${(error as Error).message}`); } } setStatus(`已读取 ${count} 个文件${failures.length ? `；${failures.join('；')}` : ' · 当前浏览器会话'}`); setToast(count ? '文件已收好' : '未能读取文件'); } finally { busyRef.current = false; setBusy(false); }
  }
  function run(id: string) { if (id === 'new') add(); if (id === 'files') { setFiles(true); setToast('投递槽已展开'); } if (id === 'draw') setTool('pen'); if (id === 'focus') setAbout(true); if (id === 'hide') setHidden(true); }
  function change(next: Concept) { setConcept(next); history.replaceState(null, '', `?concept=${next}`); }
  const actions = <><button aria-label="显示工作画布" className="active" onClick={() => { setHidden(false); setTool('select'); }}><Glyph name="board"/><span>工作页</span></button><button aria-label="切换投递槽" aria-pressed={files} onClick={() => setFiles(v => !v)}><Glyph name="tray"/><span>投递槽</span><small>{assets.length}</small></button><button aria-label="新建一张便签" onClick={add}><Glyph name="plus"/><span>随手记</span></button></>;
  return <MotionConfig reducedMotion="user"><div className={`round-app direction-C round-${concept}`}>
    <div className="round-lab"><a href="/">Arasn / 设计探索</a><nav aria-label="C 的三个方向">{(Object.keys(concepts) as Concept[]).map((key, i) => <button key={key} aria-pressed={concept === key} onClick={() => change(key)}><span>C{i + 1}</span>{concepts[key].name}</button>)}</nav><button aria-label="查看原型说明" onClick={() => setAbout(true)}><Glyph name="help" size={18}/><span>原型说明</span></button></div>
    <section className={`round-desk ${files ? '' : 'files-closed'}`}>
      <header className="round-header"><div className="round-brand"><span className="brand-symbol"><Glyph name="mark" size={29}/></span><strong>Arasn<span>随手工作台</span></strong></div><nav className="round-navigation" aria-label="工作区导航">{actions}</nav><button className="round-search" aria-label="打开原型命令面板" onClick={() => setCommand(true)}><Glyph name="search" size={18}/><span>找到想法，或做点什么</span><kbd>Ctrl K</kbd></button><button className="round-hide" aria-label="模拟收起工作台" onClick={() => setHidden(true)}><Glyph name="hide"/></button></header>
      {concept === 'cove' && <aside className="cove-rail"><span>你的工具</span>{actions}<button aria-label="打开操作搜索" onClick={() => setCommand(true)}><Glyph name="search"/><span>找一找</span></button><div className="rail-end"><Glyph name="leaf"/><span>留一点空白</span></div></aside>}
      <div className={`round-stage ${hidden ? 'is-hidden' : ''}`}>
        <div className="round-page-heading"><div><span className="page-location">我的空间 <span>/</span> 随手页</span><h1>{concepts[concept].subtitle}</h1></div><span className="round-page-count">{notes.length} 张便签 <i/>仅此会话</span></div>
        <div className="round-canvas"><Canvas direction="C" notes={notes} selected={selected} select={setSelected} update={(id, patch) => setNotes(n => n.map(note => note.id === id ? { ...note, ...patch } : note))} add={add} remove={id => { setNotes(n => n.filter(note => note.id !== id)); setToast('便签已移除'); }} tool={tool} setTool={setTool} paths={paths} addPath={path => setPaths(p => [...p, path])} views={views.current}/></div>
        <button className="round-capture" onClick={add}><Glyph name="plus"/><span>记下此刻</span><Glyph name="arrow" size={17}/></button>
      </div>
      <AnimatePresence>{files && !hidden && <FileShelf direction="C" assets={assets} busy={busy} status={status} ingest={ingest} close={() => setFiles(false)}/>}</AnimatePresence>
      <AnimatePresence>{hidden && <motion.div className="round-rest" initial={{ opacity: 0, y: reduce ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Glyph name="mark" size={52}/><h1>想法，先放在这里。</h1><p>浏览器内收起演示 · 便签与草图仍然保留</p><button onClick={() => setHidden(false)}>继续工作<Glyph name="arrow"/></button></motion.div>}</AnimatePresence>
      <footer className="round-footer"><span><i/>{concepts[concept].name}<span className="footer-detail"> / {concepts[concept].label}</span></span><span>示例工作页 · 刷新后重置</span><button onClick={() => setCommand(true)}>操作与说明<Glyph name="spark" size={15}/></button></footer>
    </section>
    <CommandPalette direction="C" open={command} setOpen={setCommand} run={run}/>
    <Dialog.Root open={about} onOpenChange={setAbout}><Dialog.Portal><Dialog.Backdrop className={`prototype-backdrop direction-C`}/><Dialog.Popup className={`round-about direction-C`}><Dialog.Title>独立视觉原型</Dialog.Title><Dialog.Description>仅在浏览器会话中编辑和读取文件，不连接正式存储或 LAN。呼出为页面模拟；Office 只提供原文件下载。</Dialog.Description><Dialog.Close>知道了</Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>
    <AnimatePresence>{toast && <motion.div className="round-toast" role="status" initial={{ opacity: 0, y: reduce ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Glyph name="tray" size={18}/>{toast}</motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App/>);
