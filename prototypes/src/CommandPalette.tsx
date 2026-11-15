import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Search, CornerDownLeft, Plus, FolderOpen, Focus, Pencil, EyeOff } from 'lucide-react';
import type { Direction } from './model';
export function CommandPalette({ direction, open, setOpen, run }: { direction: Direction; open: boolean; setOpen: (value: boolean) => void; run: (id: string) => void }) {
  const [query, setQuery] = useState(''), [active, setActive] = useState(0);
  const reduced = useReducedMotion(), list = useRef<HTMLDivElement>(null);
  const actions = [{ id: 'new', label: '新建便签', hint: '记录一个想法', icon: Plus }, { id: 'files', label: '打开文件中转站', hint: '预览本会话文件', icon: FolderOpen }, { id: 'draw', label: '切换到画笔', hint: '在画布上绘制', icon: Pencil }, { id: 'focus', label: '查看功能边界', hint: '实际代码核实结果', icon: Focus }, { id: 'hide', label: '模拟收起工作台', hint: '浏览器原型行为', icon: EyeOff }];
  const results = actions.filter(action => `${action.label}${action.hint}`.includes(query));
  useLayoutEffect(() => { setQuery(''); setActive(0); }, [open]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`#prototype-command-${active}`)?.scrollIntoView({ block: 'nearest' }); }, [active]);
  const execute = (index: number) => { const action = results[index]; if (action) { setOpen(false); run(action.id); } };
  return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal>
    <Dialog.Backdrop className={`prototype-backdrop direction-${direction}`} />
    <Dialog.Popup className={`prototype-command direction-${direction}`} render={<motion.div initial={reduced ? false : { opacity: 0, y: 6, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: reduced ? 0 : .16 }} />}>
      <Dialog.Title className="sr-only">原型命令面板</Dialog.Title><Dialog.Description className="sr-only">使用上下方向键选择，回车执行，Escape 关闭。</Dialog.Description>
      <div className="command-search"><Search size={19} /><input aria-label="搜索原型命令" placeholder={direction === 'A' ? '搜索命令，直接行动…' : direction === 'B' ? '下一步，想做什么？' : '捕捉一个动作…'} role="combobox" aria-expanded="true" aria-controls="prototype-command-list" aria-activedescendant={results.length ? `prototype-command-${active}` : undefined} value={query} onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setActive(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % Math.max(results.length, 1)); } if (event.key === 'Enter') { event.preventDefault(); execute(active); } }} /><Dialog.Close>Esc</Dialog.Close></div>
      <div className="command-section">{direction === 'C' ? '把动作变成结果' : '工作台操作'}</div>
      <div role="listbox" id="prototype-command-list" ref={list} aria-label="可执行原型命令" className="command-list"><AnimatePresence>{results.map((action, index) => <button role="option" aria-selected={index === active} id={`prototype-command-${index}`} key={action.id} onPointerMove={() => setActive(index)} onClick={() => execute(index)}>
        {index === active && <motion.span className="command-highlight" initial={false} layout="position" layoutId={`command-selection-${direction}`} transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 650, damping: 45 }} />}
        <action.icon size={18} /><span><strong>{action.label}</strong><small>{action.hint}</small></span><CornerDownLeft className="return-key" size={14} />
      </button>)}</AnimatePresence>{!results.length && <p className="command-no-results">没有找到命令。试试“便签”或“文件”。</p>}</div>
      <footer><span>↑ ↓ 选择</span><span>Enter 执行</span><span>Arasn / {direction}</span></footer>
    </Dialog.Popup>
  </Dialog.Portal></Dialog.Root>;
}
