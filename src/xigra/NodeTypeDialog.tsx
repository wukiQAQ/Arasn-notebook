import { Dialog } from "@base-ui/react/dialog";
import { Bookmark, CalendarDays, CircleHelp, File, Folder, Lightbulb, ListTodo, StickyNote, Target } from "lucide-react";
import { useState } from "react";
import { uid } from "../board";
import { Button } from "../Button";
import type { CustomNodeType } from "../topology";

export const TYPE_ICONS: Record<string, { label: string; glyph: typeof StickyNote }> = {
  note: { label: "便签", glyph: StickyNote }, question: { label: "问题", glyph: CircleHelp },
  idea: { label: "灵感", glyph: Lightbulb }, task: { label: "清单", glyph: ListTodo },
  file: { label: "文件", glyph: File }, folder: { label: "文件夹", glyph: Folder },
  target: { label: "目标", glyph: Target }, bookmark: { label: "书签", glyph: Bookmark },
  calendar: { label: "日历", glyph: CalendarDays },
};

const COLORS = ["#556bd2", "#a94d84", "#9a6418", "#268468", "#087888", "#686b78"];
const empty = { id: "", name: "", icon: "note", color: COLORS[0], description: "" };

export function NodeTypeDialog({ create, types, builtins, usage, onClose, onChange, onDelete }: {
  create: boolean;
  types: CustomNodeType[];
  builtins: { value: string; label: string }[];
  usage(id: string): number;
  onClose(): void;
  onChange(next: CustomNodeType[]): void;
  onDelete(id: string, target: string): void;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState<CustomNodeType>(create ? empty : types[0] ?? empty);
  const [target, setTarget] = useState<string>();
  const index = types.findIndex(type => type.id === draft.id);
  const count = index < 0 ? 0 : usage(draft.id);
  const name = draft.name.trim();
  const valid = !!name && /^#[a-f0-9]{6}$/i.test(draft.color) && (index >= 0 || types.length < 100) &&
    !types.some(type => type.id !== draft.id && type.name.toLowerCase() === name.toLowerCase()) &&
    !builtins.some(type => type.label === name) && name !== "文件";
  function reorder(step: number) {
    const next = [...types];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    onChange(next);
  }
  const Glyph = TYPE_ICONS[draft.icon].glyph;
  return <Dialog.Root open={open} onOpenChange={setOpen} onOpenChangeComplete={next => { if (!next) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/>
      <Dialog.Popup className="modal xigra-record-dialog correctness-dialog topology-type-dialog" onKeyDown={event => {
        if (event.key !== "Escape") event.stopPropagation();
      }}>
        <Dialog.Title>{create ? "新建自定义类型" : "管理自定义类型"}</Dialog.Title>
        {!create && <div className="topology-type-order">
          <select className="topology-select" aria-label="要管理的类型" value={draft.id} onChange={event => {
            setDraft(types.find(type => type.id === event.target.value) ?? empty); setTarget(undefined);
          }}>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}</select>
          <Button disabled={target !== undefined || index <= 0} onClick={() => reorder(-1)}>上移</Button>
          <Button disabled={target !== undefined || index < 0 || index >= types.length - 1} onClick={() => reorder(1)}>下移</Button>
        </div>}
        {target !== undefined ? <div className="topology-type-fields">
          <p>“{types[index]?.name}”用于 {count} 个节点。删除类型后，节点正文和关系会保留。</p>
          {count > 0 && <label>将节点迁移到
            <select className="topology-select" aria-label="将节点迁移到" value={target} onChange={event => setTarget(event.target.value)}>
              {builtins.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}
              {types.filter(type => type.id !== draft.id).map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
            </select>
          </label>}
          <div className="dialog-actions"><Button onClick={() => setTarget(undefined)}>返回</Button>
            <Button variant="danger" onClick={() => { onDelete(draft.id, target); setOpen(false); }}>确认删除类型</Button></div>
        </div> : <form className="topology-type-fields" onSubmit={event => {
          event.preventDefault();
          if (!valid) return;
          const saved = { ...draft, id: draft.id || uid(), name, description: draft.description?.trim() ?? "" };
          onChange(index < 0 ? [...types, saved] : types.map(type => type.id === saved.id ? saved : type));
          setOpen(false);
        }}>
          <label>类型名称<input className="topology-select" value={draft.name} maxLength={40} required
            onChange={event => setDraft({ ...draft, name: event.target.value })}/></label>
          <label>图标<span className="topology-type-icon">
            <Glyph size={18} aria-hidden="true"/>
            <select className="topology-select" aria-label="图标" value={draft.icon} onChange={event => setDraft({ ...draft, icon: event.target.value })}>
              {Object.entries(TYPE_ICONS).map(([id, icon]) => <option key={id} value={id}>{icon.label}</option>)}
            </select>
          </span></label>
          <div className="topology-type-colors" role="group" aria-label="类型颜色">
            <span>颜色</span>
            {COLORS.map(color => <button type="button" key={color} aria-label={color} aria-pressed={draft.color === color}
              style={{ backgroundColor: color }} onClick={() => setDraft({ ...draft, color })}/>)}
            <input type="color" aria-label="自定义类型颜色" value={draft.color} onChange={event => setDraft({ ...draft, color: event.target.value })}/>
          </div>
          <label>描述（可选）<textarea className="topology-select" rows={2} value={draft.description ?? ""} maxLength={160}
            onChange={event => setDraft({ ...draft, description: event.target.value })}/></label>
          {name && !valid && <small role="status">{types.length >= 100 && index < 0 ? "最多可创建 100 个自定义类型" : "请使用未被占用的类型名称"}</small>}
          <div className="dialog-actions">
            {!create && index >= 0 && <Button variant="danger" onClick={() => setTarget("note")}>删除类型…</Button>}
            <Dialog.Close render={<Button />}>取消</Dialog.Close>
            <Button type="submit" variant="primary" disabled={!valid}>保存类型</Button>
          </div>
        </form>}
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
