import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, PanelLeft, ListCollapse, PanelBottomClose, Search, Command, Share2, MoreHorizontal } from 'lucide-react';
import { Popover } from '@base-ui/react/popover';
import { Button } from './Button';
import { ControlTooltip } from './ControlTooltip';
export function usePageHistory<T extends string>(initial: T) {
  const [state, setState] = useState({ pages: [initial], index: 0 });
  const navigate = (page: T) => setState(s => s.pages[s.index] === page ? s : { pages: [...s.pages.slice(0, s.index + 1), page], index: s.index + 1 });
  return [state.pages[state.index], navigate, {
    canBack: state.index > 0, canForward: state.index < state.pages.length - 1,
    back: () => setState(s => ({ ...s, index: Math.max(0, s.index - 1) })),
    forward: () => setState(s => ({ ...s, index: Math.min(s.pages.length - 1, s.index + 1) })),
  }] as const;
}
function TopBarActions({ search, commands, share }: {
  search(): void; commands(): void; share(): void;
}) {
  return <div className="window-navigation-actions" role="group" aria-label="全局操作">
    <ControlTooltip label="搜索便签" side="bottom" toolbar><Button iconOnly tooltip="" aria-label="全局搜索" onClick={search}><Search size={18}/></Button></ControlTooltip>
    <ControlTooltip label="快捷操作 · Ctrl+K" side="bottom" toolbar><Button iconOnly tooltip="" aria-label="全局快捷操作" onClick={commands}><Command size={18}/></Button></ControlTooltip>
    <ControlTooltip label="共享与设备" side="bottom" toolbar><Button iconOnly tooltip="" aria-label="全局共享" onClick={share}><Share2 size={18}/></Button></ControlTooltip>
  </div>;
}
export function WindowNavigationBar({ title, disabled, sidebar, sidebarMode, toggleCompact, hide, back, forward, canBack, canForward, search, commands, share, context, inboxAction }: {
  title: string; disabled: boolean; sidebar(): void; back(): void; forward(): void; canBack: boolean; canForward: boolean; search(): void; commands(): void; share(): void;
  sidebarMode: 'full' | 'compact' | 'hidden';
  toggleCompact(): void;
  hide(): void;
  context?: ReactNode;
  inboxAction?: ReactNode;
}) {
  const [width, setWidth] = useState(innerWidth);
  useEffect(() => {
    const update = () => setWidth(innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const wide = width >= 1280;
  const compactNavigation = width < 600;
  const compact = sidebarMode === 'compact';
  const sidebarVisible = sidebarMode !== 'hidden';
  const compactLabel = compact ? "展开导航" : "紧凑导航";
  const historyActions = <>
    <ControlTooltip label="返回上一页" side="bottom"><Button iconOnly tooltip="" aria-label="返回上一页" disabled={disabled || !canBack} onClick={back}><ArrowLeft size={18}/></Button></ControlTooltip>
    <ControlTooltip label="前进到下一页" side="bottom"><Button iconOnly tooltip="" aria-label="前进到下一页" disabled={disabled || !canForward} onClick={forward}><ArrowRight size={18}/></Button></ControlTooltip>
  </>;
  const sidebarActions = <>
        <ControlTooltip label="展开或收起侧边栏" side="bottom">
          <Button iconOnly tooltip="" aria-label="展开或收起侧边栏" aria-expanded={sidebarVisible} aria-controls="workbench-sidebar" disabled={disabled} onClick={sidebar}><PanelLeft size={18}/></Button>
        </ControlTooltip>
        <ControlTooltip label={compactLabel} side="bottom">
          <Button iconOnly tooltip="" aria-label={compactLabel} aria-pressed={compact} aria-controls="workbench-sidebar" disabled={disabled || !sidebarVisible} onClick={toggleCompact}><ListCollapse size={18}/></Button>
        </ControlTooltip>
  </>;
  return <header className="window-navigation" aria-label="窗口导航栏">
    <div className="window-navigation-controls" role="group" aria-label="导航与窗口">
      {!compactNavigation && sidebarActions}
      {<ControlTooltip label="隐藏到托盘" side="bottom">
        <Button iconOnly tooltip="" data-hide-panel aria-label="隐藏到托盘" disabled={disabled} onClick={hide}><PanelBottomClose size={18}/></Button>
      </ControlTooltip>}
      {!compactNavigation && historyActions}
    </div>
    <h1 className="window-page-title"><span>{title}</span></h1>
    {inboxAction}
    {(wide ? <div className="window-context-actions">{context}</div> : <Popover.Root>
      <Popover.Trigger render={<Button iconOnly tooltip="页面操作" />} aria-label="页面操作"><MoreHorizontal size={18}/></Popover.Trigger>
      <Popover.Portal><Popover.Positioner className="window-actions-position" side="bottom" align="end" sideOffset={8} collisionPadding={12}>
        <Popover.Popup className="window-actions-popup"><Popover.Title className="sr-only">页面操作</Popover.Title>{context}
          {compactNavigation && <div className="window-overflow-actions">{sidebarActions}{historyActions}</div>}
        </Popover.Popup>
      </Popover.Positioner></Popover.Portal>
    </Popover.Root>)}
    <TopBarActions {...{ search, commands, share }} />
  </header>;
}
