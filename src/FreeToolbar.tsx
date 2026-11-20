import { Button } from "./Button";
import { MousePointer2, Hand, Pencil, Eraser, Type, Shapes, Undo2, Redo2, Paperclip, Trash2, MoreHorizontal, Download } from 'lucide-react';
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Popover } from '@base-ui/react/popover';
import { ControlTooltip } from './ControlTooltip';
import type { ToolbarMode } from './useAdaptiveLayout';
import type { Shape } from './drawing';

export type FreeTool = 'select' | 'hand' | 'pen' | 'erase' | 'text';
const tools = [
  { id: 'select', label: '选择与拖动', text: '选择', hint: '选择对象并移动、调整；拖动空白平移视口；Shift 拖动框选', icon: MousePointer2 },
  { id: 'hand', label: '移动画布', text: '平移', hint: '拖动整个视口；不修改对象位置', icon: Hand },
  { id: 'pen', label: '自由绘图', text: '画笔', hint: '按住拖动绘制笔迹', icon: Pencil },
  { id: 'erase', label: '橡皮擦', text: '橡皮擦', hint: '再次点击橡皮擦可设置整条或局部擦除；保护便签与附件', icon: Eraser },
  { id: 'text', label: '添加文字', text: '文字', hint: '在空白处创建便签，或编辑已有便签', icon: Type },
] as const;

export const freeToolHint = (tool: FreeTool) => tools.find(item => item.id === tool)!.hint;

export function FreeToolbar({ createAction, mode = 'full', tool, shape, choose, shapes, properties, toggleProperties, closeProperties, settings, undo, redo, canUndo, canRedo, remove, canRemove, attach, importing, exportCanvas, dockControls }: {
  createAction: ReactNode;
  mode?: ToolbarMode; tool: FreeTool; shape: Shape; choose(tool: FreeTool): void; shapes(): void; properties: boolean;
  toggleProperties(): void; closeProperties(): void; settings: ReactNode; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  remove(): void; canRemove: boolean; attach?: () => void; importing: boolean; exportCanvas(): void;
  dockControls?: ReactNode;
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    if (!properties) return;
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing || [...document.querySelectorAll('.app-select-popup')].some(e => e.checkVisibility())) return;
      event.preventDefault(); event.stopPropagation(); closeProperties();
    };
    document.addEventListener('keydown', escape, true);
    return () => document.removeEventListener('keydown', escape, true);
  }, [properties, closeProperties]);
  useEffect(() => { if (mode !== 'minimal') setMoreOpen(false); }, [mode]);
  const action = (run: () => void) => () => { run(); setMoreOpen(false); };
  const tip = (button: ReactElement, label: string) => <ControlTooltip label={label}>{button}</ControlTooltip>;
  const parameterTool = (button: ReactElement, active: boolean, label: string) => <>
    <ControlTooltip label={`${label} · 再次点击设置`}><Popover.Trigger render={button} /></ControlTooltip>
  </>;
  const toolButton = (item: typeof tools[number]) => {
    const active = tool === item.id && (item.id !== 'pen' || shape === 'free');
    const Glyph = item.icon;
    return <div key={item.id} className="tool-anchor">{parameterTool(<Button className={`tool ${active ? 'selected' : ''}`} aria-label={item.label} aria-pressed={active} onClick={() => active ? toggleProperties() : choose(item.id)}><Glyph size={18} aria-hidden="true" /><span>{item.text}</span></Button>, active, item.text)}</div>;
  };
  const shapeActive = tool === 'pen' && shape !== 'free';
  const shapeButton = parameterTool(<Button className={`tool ${shapeActive ? 'selected' : ''}`} aria-label="图形工具" aria-pressed={shapeActive} onClick={() => shapeActive ? toggleProperties() : shapes()}><Shapes size={18}/><span>图形</span></Button>, shapeActive, '图形');
  const attachButton = attach && tip(<Button className="tool" aria-label="添加图片或附件" disabled={importing} onClick={action(attach)}><Paperclip size={18}/><span>附件</span></Button>, importing ? '附件 · 正在导入' : '附件');
  const exportButton = tip(<Button className="tool" aria-label="截图 / 导出" onClick={action(exportCanvas)}><Download size={18}/><span>截图</span></Button>, '截图 / 导出');
  const undoButton = tip(<Button className="tool" aria-label="撤销上次操作" aria-keyshortcuts="Control+Z" disabled={!canUndo} onClick={action(undo)}><Undo2 size={18}/><span>撤销</span></Button>, '撤销 · Ctrl+Z');
  const redoButton = tip(<Button className="tool" aria-label="重做上次操作" aria-keyshortcuts="Control+Shift+Z" disabled={!canRedo} onClick={action(redo)}><Redo2 size={18}/><span>重做</span></Button>, '重做 · Ctrl+Shift+Z');
  const deleteButton = tip(<Button className="tool free-delete" aria-label="删除选中对象" disabled={!canRemove} onClick={action(remove)}><Trash2 size={18}/><span>删除</span></Button>, canRemove ? '删除 · Delete' : '请先选中对象');
  const extras = <>{attachButton}{exportButton}{undoButton}{redoButton}{deleteButton}</>;
  const secondaryActive = tool === 'pen' && shape !== 'free';
  return <Popover.Root open={properties} onOpenChange={open => { if (!open) closeProperties(); }}><div className="free-tool-rail" data-mode={mode}>
    {dockControls}
    {createAction}
    {tools.slice(0,1).map(toolButton)}
    {tools.slice(2).map(toolButton)}
    {shapeButton}
    {mode === 'minimal' ? <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
      <ControlTooltip label={secondaryActive ? '图形 · 更多工具' : '更多工具'}><Popover.Trigger render={<Button />} className={`tool free-more ${secondaryActive ? 'selected' : ''}`} aria-label={secondaryActive ? '更多工具，当前使用图形' : '更多工具'}>{secondaryActive ? <Shapes size={18}/> : <MoreHorizontal size={18}/>}<span>更多</span></Popover.Trigger></ControlTooltip>
      <Popover.Portal><Popover.Positioner className="free-more-position" side="right" sideOffset={8} collisionPadding={8}>
        <Popover.Popup className="free-more-popup"><Popover.Title>更多工具</Popover.Title>{extras}</Popover.Popup>
      </Popover.Positioner></Popover.Portal>
    </Popover.Root> : extras}
  </div><Popover.Portal><Popover.Positioner className="tool-settings-position" side="right" align="start" sideOffset={10} collisionPadding={12}>
      <Popover.Popup className="tool-settings-popup" aria-label="画布工具设置"><Popover.Title className="sr-only">画布工具设置</Popover.Title>{settings}</Popover.Popup>
    </Popover.Positioner></Popover.Portal></Popover.Root>;
}
