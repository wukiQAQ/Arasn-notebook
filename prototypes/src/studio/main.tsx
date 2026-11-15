import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from 'motion/react';
import { Dialog } from '@base-ui/react/dialog';
import { Board } from './Board';
import { Icon } from './Icons';
import { FileShelf } from '../FileShelf';
import { CommandPalette } from '../CommandPalette';
import { demoAssets, fileKind } from '../model';
import type { Asset, Note } from '../model';
import '../style.css';
import './style.css';

function App() {
  const [dark, setDark] = useState(new URLSearchParams(location.search).get('theme') === 'dark');
  const [mobile, setMobile] = useState(innerWidth < 640), [overview, setOverview] = useState(false);
  const [title, setTitle] = useState('我的随手页'), [selected, setSelected] = useState('meeting');
  const [notes, setNotes] = useState<Note[]>([
    { id: 'capture', title: '先放在这里', text: '一个还没成形的想法，\n也值得被留下。\n\n不必现在就整理。', x: 48, y: 52, tag: '随手记' },
    { id: 'meeting', title: '把下一步，写轻一点', text: '明天讨论\n\n确认这次交付的范围\n把反馈整理成三个问题\n把需要的文件放进投递槽', x: 414, y: 148, tag: '工作笔记' },
  ]);
  const [penRequest, setPenRequest] = useState(0);
  const [paths, setPaths] = useState<string[]>([]), [assets, setAssets] = useState<Asset[]>(demoAssets);
  const urls = useRef(new Set(assets.map(a => a.url))), lock = useRef(false);
  const [files, setFiles] = useState(false), [index, setIndex] = useState(false), [command, setCommand] = useState(false), [about, setAbout] = useState(false), [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(''), [toast, setToast] = useState('');
  const fileTrigger = useRef<HTMLButtonElement>(null), reduced = useReducedMotion();
  useEffect(() => { const media = matchMedia('(max-width:639px)'); const resize = () => setMobile(media.matches); media.addEventListener('change', resize); return () => media.removeEventListener('change', resize); }, []);
  useEffect(() => { document.body.dataset.studio = dark ? 'dark' : 'light'; return () => { delete document.body.dataset.studio; }; }, [dark]);
  useEffect(() => () => { urls.current.forEach(url => URL.revokeObjectURL(url)); }, []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 2200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setFiles(false); setIndex(false); setAbout(false); setHidden(false); setCommand(v => !v); } }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); }, []);
  useEffect(() => { if (files) setToast(''); }, [files]);
  function add() { const note: Note = { id: crypto.randomUUID(), title: '新的想法', text: '', x: 100 + notes.length % 4 * 80, y: 80 + notes.length % 4 * 60, tag: '随手记' }; setNotes(n => [...n, note]); setSelected(note.id); setOverview(false); setToast('已新建便签'); }
  function remove(id: string) { setNotes(n => { const next = n.filter(note => note.id !== id); if (selected === id) setSelected(next[0]?.id || ''); return next; }); setToast('便签已移除'); }
  async function ingest(incoming: File[]) {
    if (!incoming.length || lock.current) return; lock.current = true; setBusy(true); let done = 0; const failures: string[] = [];
    try { for (const [i, file] of incoming.entries()) { setStatus(`读取 ${i + 1}/${incoming.length}：${file.name}`); try { if (file.size > 20 * 1024 * 1024) throw Error('单文件上限 20MB'); const bytes = await file.arrayBuffer(); const url = URL.createObjectURL(new Blob([bytes], { type: file.type || 'application/octet-stream' })); urls.current.add(url); setAssets(a => [...a, { id: crypto.randomUUID(), name: file.name, kind: fileKind(file), url, size: bytes.byteLength }]); done++; } catch (e) { failures.push(`${file.name}：${(e as Error).message}`); } } setStatus(`已读取 ${done} 个文件${failures.length ? `；${failures.join('；')}` : '，仅保留在当前会话'}`); setToast(''); } finally { setBusy(false); lock.current = false; }
  }
  function run(id: string) { if (id === 'new') add(); if (id === 'files') setFiles(true); if (id === 'draw') { setOverview(true); setPenRequest(n => n + 1); setToast('画笔已就绪'); } if (id === 'focus') setAbout(true); if (id === 'hide') setHidden(true); }
  return <MotionConfig reducedMotion="user"><div className="studio-app">
    <aside className="studio-rail"><a className="studio-mark" href="/studio.html" aria-label="Arasn 轻泊首页"><Icon name="mark" size={30}/></a><nav aria-label="工作台导航"><button className="rail-active" aria-label="打开工作页" onClick={() => { setHidden(false); setOverview(false); }}><Icon name="board"/><span>工作页</span></button><button aria-label="打开便签列表" onClick={() => setIndex(true)}><Icon name="list"/><span>便签</span></button><button aria-label="打开文件投递槽" onClick={() => setFiles(true)}><Icon name="tray"/><span>文件</span><i>{assets.length}</i></button></nav><div className="rail-bottom"><button aria-label={dark ? '切换浅色主题' : '切换深色主题'} onClick={() => setDark(v => !v)}><Icon name={dark ? 'sun' : 'moon'}/></button><button aria-label="查看原型说明" onClick={() => setAbout(true)}><Icon name="help" size={20}/></button></div></aside>
    <header className="studio-header"><div className="workspace-name"><span>Arasn <b>轻泊</b></span><input aria-label="工作页名称" value={title} onChange={e => setTitle(e.target.value)}/></div><button className="studio-search" aria-label="打开原型命令面板" onClick={() => setCommand(true)}><Icon name="search" size={18}/><span>搜索与操作</span><kbd>Ctrl K</kbd></button><button className="studio-add" onClick={add}><Icon name="plus" size={20}/><span>新建便签</span></button><button className="studio-hide" aria-label="模拟收起工作台" onClick={() => setHidden(true)}><Icon name="hide"/></button></header>
    <main className="studio-main"><div className="canvas-bar"><span><i/>{mobile && !overview ? '单张编辑' : '自由画布'}<small>{notes.length} 张便签</small></span>{mobile ? <button aria-pressed={overview} onClick={() => setOverview(v => !v)}><Icon name={overview ? 'note' : 'board'} size={17}/>{overview ? '返回编辑' : '画布总览'}</button> : <span className="canvas-instruction">空格拖动画布 · Ctrl / ⌘ 滚轮缩放</span>}</div>
      <div className={`board-container ${hidden ? 'is-resting' : ''}`}><Board notes={notes} selected={selected} select={setSelected} update={(id, patch) => setNotes(n => n.map(note => note.id === id ? { ...note, ...patch } : note))} remove={remove} paths={paths} addPath={path => setPaths(p => [...p, path])} mobile={mobile} overview={overview} penRequest={penRequest}/></div>
      {hidden && <motion.div className="studio-rest" initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}><Icon name="mark" size={48}/><h1>稍后，接着想。</h1><p>便签和草图仍在当前会话中。</p><button onClick={() => setHidden(false)}>回到工作页<Icon name="arrow" size={18}/></button></motion.div>}
    </main>
    <footer className="studio-tray" onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); setFiles(true); void ingest(Array.from(e.dataTransfer.files)); }}><button ref={fileTrigger} className="tray-trigger" aria-label="展开文件投递槽" onClick={() => setFiles(true)}><span className="tray-icon"><Icon name="tray"/></span><strong>投递槽</strong><span className="tray-count">{assets.length}</span></button><div className="tray-peek">{assets.slice(-2).map(file => <button key={file.id} onClick={() => setFiles(true)}><Icon name="note" size={16}/>{file.name}</button>)}</div><span className="tray-hint">文件先放这里，需要时再整理。</span><span className="session-label">会话原型 · 刷新重置</span><button className="tray-open" aria-label="查看投递槽文件" onClick={() => setFiles(true)}><span>打开</span><Icon name="arrow" size={18}/></button></footer>
    <Dialog.Root open={files} onOpenChange={setFiles}><Dialog.Portal><Dialog.Backdrop className="studio-scrim"/><Dialog.Popup className="studio-files" finalFocus={fileTrigger} render={<motion.div initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0 : .18 }}/>}><div className="drawer-heading"><div><span>临时收纳，有处可寻</span><Dialog.Title>文件投递槽</Dialog.Title></div><Dialog.Close aria-label="关闭文件投递槽"><Icon name="close"/></Dialog.Close></div><Dialog.Description className="drawer-description">图片可预览，文档保留原件。仅当前会话。</Dialog.Description><FileShelf direction="C" assets={assets} busy={busy} status={status} ingest={ingest} close={() => setFiles(false)}/></Dialog.Popup></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={index} onOpenChange={setIndex}><Dialog.Portal><Dialog.Backdrop className="studio-scrim"/><Dialog.Popup className="studio-note-list"><div className="drawer-heading"><Dialog.Title>这一页的便签</Dialog.Title><Dialog.Close aria-label="关闭便签列表"><Icon name="close"/></Dialog.Close></div><Dialog.Description>选择一张，继续记录。</Dialog.Description>{notes.map(note => <button key={note.id} aria-pressed={selected === note.id} onClick={() => { setSelected(note.id); setOverview(false); setIndex(false); }}><Icon name="note"/><span><strong>{note.title || '未命名便签'}</strong><small>{note.text.slice(0, 35) || '从一句话开始'}</small></span><Icon name="arrow" size={18}/></button>)}{!notes.length && <p>还没有便签。关闭列表后，点“新建便签”。</p>}</Dialog.Popup></Dialog.Portal></Dialog.Root>
    <CommandPalette direction="C" open={command} setOpen={setCommand} run={run}/>
    <Dialog.Root open={about} onOpenChange={setAbout}><Dialog.Portal><Dialog.Backdrop className="studio-scrim"/><Dialog.Popup className="studio-about"><Dialog.Title>Arasn · 轻泊</Dialog.Title><Dialog.Description>一个让想法和临时文件轻轻停靠的工作台。</Dialog.Description><p>此页是可交互设计原型。内容只保留在浏览器会话；不连接正式数据、局域网或系统快捷键。手机默认单张编辑，画布总览可以切换。Office 只提供原文件下载。</p><Dialog.Close>知道了</Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>
    <AnimatePresence>{toast && <motion.div className="studio-toast" role="status" key={toast} initial={reduced ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Icon name="note" size={18}/>{toast}</motion.div>}</AnimatePresence>
  </div></MotionConfig>;
}
createRoot(document.getElementById('root')!).render(<App/>);
