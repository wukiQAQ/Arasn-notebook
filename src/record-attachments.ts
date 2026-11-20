import { useEffect } from 'react';
import type { BoardClient, ManagedFile } from './board';

export function fileOriginLabel(file?: ManagedFile) {
  return file?.attachmentOrigin || ({ local: '本地导入', paste: '粘贴', device: '设备互传', unknown: '来源未记录' }[file?.importOrigin || 'unknown']);
}
export function recordFileLinks(client: BoardClient, recordId: string) {
  return Object.values(client.view()).flatMap(item => item.value?.type === 'content-link' && item.value.recordId === recordId && item.value.targetRef.kind === 'file' ? [item.value.targetRef.id] : []);
}
// Attachments are above the editor; Escape must close them before the app's hide shortcut.
export function useAttachmentEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
      if ([...document.querySelectorAll('[role="listbox"]')].some(element => element.getClientRects().length)) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [open, close]);
}
