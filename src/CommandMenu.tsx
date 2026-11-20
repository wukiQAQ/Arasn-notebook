import { useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { GlassSurface } from './GlassSurface';
import { Search, CornerDownLeft, Plus, Pencil, Network, Download, Settings2, FileText } from './LagoonIcons';

function actionIcon(label: string) {
  if (label === '写一张便笺') return Plus;
  if (label === '自由绘图') return Pencil;
  if (label === '局域网共享') return Network;
  if (label === '截图 / 导出') return Download;
  if (label === '设置与快捷键') return Settings2;
  return FileText;
}

export type CommandAction = { label: string; hint: string; run: () => void; disabled?: boolean };
export function CommandMenu({ open, onOpenChange, actions, operationsOnly }: { open: boolean; onOpenChange: (open: boolean) => void; actions: CommandAction[]; operationsOnly: boolean }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = actions.filter(action => !action.disabled && `${action.label} ${action.hint}`.toLowerCase().includes(query.toLowerCase()));
  function execute(index: number) { const item = results[index]; if (item) { onOpenChange(false); setQuery(''); setActive(0); item.run(); } }
  return <Dialog.Root open={open} onOpenChange={value => { onOpenChange(value); setQuery(''); setActive(0); }}>
    <Dialog.Portal><Dialog.Backdrop className="desk-backdrop command-backdrop" />
      <Dialog.Popup className="command-popup" render={<GlassSurface />}>
        <Dialog.Title className="sr-only">搜索与快捷操作</Dialog.Title>
        <Dialog.Description className="sr-only">搜索操作，使用上下方向键选择，回车执行，Escape 关闭。</Dialog.Description>
        <div className="command-input"><Search size={18} /><input aria-label="搜索命令" placeholder={operationsOnly ? "搜索操作…" : "搜索操作或便笺…"} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} role="combobox" aria-expanded="true" aria-controls="command-results" aria-activedescendant={results.length ? `command-${active}` : undefined} onKeyDown={event => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); const next = (active + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1); setActive(next); document.getElementById(`command-${next}`)?.scrollIntoView({ block: 'nearest' }); }
          if (event.key === 'Enter') { event.preventDefault(); execute(active); }
        }} /><Dialog.Close className="command-escape">Esc</Dialog.Close></div>
        <div className="command-results" id="command-results" role="listbox" aria-label="可用操作">
          {results.map((action, index) => {
            const Icon = actionIcon(action.label);
            return <button role="option" aria-selected={active === index} id={`command-${index}`} key={`${action.label}-${index}`} onPointerMove={() => setActive(index)} onClick={() => execute(index)}><span className="command-action"><span className="command-glyph"><Icon size={16} aria-hidden="true" /></span><span>{action.label}</span></span><small>{action.hint}</small><CornerDownLeft className="command-return" size={13} aria-hidden="true" /></button>;
          })}
          {!results.length && <p className="command-empty">没有匹配的操作，试试“文件”或“设置”。</p>}
        </div>
        <footer><span>↑ ↓ 选择</span><span><CornerDownLeft size={12} /> 执行</span></footer>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
