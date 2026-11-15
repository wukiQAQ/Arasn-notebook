import { MousePointer2, Hand, Pencil, Eraser, Type, Shapes, Undo2, Redo2, Paperclip, Trash2, Settings2 } from 'lucide-react';
import type { Shape } from './drawing';

export type FreeTool = 'select' | 'hand' | 'pen' | 'erase' | 'text';
const tools = [
  { id: 'select', label: '选择与拖动', text: '选择', hint: '选择对象并移动、调整；拖动空白平移视口；Shift 拖动框选', icon: MousePointer2 },
  { id: 'hand', label: '移动画布', text: '平移', hint: '拖动整个视口；不修改对象位置', icon: Hand },
  { id: 'pen', label: '自由绘图', text: '画笔', hint: '按住拖动绘制笔迹', icon: Pencil },
  { id: 'erase', label: '橡皮擦', text: '橡皮擦', hint: '支持整条或局部擦除；在属性中切换，保护便签与附件', icon: Eraser },
  { id: 'text', label: '添加文字', text: '文字', hint: '在空白处创建便签，或编辑已有便签', icon: Type },
] as const;

export const freeToolHint = (tool: FreeTool) => tools.find(item => item.id === tool)!.hint;

export function FreeToolbar({ tool, shape, choose, shapes, properties, openProperties, closeProperties, undo, redo, canUndo, canRedo, remove, canRemove, attach, importing }: {
  tool: FreeTool; shape: Shape; choose(tool: FreeTool): void; shapes(): void; properties: boolean;
  openProperties(): void; closeProperties(): void; undo(): void; redo(): void; canUndo: boolean; canRedo: boolean;
  remove(): void; canRemove: boolean; attach?: () => void; importing: boolean;
}) {
  const toolButton = (item: typeof tools[number]) => {
    const active = tool === item.id && (item.id !== 'pen' || shape === 'free');
    const Glyph = item.icon;
    return <button key={item.id} className={`tool ${active ? 'selected' : ''}`} aria-label={item.label} title={`${item.text}：${item.hint}`} aria-pressed={active} onClick={() => choose(item.id)}><Glyph size={18} aria-hidden="true" /><span>{item.text}</span></button>;
  };
  return <div className="free-tool-rail">
    <div className="free-tool-section" role="group" aria-label="导航工具"><span className="free-tool-label">导航</span>{tools.slice(0,1).map(toolButton)}</div>
    <div className="free-tool-section" role="group" aria-label="创作工具"><span className="free-tool-label">创作</span>{tools.slice(2).map(toolButton)}
      <button className={`tool ${tool === 'pen' && shape !== 'free' ? 'selected' : ''}`} aria-label="图形工具" title="图形：直线、矩形、椭圆、箭头" aria-pressed={tool === 'pen' && shape !== 'free'} onClick={shapes}><Shapes size={18} aria-hidden="true" /><span>图形</span></button>
      {attach && <button className="tool" aria-label="添加图片或附件" title="导入图片或本机附件" disabled={importing} onClick={attach}><Paperclip size={18} aria-hidden="true" /><span>附件</span></button>}
    </div>
    <div className="free-tool-section" role="group" aria-label="历史操作"><span className="free-tool-label">历史</span><div className="free-history-row">
      <button className="tool" aria-label="撤销上次操作" title={canUndo ? '撤销 · Ctrl+Z' : '暂无可撤销的操作'} disabled={!canUndo} onClick={undo}><Undo2 size={18} aria-hidden="true" /></button>
      <button className="tool" aria-label="重做上次操作" title={canRedo ? '重做 · Ctrl+Shift+Z' : '暂无可重做的操作'} disabled={!canRedo} onClick={redo}><Redo2 size={18} aria-hidden="true" /></button>
    </div></div>
    <div className="free-tool-section" role="group" aria-label="工具与对象操作">
      <button className={`tool ${properties ? 'selected' : ''}`} aria-label="工具属性" title={tool === 'erase' ? '选择擦除模式与范围' : '当前工具与对象属性'} aria-expanded={properties} onClick={properties ? closeProperties : openProperties}><Settings2 size={18} aria-hidden="true" /><span>{tool === 'erase' ? '范围' : '属性'}</span></button>
      <button className="tool free-delete" aria-label="删除选中对象" title={canRemove ? '删除选中对象 · Delete；可撤销' : '使用选择工具，先选中一个对象'} disabled={!canRemove} onClick={remove}><Trash2 size={17} aria-hidden="true" /><span>删除</span></button>
    </div>
  </div>;
}
