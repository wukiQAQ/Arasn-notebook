import { Button, IconButton } from "./Button";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X, Upload, List, LayoutGrid } from "lucide-react";
import type { BoardClient, ManagedFile } from "./board";
import { FileMedia } from "./FileStation";
import { fileOriginLabel } from './record-attachments';
import { FilePickerRow, QuickFilePreview, type QuickPreviewAnchor, type RequestFilePreview } from "./FilePickerPreview";
import type { FilePreviewData } from "./FilePreviewContent";

export function FilePicker({ open, onOpenChange, onChoose }: { open: boolean; onOpenChange(open: boolean): void; onChoose(files: ManagedFile[]): Promise<void> }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ManagedFile[]>([]);
  const [selection, setSelection] = useState<ManagedFile[]>([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [quick, setQuick] = useState<(QuickPreviewAnchor & { keyboard: boolean }) | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const delay = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const quickTrigger = useRef<HTMLElement | null>(null);
  const previews = useRef(new Map<string, Promise<FilePreviewData | null>>());
  const request = useRef<RequestFilePreview>((id, refresh = false) => {
    const cache = previews.current;
    const saved = cache.get(id);
    if (saved && !refresh) return saved;
    const oldest = cache.keys().next().value;
    if (cache.size >= 75 && oldest) cache.delete(oldest);
    const result = window.desktop!.files.preview(id).catch(() => null).then(value => {
      if (!value && cache.get(id) === result) cache.delete(id);
      return value;
    });
    cache.set(id, result);
    return result;
  }).current;
  function hideQuick() {
    clearTimeout(delay.current);
    quickTrigger.current = null;
    setQuick(null);
  }
  function showQuick(anchor: QuickPreviewAnchor, keyboard = false) {
    if (!keyboard && quickTrigger.current === anchor.row) return;
    hideQuick();
    quickTrigger.current = anchor.row;
    const active = { ...anchor, keyboard };
    if (keyboard) setQuick(active);
    else delay.current = setTimeout(() => setQuick(active), 240);
  }
  useEffect(() => {
    if (open) {
      setSelection([]); setQuery(""); setPage(0); setError(""); setLayout("list");
    }
    return () => {
      clearTimeout(delay.current);
      quickTrigger.current = null;
      previews.current.clear();
      setQuick(null);
    };
  }, [open]);
  useEffect(() => { if (list.current) list.current.scrollTop = 0; }, [query, page, layout]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    void window.desktop!.files.list({ query, page }).then(data => {
      if (live) { setRows(data.rows); setTotal(data.total); }
    }).catch(e => { if (live) { setRows([]); setError(e.message); } }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [open, query, page, revision]);
  async function choose(files: ManagedFile[]) {
    setBusy(true); setError("");
    try { await onChoose(files); onOpenChange(false); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function importFiles() {
    setBusy(true); setError("");
    try {
      const results = await window.desktop!.files.choose();
      const files = results.flatMap(result => result.ok && result.file ? [result.file] : []);
      setSelection(current => [...current, ...files.filter(file => !current.some(item => item.id === file.id))]);
      refresh(value => value + 1);
      if (results.some(result => !result.ok)) setError("部分文件导入失败，成功的文件已保留，请检查后添加。");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup ref={popup} className="file-picker"
    onKeyDown={event => {
      if (event.key === "Escape" && quick) {
        event.preventDefault();
        event.stopPropagation();
        hideQuick();
      }
    }}>
    <header><Dialog.Title>选择附件</Dialog.Title><Dialog.Close render={<IconButton />} aria-label="关闭文件选择" disabled={busy}><X size={20}/></Dialog.Close></header>
    <div className="file-picker-controls">
      <input className="ui-field" aria-label="搜索附件" placeholder="搜索文件名" value={query} onChange={e => { hideQuick(); setQuery(e.target.value); setPage(0); }}/>
      <Button disabled={busy} onClick={() => { hideQuick(); void importFiles(); }}><Upload size={16}/>导入文件</Button>
      <div className="file-picker-layout" role="group" aria-label="文件显示方式">
        <IconButton aria-label="列表视图" aria-pressed={layout === "list"} onClick={() => { hideQuick(); setLayout("list"); }}><List size={17}/></IconButton>
        <IconButton aria-label="网格视图" aria-pressed={layout === "grid"} onClick={() => { hideQuick(); setLayout("grid"); }}><LayoutGrid size={17}/></IconButton>
      </div>
    </div>
    {error && <p role="alert" className="xigra-notice" data-tone="error">{error}</p>}
    <div ref={list} className="file-picker-list" data-layout={layout} aria-busy={loading}>
      {open && rows.map(file => <FilePickerRow key={file.id} file={file} request={request} disabled={busy || loading}
        checked={selection.some(item => item.id === file.id)} quickOpen={quick?.file.id === file.id}
        showQuick={showQuick} hideQuick={hideQuick}
        onChange={checked => setSelection(current => checked ? [...current, file] : current.filter(item => item.id !== file.id))}/>)}
      {!loading && !rows.length && <p className="file-picker-empty">{query ? "未找到匹配的文件" : "没有可选文件，可先导入。"}</p>}
    </div>
    <footer>
      <Button disabled={busy || loading || !page} onClick={() => { hideQuick(); setPage(page - 1); }}>上一页</Button>
      <span>{page + 1} / {Math.max(1, Math.ceil(total / 25))} 页</span>
      <Button disabled={busy || loading || (page + 1) * 25 >= total} onClick={() => { hideQuick(); setPage(page + 1); }}>下一页</Button>
      <Button variant="primary" className="file-primary" disabled={busy || !selection.length} onClick={() => { hideQuick(); void choose(selection); }}>{busy ? "正在添加…" : `添加所选（${selection.length}）`}</Button>
    </footer>
    {open && quick && <QuickFilePreview key={quick.file.id} anchor={quick} request={request} popup={popup} list={list} />}
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

export function RecordAttachments({ client, recordId, active, notify, onSend }: { client: BoardClient; recordId: string; active: boolean; notify(message: string): void; onSend?(files: ManagedFile[]): Promise<void> }) {
  const links = Object.entries(client.view()).flatMap(([id, item]) => item.value?.type === "content-link" && item.value.recordId === recordId && item.value.targetRef.kind === "file" ? [{ id, fileId: item.value.targetRef.id }] : []);
  const key = JSON.stringify(links);
  const [files, setFiles] = useState<Record<string, ManagedFile>>({});
  useEffect(() => {
    if (!active) return;
    let live = true;
    void Promise.all(links.map(async link => { try { return [link.fileId, await window.desktop!.files.action("metadata", { id: link.fileId, recordId })] as const; } catch { return [link.fileId, null] as const; } })).then(rows => { if (live) setFiles(Object.fromEntries(rows.filter(([, file]) => file)) as Record<string, ManagedFile>); });
    return () => { live = false; };
  }, [key, active]);
  if (!links.length) return null;
  return <section className="record-attachments" aria-label="便签附件">{links.map(link => <div key={link.id}>{files[link.fileId] && <FileMedia file={files[link.fileId]} disabled={Boolean(files[link.fileId].deleted_at)}/>}<span>{files[link.fileId]?.name ?? "文件不可用"}{files[link.fileId]?.deleted_at ? "（在回收站中）" : ""}<small className="record-attachment-source">来源：{fileOriginLabel(files[link.fileId])} · 保留在当前便签 · 文件中心副本</small></span>{onSend && files[link.fileId] && <button className="button" disabled={!!files[link.fileId].deleted_at || files[link.fileId].status === "purged"} onClick={() => {
    void onSend([files[link.fileId]]).then(() => notify("已发送到工作页"), error => notify(String(error)));
  }}>发送到工作页</button>}{onSend && files[link.fileId] && <button className="button" disabled={!!files[link.fileId].deleted_at || files[link.fileId].status === "purged"} onClick={() => {
    void window.desktop!.files.action("reference", { id: link.fileId })
      .then(() => notify("已放入文件面板"), error => notify(String(error)));
  }}>放入面板</button>}<button className="button" onClick={() => { client.edit(link.id, null); void client.flush().catch(e => notify(e.message)); }}>移除引用</button></div>)}</section>;
}
