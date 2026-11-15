import { useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { FolderOpen, Plus, X, FileText, Image as ImageIcon, Headphones, File, ArrowDownToLine, Upload, Check, Search } from 'lucide-react';
import type { Asset, Direction } from './model';
import { bytesLabel } from './model';

export function FileShelf({ direction, assets, busy, status, ingest, close }: { direction: Direction; assets: Asset[]; busy: boolean; status: string; ingest: (files: File[]) => void; close: () => void }) {
  const [dragOver, setDragOver] = useState(false), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState(direction === 'C' ? '' : assets[0]?.id || '');
  const input = useRef<HTMLInputElement>(null), enterCount = useRef(0);
  const reduced = useReducedMotion();
  const current = assets.find(asset => asset.id === preview);
  const visible = assets.filter(asset => (filter === 'all' || asset.kind === filter) && asset.name.toLowerCase().includes(query.toLowerCase()));
  const Icon = current?.kind === 'audio' ? Headphones : FileText;
  return <motion.aside className={`file-shelf ${dragOver ? 'drop-active' : ''}`} aria-label="原型文件中转站" initial={reduced ? false : { opacity: 0, y: direction === 'C' ? 16 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
    transition={reduced ? { duration: 0 } : direction === 'B' ? { type: 'spring', stiffness: 340, damping: 32 } : { duration: .16 }}
    onDragEnter={event => { event.preventDefault(); enterCount.current++; setDragOver(true); }} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
    onDragLeave={() => { enterCount.current--; if (enterCount.current <= 0) setDragOver(false); }} onDrop={event => { event.preventDefault(); enterCount.current = 0; setDragOver(false); ingest(Array.from(event.dataTransfer.files)); }}>
    <header><span><FolderOpen size={17} /><strong>{direction === 'A' ? '文件检查器' : direction === 'B' ? '文件舱' : '投递槽'}</strong><small>{assets.length}</small></span><div><button aria-label="导入本地文件" onClick={() => input.current?.click()} disabled={busy}><Plus size={17} /></button><button aria-label="收起文件中转站" onClick={close}><X size={15} /></button></div></header>
    <input ref={input} type="file" multiple hidden aria-label="选择原型文件" onChange={event => { ingest(Array.from(event.target.files || [])); event.currentTarget.value = ''; }} />
    <div className="file-filters" role="group" aria-label="文件分类">{[['all', '全部'], ['image', '图片'], ['audio', '音频'], ['document', '文档'], ['pdf', 'PDF']].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
    <label className="file-query"><Search size={14} /><input aria-label="搜索原型文件" placeholder="搜索文件…" value={query} onChange={event => setQuery(event.target.value)} /></label>
    <AnimatePresence mode="wait">{current && <motion.div className="asset-preview" key={current.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .12 }}>
      <button className="preview-close" aria-label="关闭文件预览" onClick={() => setPreview('')}><X size={14} /></button>
      {current.kind === 'image' ? <img src={current.url} alt={current.name} /> : current.kind === 'audio' ? <div className="audio-preview"><Headphones size={28} /><audio controls src={current.url} aria-label={current.name} /></div> : current.kind === 'pdf' ? <iframe title={`PDF预览 ${current.name}`} src={current.url} /> : <div className="document-preview"><Icon size={32} /><strong>{current.name}</strong><p>保留原文件。原型不解析 Office 内容。</p><a href={current.url} download={current.name}><ArrowDownToLine size={13} />下载原文件</a></div>}
      <small>{current.name}{current.demo ? ' · 示例文件' : ' · 本会话文件'}</small>
    </motion.div>}</AnimatePresence>
    <div className="file-items">{visible.map(asset => {
      const Glyph = asset.kind === 'image' ? ImageIcon : asset.kind === 'audio' ? Headphones : asset.kind === 'pdf' ? File : FileText;
      return <motion.button layout={direction !== 'A' && !reduced} initial={reduced ? false : { opacity: 0, y: direction === 'C' ? -10 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : .18 }} key={asset.id} className={`file-item ${asset.id === preview ? 'active' : ''}`} onClick={() => setPreview(asset.id)}><span className={`file-glyph kind-${asset.kind}`}><Glyph size={18} /></span><span><strong>{asset.name}</strong><small>{asset.kind === 'image' ? '图片' : asset.kind === 'audio' ? '音频' : asset.kind === 'pdf' ? 'PDF' : '文档'} · {bytesLabel(asset.size)}</small></span><Check size={12} className="file-check" /></motion.button>;
    })}{!visible.length && <p className="files-empty">没有匹配文件，试试其他分类。</p>}</div>
    <button className="drop-zone" disabled={busy} onClick={() => input.current?.click()}><Upload size={18} /><span>{dragOver ? '松开，放入这里' : busy ? '正在读取文件…' : '拖入文件，或点击选择'}<small>仅浏览器会话 · 单文件上限 20MB</small></span></button>
    <div className="file-status" role="status">{status || '示例文件可预览；真实导入不写入桌面中转站。'}</div>
    {dragOver && <div className="drop-overlay" aria-hidden="true"><Upload size={28} /><strong>放进文件舱</strong><span>读取完成后才会加入列表</span></div>}
  </motion.aside>;
}
