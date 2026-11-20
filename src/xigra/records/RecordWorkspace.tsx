import { Button } from "../../Button";
import { RecordAttachments } from "../../FilePicker";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis, PanelLeftClose, PanelLeftOpen, Pin, PinOff, Upload } from "lucide-react";
import { Copy, Trash2, X } from "../../LagoonIcons";
import type { BoardClient, ImportResult, ManagedFile } from "../../board";
import { useNotification } from "../../Notification";
import { NoteStatusBar } from "../../NoteStatusBar";
import { NewNoteButton } from "../../NewNoteButton";
import { recordFileLinks, useAttachmentEscape } from "../../record-attachments";
import { Popover } from "@base-ui/react/popover";
import { Paperclip } from "lucide-react";
import { RecordEditor } from "./RecordEditor";
import { RecordList, recordTitle } from "./RecordList";
import { filterRecords, RecordSearch } from "./RecordSearch";
import type { RecordSession } from "./session";
import { AppSelect } from "../AppSelect";
import { HelpPopover } from "../HelpPopover";
import { FolderOpen } from "lucide-react";

export function RecordWorkspace({ onCreate, createDisabled, active, quick, setQuick, importing, setImporting, session, client, query, setQuery, confirmDelete, copy, notify, sendNote, onCanvas, onFreePage, onFiles, onFileCenter, onAttach, onSendFiles }: {
  onCreate(): void;
  createDisabled: boolean;
  active: boolean;
  quick: boolean;
  setQuick(value: boolean): void;
  importing: boolean;
  setImporting(value: boolean): void;
  session: RecordSession; client: BoardClient; query: string; setQuery(value: string): void; confirmDelete(id: string): void;
  copy(text: string): void; notify(message: string): void;
  sendNote?(id: string, title: string): void;
  onCanvas?(id: string): void;
  onFreePage(id: string): void;
  onFiles(): void;
  onFileCenter(): void;
  onAttach(files: ManagedFile[], id: string, origin: string): Promise<void>;
  onSendFiles(files: ManagedFile[]): Promise<void>;
}) {
  const { dismiss } = useNotification();
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  useAttachmentEscape(attachmentsOpen, () => setAttachmentsOpen(false));
  useEffect(() => { if (!active) setAttachmentsOpen(false); }, [active]);
  const [showRecent, setShowRecent] = useState(false);
  const [titleComposition, setTitleComposition] = useState<string | null>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const [libraryOverlay, setLibraryOverlay] = useState(false);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!active || !workspace) return;
    setLibraryOverlay(workspace.clientWidth <= 650);
    const observer = new ResizeObserver(([entry]) => setLibraryOverlay(entry.contentRect.width <= 650));
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [active]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  useEffect(() => { if (!active || quick) setLibraryOpen(false); }, [active, quick]);
  const libraryVisible = !quick && (!libraryOverlay || libraryOpen);
  const libraryAction = libraryVisible ? "收起便签库" : "展开便签库";
  const LibraryIcon = libraryVisible ? PanelLeftClose : PanelLeftOpen;
  const [importProgress, setImportProgress] = useState("");
  const importPending = useRef(false);
  const files = window.desktop!.files;
  useEffect(() => files.progress(({ bytes, total }) => {
    if (importPending.current && total > 0) setImportProgress(`正在存入文件 · ${Math.min(100, Math.round(bytes / total * 100))}%`);
  }), [files]);

  async function importFiles(run: () => Promise<ImportResult[]>, origin = "本地导入") {
    if (importPending.current || session.composing || titleComposition !== null || !client.ready) return;
    importPending.current = true;
    setImporting(true);
    setImportProgress("正在存入文件…");
    try {
      const results = await run();
      const added = results.flatMap(result => result.ok && result.file ? [result.file] : []);
      if (added.length) {
        const id = session.id || session.ensureRecord();
        await onAttach(added, id, origin);
        notify(`已添加 ${added.length} 个附件`);
      }
      const failure = results.find(result => !result.ok);
      if (failure) notify(failure.error || "部分附件导入失败");
    } catch (error) {
      notify(error instanceof Error ? error.message : "附件导入失败");
    } finally {
      importPending.current = false;
      setImporting(false);
      setImportProgress("");
    }
  }
  const [savingPin, setSavingPin] = useState(false);
  const [scope, setScope] = useState<'all' | 'linked' | 'unlinked'>('all');
  const linked = new Set(Object.values(client.view()).flatMap(item => {
    const v = item.value;
    return v?.type === 'canvas-node' && v.roomId === client.base.roomId && !v.layout.hidden && v.contentRef.kind === 'record' ? [v.contentRef.id] : [];
  }));
  const inScope = (row: {id: string}) => scope === 'all' || (scope === 'linked' ? linked.has(row.id) : !linked.has(row.id));
  const pinned = showRecent ? [] : filterRecords(session.pinned, query).filter(inScope);
  const pinnedIds = new Set(pinned.map(row => row.id));
  const rows = filterRecords(showRecent ? session.recent : session.rows, query).filter(row => !pinnedIds.has(row.id) && inScope(row));
  const rowActions = { current: session.id, disabled: importing || session.composing || titleComposition !== null || session.volatile, onSelect: (id: string) => { session.open(id); setLibraryOpen(false); } };
  const record = session.record;
  const source = client.view()[session.id]?.value;
  const onFreeCanvas = (source?.type === "text" && !source.localOnly) ||
    ((source?.type === "node" || source?.type === "text") && Boolean(source.freePlacement));
  const isPinned = client.pinnedRecords.includes(session.id);
  const PinAction = isPinned ? PinOff : Pin;
  const deletion = session.deletion;

  async function togglePin(id: string) {
    setSavingPin(true);
    const saved = await client.toggleRecordPin(id);
    setSavingPin(false);
    if (!saved) notify("置顶设置未保存，请重试。");
  }

  return <section ref={workspaceRef} id={active ? "workspace" : undefined} className="xigra-record-workspace xigra-workspace-view" data-quick={quick} data-library-overlay={libraryOverlay} data-library-open={libraryVisible} hidden={!active} aria-label="便签工作区" tabIndex={-1}>
    <aside className="xigra-record-index" id="record-library" aria-label="便签库" inert={!libraryVisible}>
      <div className="record-index-heading"><h2>便签库</h2></div>
      <RecordSearch query={query} setQuery={setQuery} />
      <div className="xigra-record-filters" aria-label="列表范围">
        <Button type="button" aria-pressed={!showRecent} onClick={() => setShowRecent(false)}>全部 <small>{session.rows.length}</small></Button>
        <Button type="button" aria-pressed={showRecent} onClick={() => setShowRecent(true)}>最近</Button>
      </div>
      <AppSelect<typeof scope> label="记录关联筛选" value={scope} onValueChange={setScope} options={[{value:'all',label:'所有记录'},{value:'linked',label:'已加入关系画布'},{value:'unlinked',label:'未加入关系画布'}]} />
      <div className="xigra-record-scroll">
        {pinned.length > 0 && <section className="xigra-record-pins" aria-label="置顶">
          <h3><Pin size={13} aria-hidden="true" />置顶</h3>
          <RecordList rows={pinned} {...rowActions} />
        </section>}
        {rows.length > 0 && <RecordList rows={rows} {...rowActions} />}
        {!pinned.length && !rows.length && <p className="xigra-empty">{query.trim() || scope !== 'all' ? "没有符合条件的便签。" : showRecent ? "还没有最近记录。" : "暂无便签。"}</p>}
      </div>
    </aside>
    <div className="xigra-record-paper"
      onDragOver={event => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = importing ? "none" : "copy";
      }}
      onDrop={event => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        const dropped = Array.from(event.dataTransfer.files);
        if (dropped.length) void importFiles(() => files.drop(dropped));
      }}
      onPasteCapture={event => {
        if (!event.clipboardData.files.length) return;
        event.preventDefault();
        void importFiles(async () => (await files.paste()).results || [], "粘贴");
      }}>
      <div className="xigra-note-heading">
        <div className="record-document-heading">
          <Button className="record-layout-toggle" iconOnly aria-controls="record-library" aria-expanded={libraryVisible} aria-label={libraryAction}
            onMouseDown={event => event.preventDefault()} onClick={() => {
              setLibraryOpen(!libraryVisible);
              if (!libraryOverlay || quick) setQuick(libraryVisible);
            }}>
            <LibraryIcon aria-hidden="true" />
          </Button>
          {active && <HelpPopover topic="records" />}
        </div>
        <div className="xigra-note-actions">
          <NewNoteButton primary disabled={createDisabled} onClick={() => {
            if (libraryOverlay) setLibraryOpen(false);
            onCreate();
          }} />
          <Button iconOnly aria-label="复制正文" disabled={!record || session.composing} onClick={() => record && copy(record.text)}><Copy aria-hidden="true" /></Button>
          <Menu.Root modal={false}>
            <Menu.Trigger render={<Button iconOnly tooltip="更多操作" />} aria-label="管理当前便笺" disabled={!record || session.composing}><Ellipsis aria-hidden="true" /></Menu.Trigger>
            {record && <Menu.Portal>
              <Menu.Positioner className="xigra-record-menu-position" align="end" sideOffset={6}>
                <Menu.Popup className="xigra-record-menu">
                  <Menu.Item disabled={savingPin || importing} onClick={() => void togglePin(record.id)}><PinAction size={16} aria-hidden="true" />{isPinned ? "取消置顶" : "置顶便笺"}</Menu.Item>
                  <Menu.Item className="xigra-record-menu-delete" disabled={importing} onClick={() => confirmDelete(record.id)}><Trash2 size={16} aria-hidden="true" />删除便笺</Menu.Item>
                  {sendNote && client.view()[record.id]?.value?.type === "text" && <Menu.Item onClick={() => sendNote(record.id, record.title?.trim() || recordTitle(record.text))}>发送到局域网设备</Menu.Item>}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>}
          </Menu.Root>
        </div>
      </div>
      <input className="record-editor-title" aria-label="便签标题" placeholder="标题（可选）" maxLength={200}
        disabled={!client.ready} value={titleComposition ?? session.title}
        onChange={event => {
          if (titleComposition !== null) setTitleComposition(event.currentTarget.value);
          else session.rename(event.currentTarget.value);
        }}
        onCompositionStart={event => setTitleComposition(event.currentTarget.value)}
        onCompositionEnd={event => { setTitleComposition(null); session.rename(event.currentTarget.value); }}
        onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); session.focus(); } }} />
      <RecordEditor session={session} className="xigra-record-editor" focusContext={String(active)} />
      {deletion && <div className="xigra-record-undo">
        <span role="status" title={recordTitle(deletion.text)}>{deletion.confirmed ? "已删除" : "删除待确认"}「{recordTitle(deletion.text)}」</span>
        <Button className="button" type="button" disabled={!deletion.confirmed || session.composing} onClick={session.restoreDeleted}>恢复为新便签</Button>
        <Button className="icon-button" type="button" aria-label="关闭恢复提示" title="关闭恢复提示" onClick={session.dismissDeletion}><X size={15} aria-hidden="true" /></Button>
      </div>}
      <NoteStatusBar client={client} recordId={session.id} empty={!record} volatile={session.volatile} count={session.text.length} progress={importProgress}>
        <Button className="record-destination" disabled={!record || session.composing || titleComposition !== null || session.volatile}
          onClick={() => record && onFreePage(record.id)}>{onFreeCanvas ? "查看工作页" : "加入工作页"}</Button>
        {onCanvas && <Button className="record-destination" disabled={!record || session.composing || titleComposition !== null || session.volatile}
          onClick={() => record && onCanvas(record.id)}>{record && linked.has(record.id) ? "查看关系画布" : "加入关系画布"}</Button>}
        <Popover.Root open={attachmentsOpen} onOpenChange={open => { if (open) dismiss(); setAttachmentsOpen(open); }}>
          <Popover.Trigger render={<Button />} disabled={!client.ready || importing || session.composing} aria-label={`${recordFileLinks(client, session.id).length} 个附件`}><Paperclip size={16}/>{recordFileLinks(client, session.id).length} 个附件</Popover.Trigger>
          <Popover.Portal><Popover.Positioner className="attachment-position" side="top" align="end" sideOffset={10} collisionPadding={{top:60,bottom:12,left:12,right:12}}><Popover.Popup className="attachment-popover record-attachment-popover">
            <header><Popover.Title>当前便签附件</Popover.Title><Popover.Close render={<Button iconOnly tooltip="关闭附件" />} aria-label="关闭附件"><X size={18}/></Popover.Close></header>
            {recordFileLinks(client, session.id).length ? <RecordAttachments client={client} recordId={session.id} active={attachmentsOpen} notify={notify} onSend={onSendFiles}/> : <p>当前便签还没有附件。</p>}
            <footer className="attachment-actions">
              <Button onClick={() => { setAttachmentsOpen(false); void importFiles(() => files.choose()); }}><Upload size={15}/>本地导入</Button>
              <Button onClick={() => { setAttachmentsOpen(false); onFiles(); }}>文件中心引用</Button>
              <Button onClick={() => { setAttachmentsOpen(false); onFileCenter(); }}><FolderOpen size={15}/>查看文件中心</Button>
            </footer>
          </Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root>
      </NoteStatusBar>
    </div>
  </section>;
}
