import { Plus } from 'lucide-react';
import { Button } from './Button';

export function NewNoteButton({ onClick, disabled, primary = false }: { onClick(): void; disabled: boolean; primary?: boolean }) {
  return <Button variant={primary ? "primary" : "secondary"} className="page-new-note" aria-label="写一张便笺" tooltip="新建便签" disabled={disabled} onClick={onClick}>
    <Plus size={18} aria-hidden="true"/><span>新建便签</span>
  </Button>;
}
