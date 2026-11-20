import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { AppSelect } from './xigra/AppSelect';
import { Button } from './Button';
import {
  defaultAppearanceSettings, fonts, normalizeHex, presets, resolveAppearance,
  type Appearance, type DisplayMode, type FontScale, type Preset, type ThemeTone,
} from './appearance';
import type { useAppearance } from './useAppearance';
import './appearance-settings.css';

type Controller = ReturnType<typeof useAppearance>;
const modes = [{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '跟随系统' }] as const;
const scales: { value: FontScale; label: string }[] = [
  { value: 'standard', label: '标准' }, { value: 'compact', label: '紧凑' }, { value: 'comfortable', label: '舒适' },
];
const accentOptions = [
  ['紫罗兰', '#7052DF'], ['湖蓝', '#2177D0'], ['青绿', '#007F78'], ['松绿', '#30844E'],
  ['琥珀', '#C27816'], ['珊瑚', '#D04950'], ['玫红', '#BB4385'],
];

function Row({ title, helper, children }: { title: string; helper: string; children: ReactNode }) {
  return <div className="appearance-row">
    <div className="appearance-row-copy"><strong>{title}</strong><p>{helper}</p></div>
    <div className="appearance-row-control">{children}</div>
  </div>;
}

function ModePreview({ tone, appearance }: { tone: ThemeTone; appearance: Appearance }) {
  const { palette, tokens } = resolveAppearance(appearance, tone);
  const style = {
    '--preview-app': palette.background, '--preview-rail': palette.secondary, '--preview-panel': palette.panel,
    '--preview-ink': palette.foreground, '--preview-accent': palette.accent,
    '--preview-border': tokens['--ui-border-subtle'] ?? palette.border,
  } as CSSProperties;
  return <span className="appearance-preview-window" style={style}>
    <span className="appearance-preview-rail"><i/><i/><i/></span>
    <span className="appearance-preview-panel"><i/><i/><i/><i/></span>
  </span>;
}

function ModeChoice({ value, label, active, appearance, systemTone, onClick }: {
  value: DisplayMode; label: string; active: boolean; appearance: Appearance; systemTone: ThemeTone; onClick(): void;
}) {
  return <button type="button" className="appearance-mode" aria-pressed={active} onClick={onClick}>
    <span className="appearance-preview" data-system={value === 'system' || undefined} aria-hidden="true">
      <ModePreview appearance={appearance} tone={value === 'system' ? systemTone : value}/>
      {value === 'system' && <ModePreview appearance={appearance} tone={systemTone === 'light' ? 'dark' : 'light'}/>}
      {active && <span className="appearance-mode-check"><Check size={13}/></span>}
    </span>
    <span>{label}</span>
  </button>;
}

function ColorControl({ label, value, fallback, onChange }: {
  label: string; value: string | null; fallback: string; onChange(value: string | null): void;
}) {
  const shown = value ?? fallback;
  const [draft, setDraft] = useState(shown);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setDraft(shown); setInvalid(false); }, [shown]);
  function commit() {
    const parsed = normalizeHex(draft);
    if (!parsed) { setInvalid(true); return; }
    setInvalid(false);
    setDraft(parsed);
    if (parsed !== shown) onChange(parsed);
  }
  return <div className="appearance-color-control">
    <div className="appearance-color-fields">
      <input type="color" aria-label={`选择${label}`} value={shown.toLowerCase()}
        onChange={event => { const color = event.target.value.toUpperCase(); setDraft(color); setInvalid(false); onChange(color); }}/>
      <input className="appearance-hex" aria-label={`${label} HEX`} value={draft}
        maxLength={7} spellCheck={false} autoComplete="off" aria-invalid={invalid || undefined} onBlur={commit}
        onChange={event => { setDraft(event.target.value); setInvalid(false); }}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }}/>
      <Button iconOnly aria-label={`恢复默认${label}`} disabled={!value && !invalid} onClick={() => {
        setDraft(fallback); setInvalid(false); onChange(null);
      }}><RotateCcw size={16}/></Button>
    </div>
    {invalid && <small className="appearance-warning" role="alert">请输入六位 HEX 色值，例如 #5D4BD2。</small>}
  </div>;
}

export function AppearancePanel({ controller }: { controller: Controller }) {
  const { settings, tone, systemTone, availableFonts, save } = controller;
  const { appearance } = settings;
  const resolved = resolveAppearance(appearance, tone);
  const palette = presets[appearance.preset][tone];
  const patch = (value: Partial<Appearance>) => void save({ ...settings, appearance: { ...appearance, ...value } });
  const fontOptions = [{ value: 'system', label: '系统默认' },
    ...fonts.filter(font => availableFonts?.includes(font) || appearance.font === font)
      .map(font => ({ value: font, label: availableFonts && !availableFonts.includes(font) ? `${font}（回退）` : font })),
  ];
  return <div className="appearance-panel">
    <div className="appearance-card">
      <Row title="显示模式" helper="选择应用的明暗外观。">
        <div className="appearance-modes" role="group" aria-label="显示模式">
          {modes.map(({ value, label }) => <ModeChoice key={value} value={value} label={label} active={value === settings.theme}
            appearance={appearance} systemTone={systemTone} onClick={() => void save({ ...settings, theme: value })}/>)}
        </div>
      </Row>
      <Row title="主题预设" helper="为当前显示模式应用一组配色。自定义颜色会保留。">
        <div className="appearance-presets" role="group" aria-label="主题预设">
          {(Object.keys(presets) as Preset[]).map(key => <button key={key} type="button" aria-pressed={appearance.preset === key} onClick={() => patch({ preset: key })}>
            <span className="appearance-preset-dot" style={{ background: presets[key][tone].accent }} aria-hidden="true"/>{presets[key].label}
          </button>)}
        </div>
      </Row>
      <Row title="强调色" helper="用于主按钮、选中状态与键盘焦点。">
        <div className="appearance-accent-controls">
          <div className="appearance-swatches" role="group" aria-label="预设强调色">
            {accentOptions.map(([name, color]) => <Button key={color} className="appearance-swatch" iconOnly aria-label={name} aria-pressed={appearance.accent === color}
              style={{ '--swatch': color } as CSSProperties} onClick={() => patch({ accent: color })}><span/></Button>)}
          </div>
          <ColorControl label="强调色" value={appearance.accent} fallback={palette.accent} onChange={accent => patch({ accent })}/>
        </div>
      </Row>
      <Row title="界面字体" helper="应用于菜单和按钮。笔记正文保留自己的格式。">
        <div className="appearance-font-controls">
          <AppSelect label="界面字体" value={appearance.font} options={fontOptions} onValueChange={font => patch({ font })}/>
          <AppSelect label="字体尺度" value={appearance.scale} options={scales} onValueChange={scale => patch({ scale })}/>
        </div>
      </Row>
      <div className="appearance-font-preview">
        <span>工作区预览 · Workspace</span><small>记录想法，连接线索 · Arrange ideas and notes.</small>
        {availableFonts && appearance.font !== 'system' && !availableFonts.includes(appearance.font) &&
          <small role="status">本机未安装此字体，当前使用系统默认。</small>}
      </div>
    </div>
    <details className="appearance-advanced">
      <summary>高级颜色</summary>
      <Row title="背景色" helper="用于派生工作区和面板的各层表面。">
        <ColorControl label="背景色" value={appearance.background} fallback={palette.background} onChange={background => patch({ background })}/>
      </Row>
      <Row title="前景色" helper="用于界面主要文字和图标。">
        <ColorControl label="前景色" value={appearance.foreground} fallback={palette.foreground} onChange={foreground => patch({ foreground })}/>
      </Row>
      {resolved.foregroundAdjusted && <p className="appearance-warning appearance-contrast" role="status">所选文字与背景对比度偏低，界面已自动调整实际文字色。</p>}
    </details>
  </div>;
}

export function AppearanceActions({ controller }: { controller: Controller }) {
  const { status, settings, save } = controller;
  return <div className="appearance-actions">
    <span role="status">{status === 'saving' ? '正在保存…' : status === 'error' ? '保存失败，当前为预览' : '更改实时生效并自动保存'}</span>
    {status === 'error' && <Button onClick={() => void save(settings)}>重试保存</Button>}
    <Button onClick={() => void save(defaultAppearanceSettings)} title="恢复显示模式、预设、颜色与字体">恢复默认外观</Button>
  </div>;
}
