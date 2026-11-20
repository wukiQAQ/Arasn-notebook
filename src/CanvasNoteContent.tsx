import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Expand, X } from 'lucide-react';
import type { BoardClient, TextValue } from './board';
import { Button, IconButton } from './Button';
import { RecordAttachments } from './FilePicker';

export function CanvasNoteContent({ id, recordId = id, value, client, notify, onChange, autoOpen = false }: { id: string; recordId?: string; value: TextValue; client: BoardClient; notify(message: string): void; onChange(text: string): void; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  const lines = value.text.trim().split('\n');
  const title = value.title?.trim() || lines[0] || '未命名便签';
  const summary = value.title?.trim() && value.title.trim() !== lines[0]?.trim() ? value.text.trim() : lines.slice(1).join('\n').trim();
  const attachments = Object.values(client.view()).filter(item => item.value?.type === 'content-link' && item.value.recordId === recordId && item.value.targetRef.kind === 'file').length;
  return <><div className="canvas-note-preview" onDoubleClick={e => { e.stopPropagation(); setOpen(true); }}>
    <strong className="canvas-note-title">{title}</strong>{summary && <p className="canvas-note-summary">{summary}</p>}
    <div className="canvas-note-preview-footer">{attachments > 0 && <span>{attachments} 个附件</span>}<Button className="note-detail-button" tooltip="查看完整便签" aria-label="查看完整便签" onClick={e => { e.stopPropagation(); setOpen(true); }}><Expand size={14}/>详情</Button></div>
  </div><Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="modal canvas-note-detail" aria-label="完整便签详情" onPointerDown={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Delete' || (e.ctrlKey || e.metaKey) && ['z','y'].includes(e.key.toLowerCase())) e.stopPropagation(); }}>
    <header><div><Dialog.Title>便签详情</Dialog.Title><Dialog.Description>正文与附件 · 修改自动保存</Dialog.Description></div><Dialog.Close render={<IconButton tooltip="关闭便签详情" />} aria-label="关闭便签详情"><X size={18}/></Dialog.Close></header>
    <label>完整正文<textarea id={`note-${id}`} autoFocus aria-label="便签完整正文" value={value.text} maxLength={10000} spellCheck={false} onChange={e => onChange(e.target.value)} style={{ fontSize: value.fontSize || 18, fontWeight: value.bold ? 700 : 400 }}/></label>
    <RecordAttachments client={client} recordId={recordId} active={open} notify={notify}/>
  </Dialog.Popup></Dialog.Portal></Dialog.Root></>;
}
