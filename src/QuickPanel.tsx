import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, Plus, Search, RelationCanvasIcon } from "./LagoonIcons";
import { Maximize2 } from "lucide-react";
import type { BoardClient, DesktopInfo, ImportResult } from "./board";
import { SaveRecoveryActions, SaveStatus } from "./xigra/visuals";
import { RecordEditor } from "./xigra/records/RecordEditor";
import { RecordList } from "./xigra/records/RecordList";
import type { RecordSession } from "./xigra/records/session";
import "./xigra/shell.css";

export function QuickPanel({ client, info, session, search, expand, hide, copy, incoming, onCanvas, onViewCanvas }: {
  client: BoardClient;
  info: DesktopInfo | null;
  session: RecordSession;
  search(): void;
  expand(): void;
  hide(): void;
  copy(text: string): void;
  onCanvas?(id: string): Promise<{ nodeId: string; existing: boolean }>;
  onViewCanvas?(id: string): void;
  incoming?: { count: number; open(): void };
}) {
  const titleInput = useRef<HTMLInputElement>(null);
  const titleCarets = useRef(new Map<string, { start: number; end: number }>());
  const [titleComposition, setTitleComposition] = useState<string | null>(null);
  const restoreTitleCaret = titleCarets.current.get(session.id);
  useLayoutEffect(() => {
    const caret = restoreTitleCaret;
    if (caret && titleInput.current) {
      titleCarets.current.set(session.id, caret);
      titleInput.current.focus({ preventScroll: true });
      titleInput.current.setSelectionRange(caret.start, caret.end);
    }
  }, [session.focusVersion]);
  const [dragging, setDragging] = useState(false);
  const [adding, setAdding] = useState(false);
  const addingRef = useRef(false);
  const [canvasResult, setCanvasResult] = useState<{ id: string; message: string }>();
  const [canvasError, setCanvasError] = useState("");

  async function addToCanvas() {
    if (!onCanvas || addingRef.current || session.composing || !session.id) return;
    const id = session.id;
    addingRef.current = true; setAdding(true); setCanvasError(""); setCanvasResult(undefined);
    try {
      const result = await onCanvas(id);
      setCanvasResult({ id, message: result.existing ? "已在关系画布中" : "已加入关系画布" });
    } catch (error) { setCanvasError(error instanceof Error ? error.message : String(error)); }
    finally { addingRef.current = false; setAdding(false); }
  }
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState(false);
  const dragDepth = useRef(0);
  const importPending = useRef(false);
  const files = window.desktop?.files;
  useEffect(() => files?.progress(({ bytes, total }) => {
    if (importPending.current && total > 0) {
      setImportMessage(`正在存入文件 · ${Math.min(100, Math.round(bytes / total * 100))}%`);
    }
  }), [files]);

  async function importFiles(run: () => Promise<ImportResult[]>) {
    if (importPending.current) return;
    importPending.current = true;
    setImporting(true);
    setImportError(false);
    setImportMessage("正在存入文件…");
    try {
      const results = await run();
      const failures = results.filter(result => !result.ok);
      const count = results.length - failures.length;
      setImportError(failures.length > 0);
      if (failures.length) {
        setImportMessage(`已存入 ${count} 个，${failures.length} 个失败。${failures[0].error || "请在工作站查看。"}`);
      } else {
        setImportMessage(count ? `已存入 ${count} 个文件` : "");
      }
    } catch (error) {
      setImportError(true);
      setImportMessage(error instanceof Error ? error.message : "文件存入失败，请重试。");
    } finally {
      importPending.current = false;
      setImporting(false);
    }
  }

  const saveError = Boolean(client.error || client.conflicts.length);
  return (
    <section
      className="quick-panel xigra-shell"
      aria-label="快捷面板"
      onDragEnter={event => {
        if (!files || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={event => {
        if (!files || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = importing ? "none" : "copy";
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setDragging(false);
      }}
      onDrop={event => {
        if (!files || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length) void importFiles(() => files.drop(dropped));
      }}
      onPasteCapture={event => {
        if (!files || !event.clipboardData.files.length) return;
        event.preventDefault();
        void importFiles(async () => (await files.paste()).results || []);
      }}
    >
      <header className="quick-header xigra-note-heading quick-recorder-heading">
        <h1>速记</h1>
        <div className="xigra-note-actions" role="group" aria-label="速记操作">
          {incoming && <button className="xigra-quiet-button" aria-label={`待接收便签，${incoming.count} 条`} disabled={session.composing} onClick={incoming.open}>收件 {incoming.count}</button>}
          <button className="xigra-quiet-button quick-search-action" disabled={session.composing} onClick={search} aria-label="搜索便签" title="搜索便签"><Search size={16} aria-hidden="true" /><span>搜索</span></button>
          <button className="xigra-quiet-button xigra-quick-create" disabled={session.composing || session.volatile} onClick={() => { titleCarets.current.delete(""); session.open(""); }}><Plus size={16} aria-hidden="true" />新建便笺</button>
          <button className="xigra-quiet-button quick-expand-action" disabled={session.composing} onClick={expand} aria-label="打开工作区" title="打开工作区"><Maximize2 size={16} aria-hidden="true" /><span>工作区</span></button>
        </div>
      </header>
      {(saveError || info?.sharing || (info && !info.shortcutOk)) && (
        <div className="xigra-shell-notices">
          {saveError && <div className="quick-notice xigra-notice" data-tone="error" role="status">{client.error} <SaveRecoveryActions client={client} copy={copy} text={session.text} /></div>}
          {info?.sharing && <div className="quick-notice xigra-notice" data-tone="saved">白板共享中，此处的便笺也会同步。</div>}
          {info && !info.shortcutOk && <div className="quick-notice xigra-notice" data-tone="warning">快捷键被占用，可在工作站的设置中更换。</div>}
        </div>
      )}
      <div className="quick-content" onFocusCapture={event => {
        if (event.target instanceof HTMLTextAreaElement) titleCarets.current.delete(session.id);
      }}>
        <input ref={titleInput} className="quick-title" aria-label="便签标题" placeholder="标题（可选）" maxLength={200}
          disabled={!client.ready} value={titleComposition ?? session.title}
          onChange={event => titleComposition !== null ? setTitleComposition(event.target.value) : session.rename(event.target.value)}
          onBlur={event => titleCarets.current.set(session.id, { start: event.target.selectionStart ?? 0, end: event.target.selectionEnd ?? 0 })}
          onCompositionStart={event => { setTitleComposition(event.currentTarget.value); session.startComposition(session.text); }}
          onCompositionEnd={event => {
            const title = event.currentTarget.value;
            setTitleComposition(null);
            session.endComposition(session.text, session.selection() ?? { start: 0, end: 0, direction: "none" });
            session.rename(title);
          }}
          onKeyDown={event => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault(); titleCarets.current.delete(session.id); session.focus();
            }
          }} />
        <RecordEditor session={session} />
      </div>
      <div className="quick-support">
      {session.recent.length > 0 && <section className="xigra-recent-records" aria-label="最近便笺">
        <button type="button" className="xigra-recent-label" onClick={search} disabled={session.composing}>最近</button>
        <RecordList rows={session.recent.slice(0, 6)} current={session.id} onSelect={session.open} disabled={session.composing || session.volatile} compact />
      </section>}
      <footer className="quick-footer">
        <div className="quick-state-group">
          <SaveStatus client={client} recordId={session.id} empty={!session.record} volatile={session.volatile} />
          <span className="quick-input-state">{session.composing ? "正在输入…" : `${session.text.length} / 10000 字`}</span>
        </div>
        <div className="quick-canvas-actions">
          {files && <button className="xigra-quiet-button quick-file-action" disabled={importing || session.composing} onClick={() => void importFiles(() => files.choose())} title="也可以把文件拖到面板">
            <Icon name="tray" size={16} aria-hidden="true" />添加文件
          </button>}
          {onCanvas && <button className="xigra-quiet-button" disabled={adding || session.composing || !session.id || !session.text.trim()} onClick={() => void addToCanvas()}><RelationCanvasIcon size={16}/>{adding ? "保存并加入中…" : "加入关系画布"}</button>}
        </div>
        {canvasResult?.id === session.id && <div className="quick-canvas-result" role="status"><span>{canvasResult.message}</span><button className="xigra-quiet-button" onClick={() => onViewCanvas?.(canvasResult.id)}>查看节点</button></div>}
        {canvasError && <div className="quick-canvas-result" role="alert">{canvasError}</div>}
        {importMessage && <div className="xigra-import-message xigra-notice" data-tone={importError ? "error" : importing ? "pending" : "saved"} role="status">{importMessage}</div>}
      </footer>
      </div>
      {dragging && <div className="xigra-drop-overlay" aria-hidden="true"><Icon name="tray" size={32} />{importing ? "正在存入上一批文件" : "松手存入文件"}</div>}
    </section>
  );
}
