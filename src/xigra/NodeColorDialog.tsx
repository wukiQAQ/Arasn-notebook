import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Button } from '../Button';
import type { SelectOption } from './AppSelect';
const defaultColor = '#6558ee';

export function NodeColorDialog({ initialKind, initialColor, kindOptions, onClose, onSave }: {
  initialKind?: string;
  kindOptions: SelectOption<string>[];
  initialColor?: string;
  onClose(): void;
  onSave(color: string | undefined, kind?: string): void;
}) {
  const [kind, setKind] = useState(initialKind);
  const [color, setColor] = useState(initialColor ?? defaultColor);
  const hex = color.trim();
  const valid = /^#[0-9a-f]{6}$/i.test(hex);
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/>
      <Dialog.Popup className="modal xigra-record-dialog correctness-dialog topology-color-dialog">
        <Dialog.Title>{initialKind ? '新建自定义颜色节点' : '节点颜色'}</Dialog.Title>
        <form onSubmit={event => { event.preventDefault(); if (valid) onSave(hex.toLowerCase(), kind); }}>
          {initialKind && <label>节点类型
            <select className="topology-select" value={kind} onChange={event => setKind(event.target.value)}>
              {kindOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
          <div className="topology-color-fields">
            <input type="color" aria-label="自定义颜色" value={valid ? hex.toLowerCase() : defaultColor} onChange={event => setColor(event.target.value)}/>
            <label>颜色值<input className="topology-select" value={color} spellCheck={false}
              aria-invalid={!valid} placeholder="#6558EE" onChange={event => setColor(event.target.value)}/></label>
          </div>
          <div className="dialog-actions">
            {!initialKind && initialColor && <Button onClick={() => onSave(undefined)}>恢复默认颜色</Button>}
            <Dialog.Close render={<Button />}>取消</Dialog.Close>
            <Button type="submit" variant="primary" disabled={!valid}>{initialKind ? '创建节点' : '保存颜色'}</Button>
          </div>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
