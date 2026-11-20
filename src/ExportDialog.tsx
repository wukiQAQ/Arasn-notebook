import { IconButton } from "./Button";
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X, Copy, Download, ScanLine } from 'lucide-react';
import { AppSelect } from './xigra/AppSelect';
import { CaptureRegion } from './CaptureRegion';
import { renderCanvasExport, type ExportSource } from './render-export';
import { selectionToWorld, type ExportRequest, type ExportResult } from './canvas-export';
import type { Bounds } from './topology';
import './capture-export.css';

const MODES = [
  { id: 'region', label: '框选截图', help: '拖出矩形，截取指定区域' },
  { id: 'viewport', label: '当前视口', help: '仅当前可见画布，不含工具' },
  { id: 'all', label: '完整画布', help: '全部内容对象，保留当前排版' },
] as const;
export function ExportDialog({ target, snapshot, close, notify }: {
  target(): HTMLElement | null; snapshot(): ExportSource; close(): void; notify(message: string): void;
}) {
  const [phase, setPhase] = useState<'configure' | 'select' | 'preview'>('configure');
  const [options, setOptions] = useState<ExportRequest>({ mode: 'viewport', multiplier: 1, padding: 24 });
  const [result, setResult] = useState<ExportResult>();
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [copying, setCopying] = useState(false), [error, setError] = useState('');
  const source = useRef<ExportSource | null>(null), generation = useRef(0);
  useEffect(() => () => { ++generation.current; }, []);
  useEffect(() => {
    if (!result) { setUrl(''); return; }
    const next = URL.createObjectURL(result.blob); setUrl(next); return () => URL.revokeObjectURL(next);
  }, [result]);
  async function generate(request = options) {
    const id = ++generation.current; setBusy(true); setError(''); setResult(undefined); setPhase('preview');
    try {
      const frozen = source.current ?? snapshot(); source.current = frozen;
      const output = await renderCanvasExport(frozen, request, async (id, name) => {
        if (!window.desktop) throw new Error('当前环境不能读取本机原图，请在桌面应用导出');
        const files = window.desktop.files;
        if (/\.(png|jpe?g)$/i.test(name)) {
          try { return await files.originalImage(id); }
          catch (error) { if (!String(error).includes('原图不可用')) throw error; }
        }
        const preview = await files.preview(id);
        return preview?.image;
      });
      if (id === generation.current) setResult(output);
    } catch (failure) { if (id === generation.current) setError((failure as Error).message); }
    finally { if (id === generation.current) setBusy(false); }
  }
  function update(patch: Partial<ExportRequest>) {
    const next = { ...options, ...patch }; setOptions(next);
    if (next.mode === 'region' && !next.region) { setPhase('configure'); setResult(undefined); return; }
    if (phase === 'preview') void generate(next);
  }
  function beginRegion() {
    if (!target()) { setError('请先打开画布视图再截图。'); return; }
    source.current = null; setResult(undefined); setError(''); setPhase('select');
  }
  function selected(box: Bounds) {
    try {
      const frozen = snapshot(); source.current = frozen;
      const next = { ...options, mode: 'region' as const, region: selectionToWorld(box, frozen.view, frozen.zoom) };
      setOptions(next); void generate(next);
    } catch (failure) { setPhase('configure'); setError((failure as Error).message); }
  }
  async function copy() {
    if (!result) return; setCopying(true); setError('');
    try {
      if (window.desktop) await window.desktop.copyImage(new Uint8Array(await result.blob.arrayBuffer()));
      else if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') await navigator.clipboard.write([new ClipboardItem({ 'image/png': result.blob })]);
      else throw new Error('当前环境不支持复制图片，请保存 PNG。');
      notify('图片已复制');
    } catch (failure) { setError((failure as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')); }
    finally { setCopying(false); }
  }
  function save() {
    if (!url || !result) return;
    const downloadUrl = URL.createObjectURL(result.blob), a = document.createElement('a');
    a.href = downloadUrl; a.download = `${source.current?.name ?? 'Arasn'}-${MODES.find(mode => mode.id === options.mode)!.label}-${options.multiplier}x.png`; a.click();
    // Closing the preview immediately must not invalidate a starting download.
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }
  if (phase === 'select' && target()) return <CaptureRegion target={target()!} cancel={close} select={selected} />;
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop" />
    <Dialog.Popup className="modal capture-dialog" data-phase={phase} onKeyDown={event => event.stopPropagation()}>
      <header className="capture-heading"><div><Dialog.Title>截图 / 导出</Dialog.Title><Dialog.Description>按画布内容合成 PNG，不包含顶栏、侧栏及操作控件。</Dialog.Description></div><IconButton aria-label="关闭截图导出" onClick={close}><X size={18} /></IconButton></header>
      <div className="capture-content"><fieldset className="capture-modes" disabled={busy || copying}><legend className="sr-only">截图范围</legend>{MODES.map(mode => <label key={mode.id}>
        <input type="radio" name="capture-mode" value={mode.id} checked={options.mode === mode.id} onChange={() => update({ mode: mode.id })} />
        <span><strong>{mode.label}</strong><small>{mode.help}</small></span>
      </label>)}</fieldset>
      <div className="capture-options"><label>导出倍率<AppSelect label="导出倍率" value={String(options.multiplier)} disabled={busy || copying} onValueChange={value => update({ multiplier: Number(value) })}
        options={[{ value: '1', label: '1× · 标准' }, { value: '2', label: '2× · 双倍' }, { value: '4', label: '4× · 四倍' }]} /></label>
        {options.mode === 'all' && <label>四周留白<AppSelect label="导出留白" value={String(options.padding)} disabled={busy || copying} onValueChange={value => update({ padding: Number(value) })}
          options={[{ value: '0', label: '0 px' }, { value: '24', label: '24 px' }, { value: '48', label: '48 px' }, { value: '96', label: '96 px' }]} /></label>}
        <span className="capture-size" role="status">{busy ? '正在生成预览…' : result ? `${result.width} × ${result.height} px · PNG` : '逻辑像素 × 倍率，独立于屏幕 DPI'}</span>
      </div>
      {phase === 'preview' && <div className="capture-preview" aria-busy={busy}>{url && result ? <img src={url} alt="画布截图预览" /> : <p>{busy ? '正在合成文字、图片与连线…' : '尚未生成图片'}</p>}</div>}
      {result?.warnings.length ? <ul className="capture-warnings">{result.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul> : null}
      {error && <p className="capture-error" role="alert">{error}</p>}
      <p className="capture-footnote">保留卡片尺寸与可见正文 · 上限 3200 万像素 / 16384 px。</p>
      </div>
      <footer className="capture-actions"><button className="button" onClick={close}>取消</button>
        <button className={`button ${!result ? 'primary' : ''}`} disabled={busy || copying} onClick={() => { if (options.mode === 'region') beginRegion(); else { source.current = null; void generate(); } }}>
          {options.mode === 'region' ? <><ScanLine size={16} />{result ? '重新框选' : '开始框选'}</> : phase === 'preview' ? '刷新预览' : '生成预览'}
        </button>
        {result && <><button className="button" disabled={copying || busy} onClick={() => void copy()}><Copy size={16} />{copying ? '正在复制…' : '复制图片'}</button><button className="button primary" disabled={busy || copying || !url} onClick={save}><Download size={16} />保存 PNG</button></>}
      </footer>
    </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
