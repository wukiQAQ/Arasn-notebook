import { RecordAttachments } from "../../FilePicker";
import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Pin, PinOff } from "lucide-react";
import { Copy, Trash2, X } from "../../LagoonIcons";
import type { BoardClient } from "../../board";
import { SaveStatus } from "../visuals";
import { RecordEditor } from "./RecordEditor";
import { RecordList, recordTitle } from "./RecordList";
import { filterRecords, RecordSearch } from "./RecordSearch";
import type { RecordSession } from "./session";
import { AppSelect } from "../AppSelect";
import { FileText, FolderOpen } from "lucide-react";

export function RecordWorkspace({ active, session, client, query, setQuery, confirmDelete, copy, notify, sendNote, onCanvas, onFiles }: {
  active: boolean;
  session: RecordSession; client: BoardClient; query: string; setQuery(value: string): void; confirmDelete(id: string): void;
  copy(text: string): void; notify(message: string): void;
  sendNote?(id: string, title: string): void;
  onCanvas?(id: string): void;
  onFiles?(): void;
}) {
  const [showRecent, setShowRecent] = useState(false);
  const [pane, setPane] = useState<'list' | 'editor'>('list');
  useEffect(() => {
    if (session.focusVersion > 0) setPane('editor');
  }, [session.focusVersion]);
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
  const rowActions = { current: session.id, disabled: session.composing || session.volatile, onSelect: (id: string) => { session.open(id); setPane('editor'); } };
  const record = session.record;
  const isPinned = client.pinnedRecords.includes(session.id);
  const PinAction = isPinned ? PinOff : Pin;
  const deletion = session.deletion;

  async function togglePin(id: string) {
    setSavingPin(true);
    const saved = await client.toggleRecordPin(id);
    setSavingPin(false);
    if (!saved) notify("置顶设置未保存，请重试。");
  }

  return <section id={active ? "workspace" : undefined} className="xigra-record-workspace xigra-workspace-view" data-pane={pane} hidden={!active} aria-label="便签工作区" tabIndex={-1}>
    <div className="record-pane-switch" role="group" aria-label="便签布局">
      <button type="button" aria-pressed={pane === 'list'} onClick={() => setPane('list')}>便签列表</button>
      <button type="button" aria-pressed={pane === 'editor'} onClick={() => setPane('editor')}>便签正文</button>
    </div>
    <aside className="xigra-record-index" aria-label="记录列表">
      <div className="record-index-heading"><h2>便签库</h2><span>{session.rows.length} 条记录</span></div>
      <RecordSearch query={query} setQuery={setQuery} />
      <div className="xigra-record-filters" aria-label="列表范围">
        <button type="button" aria-pressed={!showRecent} onClick={() => setShowRecent(false)}>全部 <small>{session.rows.length}</small></button>
        <button type="button" aria-pressed={showRecent} onClick={() => setShowRecent(true)}>最近</button>
      </div>
      <AppSelect<typeof scope> label="记录关联筛选" value={scope} onValueChange={setScope} options={[{value:'all',label:'所有记录'},{value:'linked',label:'已加入关系画布'},{value:'unlinked',label:'未加入关系画布'}]} />
      <div className="xigra-record-scroll">
        {pinned.length > 0 && <section className="xigra-record-pins" aria-label="置顶">
          <h3><Pin size={13} aria-hidden="true" />置顶</h3>
          <RecordList rows={pinned} {...rowActions} />
        </section>}
        {rows.length > 0 && <RecordList rows={rows} {...rowActions} />}
        {!pinned.length && !rows.length && <p className="xigra-empty">{query.trim() || scope !== 'all' ? "没有符合条件的便签。" : showRecent ? "还没有最近记录。" : "写下第一张便笺，记录就会出现在这里。"}</p>}
      </div>
    </aside>
    <div className="xigra-record-paper">
      <div className="xigra-note-heading">
        <div className="record-document-heading"><FileText size={19} aria-hidden="true" /><div><h2>便签正文</h2><span>{record ? '完整记录' : '新草稿'}</span></div></div>
        {record && <div className="xigra-note-actions">
          {onFiles && <button className="button record-files" type="button" onClick={onFiles} title="为当前便签选择附件"><FolderOpen size={15} aria-hidden="true" />添加文件</button>}
          {onCanvas && <button className="button record-canvas" disabled={session.composing || session.volatile} onClick={() => onCanvas(record.id)}>{linked.has(record.id) ? '查看关系画布' : '添加到关系画布'}</button>}
          <button className="icon-button" type="button" aria-label="复制正文" title="复制正文" disabled={session.composing} onClick={() => copy(record.text)}><Copy size={17} aria-hidden="true" /></button>
          <Menu.Root modal={false}>
            <Menu.Trigger className="icon-button" aria-label="管理当前便笺" title="管理当前便笺" disabled={session.composing}><Ellipsis size={19} aria-hidden="true" /></Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="xigra-record-menu-position" align="end" sideOffset={6}>
                <Menu.Popup className="xigra-record-menu">
                  {onFiles && <Menu.Item className="record-compact-action" onClick={onFiles}><FolderOpen size={16} />添加文件</Menu.Item>}
                  {onCanvas && <Menu.Item className="record-compact-action" disabled={session.composing || session.volatile} onClick={() => onCanvas(record.id)}>{linked.has(record.id) ? '查看关系画布' : '添加到关系画布'}</Menu.Item>}
                  <Menu.Item disabled={savingPin} onClick={() => void togglePin(record.id)}><PinAction size={16} aria-hidden="true" />{isPinned ? "取消置顶" : "置顶便笺"}</Menu.Item>
                  <Menu.Item className="xigra-record-menu-delete" onClick={() => confirmDelete(record.id)}><Trash2 size={16} aria-hidden="true" />删除便笺</Menu.Item>
                  {sendNote && client.view()[record.id]?.value?.type === "text" && <Menu.Item onClick={() => sendNote(record.id, recordTitle(record.text))}>发送到局域网设备</Menu.Item>}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>}
      </div>
      <RecordEditor session={session} className="xigra-record-editor" focusContext={`${active}:${pane}`} />
      {record && <RecordAttachments client={client} recordId={record.id} active={active} notify={notify}/>}
      {deletion && <div className="xigra-record-undo">
        <span role="status" title={recordTitle(deletion.text)}>{deletion.confirmed ? "已删除" : "删除待确认"}「{recordTitle(deletion.text)}」</span>
        <button className="button" type="button" disabled={!deletion.confirmed || session.composing} onClick={session.restoreDeleted}>恢复为新便签</button>
        <button className="icon-button" type="button" aria-label="关闭恢复提示" title="关闭恢复提示" onClick={session.dismissDeletion}><X size={15} aria-hidden="true" /></button>
      </div>}
      <footer><SaveStatus client={client} recordId={session.id} empty={!record} volatile={session.volatile} /><span>{session.text.length.toLocaleString()} / 10,000 字符</span></footer>
    </div>
  </section>;
}
