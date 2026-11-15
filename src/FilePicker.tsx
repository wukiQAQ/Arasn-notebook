import { useEffect, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X, Upload } from "lucide-react";
import type { BoardClient, ManagedFile } from "./board";
import { FileMedia } from "./FileStation";

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
  useEffect(() => { if (open) { setSelection([]); setQuery(""); setPage(0); setError(""); } }, [open]);
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
  return <Dialog.Root open={open} onOpenChange={value => { if (!busy) onOpenChange(value); }}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="file-picker">
    <header><div><Dialog.Title>选择附件</Dialog.Title><Dialog.Description>选择已有文件或导入，添加到当前内容。文件整理请进入文件页。</Dialog.Description></div><Dialog.Close aria-label="关闭文件选择" disabled={busy}><X size={20}/></Dialog.Close></header>
    <div className="file-picker-controls"><input aria-label="搜索附件" placeholder="搜索文件名" value={query} onChange={e => { setQuery(e.target.value); setPage(0); }}/><button disabled={busy} onClick={() => void importFiles()}><Upload size={16}/>导入文件</button></div>
    {error && <p role="alert" className="xigra-notice" data-tone="error">{error}</p>}
    <div className="file-picker-list" aria-busy={loading}>{rows.map(file => <label key={file.id}><input type="checkbox" aria-label={`选择附件 ${file.name}`} checked={selection.some(item => item.id === file.id)} disabled={busy || loading} onChange={e => setSelection(current => e.target.checked ? [...current, file] : current.filter(item => item.id !== file.id))}/><span>{file.name}</span><small>{file.category}</small></label>)}{!loading && !rows.length && <p>没有可选文件，可先导入。</p>}</div>
    <footer><button disabled={busy || loading || !page} onClick={() => setPage(page - 1)}>上一页</button><span>{page + 1} 页</span><button disabled={busy || loading || (page + 1) * 25 >= total} onClick={() => setPage(page + 1)}>下一页</button><button className="file-primary" disabled={busy || !selection.length} onClick={() => void choose(selection)}>{busy ? "正在添加…" : `添加所选（${selection.length}）`}</button></footer>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}

export function RecordAttachments({ client, recordId, active, notify }: { client: BoardClient; recordId: string; active: boolean; notify(message: string): void }) {
  const links = Object.entries(client.view()).flatMap(([id, item]) => item.value?.type === "content-link" && item.value.recordId === recordId && item.value.targetRef.kind === "file" ? [{ id, fileId: item.value.targetRef.id }] : []);
  const key = JSON.stringify(links);
  const [files, setFiles] = useState<Record<string, ManagedFile>>({});
  useEffect(() => {
    if (!active) return;
    let live = true;
    void Promise.all(links.map(async link => { try { return [link.fileId, await window.desktop!.files.action("metadata", { id: link.fileId })] as const; } catch { return [link.fileId, null] as const; } })).then(rows => { if (live) setFiles(Object.fromEntries(rows.filter(([, file]) => file)) as Record<string, ManagedFile>); });
    return () => { live = false; };
  }, [key, active]);
  if (!links.length) return null;
  return <section className="record-attachments" aria-label="便签附件">{links.map(link => <div key={link.id}>{files[link.fileId] && <FileMedia file={files[link.fileId]} disabled={Boolean(files[link.fileId].deleted_at)}/>}<span>{files[link.fileId]?.name ?? "文件不可用"}{files[link.fileId]?.deleted_at ? "（在回收站中）" : ""}</span><button className="button" onClick={() => { client.edit(link.id, null); void client.flush().catch(e => notify(e.message)); }}>移除引用</button></div>)}</section>;
}
