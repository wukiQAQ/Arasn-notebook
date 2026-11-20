import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Palette, Keyboard, PanelsTopLeft, Database } from 'lucide-react';
import { Button } from './Button';

const categories = [
  { id: 'appearance', label: '外观', description: '主题、颜色与字体', icon: Palette },
  { id: 'triggers', label: '快捷键与触发', description: '键盘、鼠标与手势', icon: Keyboard },
  { id: 'preferences', label: '窗口与启动', description: '窗口行为与系统自启', icon: PanelsTopLeft },
  { id: 'backup', label: '数据备份', description: '导出完整工作空间', icon: Database },
] as const;
type Category = typeof categories[number]['id'];
export function SettingsLayout({ children, actions }: { children: Record<Category, ReactNode>; actions: Partial<Record<Category, ReactNode>> }) {
  const [category, setCategory] = useState<Category>('appearance');
  const [detail, setDetail] = useState(false);
  const current = categories.find(item => item.id === category)!;
  const scroll = useRef<HTMLDivElement>(null);
  const positions = useRef<Partial<Record<Category, number>>>({});
  const nav = useRef<HTMLElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const mobile = () => matchMedia('(max-width:760px)').matches;
  useLayoutEffect(() => {
    if (scroll.current) scroll.current.scrollTop = positions.current[category] ?? 0;
  }, [category, detail]);
  return <div className="settings-layout" data-detail={detail || undefined}>
    <nav ref={nav} className="settings-categories" aria-label="设置分类">{categories.map(({ id, label, description, icon: Icon }) => <Button key={id} aria-current={category === id ? 'page' : undefined} onClick={() => {
      if (!mobile() || detail) positions.current[category] = scroll.current?.scrollTop ?? 0;
      setCategory(id); setDetail(true);
      if (mobile()) requestAnimationFrame(() => back.current?.focus());
    }}><Icon size={18} aria-hidden="true"/><span>{label}<small>{description}</small></span></Button>)}</nav>
    <div className="settings-category-content">
      <header className="settings-detail-header">
        <div className="settings-detail-heading">
          <Button ref={back} className="settings-category-back" onClick={() => {
            positions.current[category] = scroll.current?.scrollTop ?? 0;
            setDetail(false);
            requestAnimationFrame(() => nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus());
          }}><ArrowLeft size={18}/>设置分类</Button>
          <h3 id="settings-category-title" className="settings-category-title">{current.label}</h3>
          <p>{current.description}</p>
        </div>
      </header>
      <div ref={scroll} className="settings-detail-scroll" role="region" aria-labelledby="settings-category-title" tabIndex={0}>
        <section key={category} aria-label={current.label} className="settings-category">{children[category]}</section>
      </div>
      {actions[category] && <footer className="settings-detail-footer"><div className="settings-detail-actions">{actions[category]}</div></footer>}
    </div>
  </div>;
}
