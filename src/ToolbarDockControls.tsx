import { GripVertical, Pin, PinOff } from 'lucide-react';
import { ControlTooltip } from './ControlTooltip';
import type { useToolbarDock } from './useToolbarDock';

export function ToolbarDockControls({ dock }: { dock: ReturnType<typeof useToolbarDock> }) {
  const fixed = dock.mode === 'fixed';
  const toggleLabel = fixed ? '解锁工具板' : '固定工具板';
  return <div className="toolbar-dock-controls">
    <ControlTooltip label={dock.allowed ? '拖动工具板 · 双击恢复左上角 · 方向键微调' : '小窗口自动固定在左侧'}>
      <button type="button" className="toolbar-drag-handle" aria-label="拖动工具板" aria-disabled={fixed} onDoubleClick={dock.reset} {...dock.handle}>
        <GripVertical size={18} aria-hidden="true"/>
      </button>
    </ControlTooltip>
    <ControlTooltip label={dock.allowed ? toggleLabel : '小窗口自动固定停靠'}>
      <button type="button" className="toolbar-dock-toggle" aria-label={toggleLabel} disabled={!dock.allowed} aria-pressed={fixed} onClick={dock.toggle}>
        {fixed ? <PinOff size={18} aria-hidden="true"/> : <Pin size={18} aria-hidden="true"/>}
      </button>
    </ControlTooltip>
  </div>;
}
