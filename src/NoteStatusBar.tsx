import type { ReactNode } from 'react';
import type { BoardClient } from './board';
import { SaveStatus } from './xigra/visuals';

export function NoteStatusBar({ client, recordId, empty, volatile, count, className = '', children, progress }: {
  client: BoardClient; recordId: string; empty: boolean; volatile: boolean; count: number;
  className?: string; children?: ReactNode; progress?: ReactNode;
}) {
  return <footer className={`note-status-bar ${className}`} aria-label="便签状态与附件">
    <div className="note-state-copy quick-state-group" title={`${count.toLocaleString()} / 10,000 字符`}>
      <SaveStatus client={client} recordId={recordId} empty={empty} volatile={volatile}/>
      <span className="note-word-count quick-input-state">{count.toLocaleString()}<span className="note-count-limit"> / 10,000</span> 字符</span>
    </div>
    <div className="note-status-actions">{children}</div>
    {progress && <span className="note-status-progress" role="status">{progress}</span>}
  </footer>;
}
