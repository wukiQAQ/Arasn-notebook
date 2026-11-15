import { AppSelect } from "./AppSelect";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { DesktopInfo } from "../board";
import { GesturePath, type Direction } from "../../desktop/engines/gesture-path.mjs";
import { edgeRegions, GestureVisualizer, HotzoneVisualizer, MouseButtonVisualizer, type EdgeRegion } from "./TriggerVisuals";
import "./triggers.css";

export type TriggerAction = "toggle" | "quick-note" | "files" | "workbench" | "commands";
type Modifier = "Control" | "Alt" | "Shift" | "Super";
type MouseInput = { device: "mouse"; button: "Middle" | "Mouse4" | "Mouse5"; modifiers: Modifier[]; gesture: "press" | "double" };
export type GestureInput = { device: "gesture"; button: MouseInput["button"] | "Right"; modifiers: Modifier[];
  path: Direction[]; minDistance: number; timeoutMs: number; tolerance: number; global: boolean; allowUnmodified?: boolean };
export type EdgeInput = { device: "edge"; region: EdgeRegion; width: number; dwellMs: number; cooldownMs: number;
  modifier: "Control" | "Alt" | "Shift" | null; desktopOnly: boolean; pauseFullscreen: boolean };
export type TriggerInput = { device: "keyboard"; accelerator: string } | MouseInput | GestureInput | EdgeInput;
export type Binding = { id: string; action: TriggerAction; enabled: boolean; input: TriggerInput; name?: string };
type Category = TriggerInput["device"] | "advanced";
const categories: [Category, string][] = [["keyboard", "键盘快捷键"], ["mouse", "鼠标按键"],
  ["gesture", "鼠标手势"], ["edge", "屏幕边缘"], ["advanced", "高级规则"]];
const arrows: Record<Direction, string> = { N: "↑", NE: "↗", E: "→", SE: "↘", S: "↓", SW: "↙", W: "←", NW: "↖" };
const defaultGesture = { minDistance: 48, timeoutMs: 900, tolerance: 20, global: true };
const defaultEdge: EdgeInput = { device: "edge", region: "top", width: 8, dwellMs: 450, cooldownMs: 1000,
  modifier: null, desktopOnly: true, pauseFullscreen: true };
export type TriggerConfig = { version: 1; bindings: Binding[]; paused?: boolean; feedback?: boolean };
export type TriggerBridge = {
  capture(active: boolean): Promise<boolean>;
  probe(config: TriggerConfig): Promise<Record<string, string>>;
  defaults(): Promise<DesktopInfo>;
  test(active: boolean): Promise<boolean>;
  local(id: string): Promise<void>;
  palette(color: string): Promise<void>;
  onArrival(callback: (region: EdgeInput["region"]) => void): () => void;
  onDetected(callback: (binding: Binding) => void): () => void;
  onCaptured(callback: (input: TriggerInput) => void): () => void;
  onCaptureEnded(callback: () => void): () => void;
  onAction(callback: (action: TriggerAction) => void): () => void;
};

const keyNames: Record<string, string> = {
  " ": "Space", ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
};
const functionKey = /^F(?:[1-9]|1[0-9]|2[0-4])$/;
const specialKey = /^(Backspace|Tab|Enter|Pause|Escape|Space|PageUp|PageDown|End|Home|Left|Up|Right|Down|PrintScreen|Insert|Delete)$/;

export function modifiersFor(event: Pick<PointerEvent, "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): Modifier[] {
  const modifiers: Modifier[] = [];
  if (event.ctrlKey) modifiers.push("Control");
  if (event.altKey) modifiers.push("Alt");
  if (event.shiftKey) modifiers.push("Shift");
  if (event.metaKey) modifiers.push("Super");
  return modifiers;
}

function readKey(event: KeyboardEvent): TriggerInput | undefined {
  if (event.getModifierState("AltGraph") || event.nativeEvent.isComposing || event.keyCode === 229) return;
  const modifiers = modifiersFor(event);
  const key = /^[a-z0-9]$/i.test(event.key) ? event.key.toUpperCase()
    : /^Digit[0-9]$/.test(event.code) ? event.code.slice(-1) : keyNames[event.key] ?? event.key;
  if (!(functionKey.test(key) || /^[A-Z0-9]$/.test(key) || specialKey.test(key))) return;
  if (!modifiers.length && !functionKey.test(key) && key !== "PrintScreen") return;
  return { device: "keyboard", accelerator: [...modifiers, key].join("+") };
}

function label(input: TriggerInput) {
  if (input.device === "edge") return `${edgeRegions[input.region]} · ${input.dwellMs}ms${input.modifier ? ` · ${input.modifier === "Control" ? "Ctrl" : input.modifier}` : ""}`;
  if (input.device === "gesture") {
    const button = input.button === "Right" ? "右键" : input.button === "Middle" ? "中键" : input.button;
    return `${[...input.modifiers, button].join(" + ").replace("Control", "Ctrl").replace("Super", "Win")} 拖动 ${input.path.map(value => arrows[value]).join(" ")}`;
  }
  const text = input.device === "keyboard" ? input.accelerator : [...input.modifiers,
    input.button === "Middle" ? (input.gesture === "double" ? "双击鼠标中键" : "鼠标中键") : input.button].join("+");
  return text.replace("Control", "Ctrl").replace("Super", "Win").replaceAll("+", " + ");
}
const mouseButtons: Partial<Record<number, MouseInput["button"]>> = { 1: "Middle", 3: "Mouse4", 4: "Mouse5" };
export const gestureButtons: Partial<Record<number, GestureInput["button"]>> = { ...mouseButtons, 2: "Right" };

const errorMessage = (error: unknown) => String(error instanceof Error ? error.message : error)
  .replace(/^Error invoking remote method '[^']+': Error: /, "");

export function TriggerSettings({ info, onApplied }: { info: DesktopInfo; onApplied(info: DesktopInfo): void }) {
  const desktop = window.desktop!;
  const api = desktop.triggers;
  const { bindings } = info.triggers;
  const [category, setCategory] = useState<Category>("keyboard");
  const categoryRef = useRef(category);
  categoryRef.current = category;
  const [editing, setEditing] = useState<Omit<Binding, "input">>();
  const editOrigin = useRef<TriggerAction | undefined>(undefined);
  const [candidate, setCandidate] = useState<TriggerInput>();
  const [selectedEdge, setSelectedEdge] = useState<EdgeRegion>();
  const [edgeNotice, setEdgeNotice] = useState("");
  const edgeBaseline = useRef("");
  const [status, setStatus] = useState("");
  const [checked, setChecked] = useState<TriggerInput>();
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hit, setHit] = useState<Binding>();
  const [accepted, setAccepted] = useState(false);
  const [gestureOptions, setGestureOptions] = useState(defaultGesture);
  const [trail, setTrail] = useState<string[]>([]);
  const captureArea = useRef<HTMLDivElement>(null);
  const source = useRef<HTMLButtonElement>(null);
  const restore = useRef(false);
  const pressed = useRef<{ code: string; input: TriggerInput } | undefined>(undefined);
  const pointer = useRef<{ id: number; input: MouseInput } | undefined>(undefined);
  const drawing = useRef<{ id: number; path: GesturePath; input: Omit<GestureInput, "path">; trail: string[] } | undefined>(undefined);
  const active = useRef(false);
  const plainMiddle = candidate?.device === "mouse" && candidate.button === "Middle" && !candidate.modifiers.length;
  const plainDrag = candidate?.device === "gesture" && candidate.global && !candidate.modifiers.length &&
    (candidate.button === "Right" || candidate.button === "Middle");

  function record(input: TriggerInput) {
    setCandidate(input);
    setAccepted(false);
  }

  function endCapture(restoreFocus = true) {
    active.current = false;
    void api.capture(false).catch(() => {});
    setEditing(undefined);
    setCandidate(undefined);
    edgeBaseline.current = "";
    pressed.current = undefined;
    pointer.current = undefined;
    drawing.current = undefined;
    setTrail([]);
    restore.current = restoreFocus;
  }

  useEffect(() => {
    const offInput = api.onCaptured(input => {
      if (!active.current) return;
      pressed.current = undefined;
      if (categoryRef.current === "keyboard") record(input);
    });
    const offDetected = api.onDetected(setHit);
    const offEnd = api.onCaptureEnded(() => {
      if (active.current) {
        endCapture(false);
        setStatus("窗口失焦，录制已取消。");
      }
    });
    return () => {
      active.current = false;
      void api.capture(false).catch(() => {});
      void api.test(false).catch(() => {});
      offInput();
      offEnd();
      offDetected();
    };
  }, [api]);
  useLayoutEffect(() => {
    if (editing) {
      if (!source.current?.closest(".hotzone-monitor")) captureArea.current?.focus();
      else if (!busy) source.current?.focus({ preventScroll: true });
    }
    else if (!busy && restore.current) {
      restore.current = false;
      source.current?.focus();
    }
  }, [editing?.id, busy]);

  function candidateConfig(edit: Omit<Binding, "input">, input: TriggerInput): TriggerConfig {
    const replacement = { ...edit, input };
    return { ...info.triggers, bindings: bindings.some(row => row.id === edit.id)
      ? bindings.map(row => row.id === edit.id ? replacement : row)
      : [...bindings, replacement] };
  }

  useEffect(() => {
    if (!editing || !candidate) return;
    let current = true;
    setChecked(undefined);
    setStatus("正在检查…");
    void api.probe(candidateConfig(editing, candidate)).then(failures => {
      if (!current) return;
      if (Object.hasOwn(failures, editing.id)) { setStatus(failures[editing.id]); return; }
      setChecked(candidate);
      setStatus(candidate.device === "mouse" || candidate.device === "edge" || (candidate.device === "gesture" && candidate.global)
        ? "应用内无冲突，确认时检查 Windows 鼠标监听。" : "可用，确认后生效。");
    }, error => { if (current) setStatus(errorMessage(error)); });
    return () => { current = false; };
  }, [editing, candidate, bindings, api]);

  async function begin(action: TriggerAction, button: HTMLButtonElement, binding?: Binding, region?: EdgeRegion) {
    setStatus("");
    source.current = button;
    setBusy(true);
    try {
      if (!active.current && !await api.capture(true)) throw new Error("请先激活 Arasn 设置窗口");
      active.current = true;
      editOrigin.current = action;
      const next: Omit<Binding, "input"> = binding ?? { id: crypto.randomUUID(), action, enabled: true };
      setEditing(next);
      if (category === "edge") {
        const input = binding?.input.device === "edge" ? binding.input : { ...defaultEdge,
          region: region ?? (["top", ...Object.keys(edgeRegions)] as EdgeRegion[])
            .find(item => !edges.some(row => row.enabled && row.input.region === item)) ?? "top" };
        edgeBaseline.current = JSON.stringify([input, next.action, next.name ?? ""]);
        setEdgeNotice("");
        setCandidate(input);
        setSelectedEdge(input.region);
      }
      if (binding?.input.device === "gesture") {
        const { minDistance, timeoutMs, tolerance, global } = binding.input;
        setGestureOptions({ minDistance, timeoutMs, tolerance, global });
        setCandidate(binding.input);
      } else setGestureOptions({ ...defaultGesture, global: info.mouseTriggersSupported });
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(false); }
  }

  async function apply(operation: () => Promise<DesktopInfo>) {
    setBusy(true);
    try {
      onApplied(await operation());
      if (active.current) endCapture();
      setReset(false);
      setStatus("触发器已保存。");
    } catch (error) { setStatus(errorMessage(error)); }
    finally { setBusy(false); }
  }

  const update = (rows: Binding[]) => desktop.settings({ triggers: { ...info.triggers, bindings: rows } });
  function setGesture(patch: Partial<typeof defaultGesture>) {
    setGestureOptions(current => ({ ...current, ...patch }));
    if (candidate?.device === "gesture") setCandidate({ ...candidate, ...patch });
  }
  function point(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.round(event.clientX - rect.left), y: Math.round(event.clientY - rect.top) };
  }
  function editEdge(patch: Partial<EdgeInput>) {
    if (candidate?.device === "edge") setCandidate({ ...candidate, ...patch });
  }
  const edges = bindings.filter((binding): binding is Binding & { input: EdgeInput } => binding.input.device === "edge");
  const savedEdges: Partial<Record<EdgeRegion, (typeof edges)[number]>> = {};
  const zones: React.ComponentProps<typeof HotzoneVisualizer>["zones"] = {};
  const edgeState = (binding: Binding) => !binding.enabled ? "已禁用" : info.triggers.paused ? "已暂停" :
    Object.hasOwn(info.triggerFailures, binding.id) ? "未注册" : "已启用";
  for (const binding of edges) {
    const previous = savedEdges[binding.input.region];
    if (previous && (previous.enabled || !binding.enabled)) continue;
    savedEdges[binding.input.region] = binding;
    const state = edgeState(binding);
    zones[binding.input.region] = { input: binding.input, action: info.triggerActions[binding.action], active: state === "已启用", state };
  }
  const edgeEditing = editing && candidate?.device === "edge";
  const edgeDirty = edgeEditing && edgeBaseline.current !== JSON.stringify([candidate, editing.action, editing.name ?? ""]);
  if (editing && candidate?.device === "edge") {
    const saved = zones[candidate.region];
    const original = edges.find(binding => binding.id === editing.id);
    zones[candidate.region] = { input: candidate, action: info.triggerActions[editing.action],
      active: !!saved?.active, state: !edgeDirty && original ? edgeState(original) : "待保存" };
  }
  function selectEdge(region: EdgeRegion, button: HTMLButtonElement) {
    if (editing && candidate?.device === "edge") {
      if (candidate.region === region) return;
      if (edgeDirty) {
        setEdgeNotice("请先保存或取消当前修改，再切换热区。");
        return;
      }
    }
    setEdgeNotice("");
    const saved = savedEdges[region];
    // When moving a pristine new draft, keep the action the user originally chose.
    const action = saved?.action ?? (editing && !bindings.some(row => row.id === editing.id) ? editing.action : "toggle");
    void begin(action, button, saved, region);
  }
  const groups = Object.entries(info.triggerActions);
  if (category === "edge" && editing) groups.sort(([a], [b]) =>
    Number(b === editOrigin.current) - Number(a === editOrigin.current));
  const recordLabel = category === "gesture" ? "录制手势" : category === "edge" ? "添加热区" : "录制快捷键";
  return <section className="trigger-settings" aria-label="全局触发器">
    <div className="trigger-heading"><h3>快捷触发</h3>
      <button className="button" type="button" disabled={busy || !!editing} onClick={() => setReset(true)}>恢复默认</button>
    </div>
    <p>一个动作可设置多个触发器，保存后立即生效。</p>
    {info.mouseTriggersSupported && <p>鼠标触发会保留前台应用的原有点击行为。</p>}
    <div className="trigger-controls">
      <button className="button" type="button" disabled={busy || !!editing || testing}
        onClick={() => void apply(() => desktop.settings({ triggers: { ...info.triggers, paused: !info.triggers.paused } }))}>
        {info.triggers.paused ? "恢复快捷触发" : "暂停所有触发器"}
      </button>
      <button className="button" type="button" disabled={busy || !!editing || info.triggers.paused}
        onClick={async () => {
          setHit(undefined);
          if (await api.test(!testing)) setTesting(!testing);
        }}>{testing ? "结束测试" : "测试触发器"}</button>
    </div>
    {testing && <p role="status">{hit ? `已识别 ${label(hit.input)} · ${info.triggerActions[hit.action]}` : "等待触发。测试期间只显示识别结果。"}</p>}
    <nav className="trigger-controls trigger-categories" aria-label="快捷触发分类">
      {categories.map(([value, title]) => <button key={value} className="button" aria-pressed={category === value}
        disabled={busy || !!editing || (value === "edge" && !info.edgeTriggersSupported) ||
          (value === "mouse" && !info.mouseTriggersSupported)} onClick={() => { setCategory(value); setStatus(""); }}>{title}</button>)}
    </nav>
    {info.triggerWarning && <p role="alert">{info.triggerWarning}</p>}
    {!editing && <p className="trigger-status" role="status">{status}</p>}
    {reset && <div className="trigger-editor">
      <p>恢复后只保留 Ctrl + Alt + N 用于显示或隐藏主面板。</p>
      <button className="button primary" disabled={busy} onClick={() => void apply(api.defaults)}>确认恢复</button>
      <button className="button" disabled={busy} onClick={() => setReset(false)}>取消</button>
    </div>}
    {category === "advanced" && <>
      <p>暂停会释放所有全局监听。恢复时重新检查可用性。</p>
      {info.edgeTriggersSupported && <label className="trigger-option">
        <input type="checkbox" checked={info.triggers.feedback !== false} disabled={busy}
          onChange={event => void apply(() => desktop.settings({ triggers: { ...info.triggers, feedback: event.target.checked } }))} />
        显示屏幕边缘反馈
      </label>}
    </>}
    {category === "edge" && <>
      <HotzoneVisualizer zones={zones} selected={selectedEdge} disabled={busy || reset} onSelect={selectEdge}
        onTimingChange={edgeEditing ? editEdge : undefined} />
      {edgeDirty && edgeNotice && <p className="trigger-status" role="status">{edgeNotice}</p>}
    </>}
    {category === "mouse" && <MouseButtonVisualizer active={new Set(bindings.flatMap(binding =>
      binding.input.device === "mouse" && binding.enabled && !info.triggers.paused && !Object.hasOwn(info.triggerFailures, binding.id)
        ? [binding.input.button] : []))} />}
    {category !== "advanced" && groups.map(([action, title]) => {
      const rows = bindings.filter(binding => binding.action === action && binding.input.device === category);
      return <section className="trigger-group" aria-label={title} key={action}>
        <div className="trigger-heading"><h4>{title}</h4>
          <button className="button" disabled={busy || !!editing || reset}
            aria-label={`${recordLabel} · ${title}`} onClick={event => void begin(action as TriggerAction, event.currentTarget)}>
            {recordLabel}
          </button>
        </div>
        {rows.map(binding => <div className="trigger-row" key={binding.id}>
          <div className={binding.input.device === "gesture" ? "trigger-gesture-identity" : undefined}>
            {binding.input.device === "gesture" && <GestureVisualizer path={binding.input.path} />}
            <div>{binding.input.device === "gesture" ? <strong>{binding.name || `${binding.input.path.length} 段手势`}</strong>
              : binding.name && <strong>{binding.name} · </strong>}
            <kbd>{label(binding.input)}</kbd><small>{Object.hasOwn(info.triggerFailures, binding.id)
            ? info.triggerFailures[binding.id] : binding.enabled ? "已启用" : "已禁用"}</small></div>
          </div>
          <div className="trigger-controls">
            <button className="button" disabled={busy || !!editing || reset} onClick={event => void begin(binding.action, event.currentTarget, binding)}>修改</button>
            <button className="button" disabled={busy || !!editing || reset} onClick={() => void apply(() =>
              update(bindings.map(row => row.id === binding.id ? { ...row, enabled: !row.enabled } : row)))}>
              {binding.enabled ? "禁用" : "启用"}
            </button>
            <button className="button" disabled={busy || !!editing || reset} onClick={() => void apply(() =>
              update(bindings.filter(row => row.id !== binding.id)))}>删除</button>
          </div>
        </div>)}
        {!rows.length && (!editing || editOrigin.current !== action) && <small>未设置</small>}
        {editing && editOrigin.current === action && <div className="trigger-editor" onKeyDownCapture={event => {
          if (event.key !== "Escape" || event.ctrlKey || event.altKey || event.shiftKey || event.metaKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          event.stopPropagation();
          if (!busy) { endCapture(); setStatus("录制已取消。"); }
        }}>
          {category === "gesture" && <div className="gesture-options">
            <label>最短距离（DIP）<input type="number" min={20} max={200} value={gestureOptions.minDistance}
              onChange={event => setGesture({ minDistance: +event.target.value })} /></label>
            <label>超时（ms）<input type="number" min={300} max={3000} value={gestureOptions.timeoutMs}
              onChange={event => setGesture({ timeoutMs: +event.target.value })} /></label>
            <label>容差（°）<input type="number" min={8} max={22.5} step={0.5} value={gestureOptions.tolerance}
              onChange={event => setGesture({ tolerance: +event.target.value })} /></label>
            <label className="trigger-option"><input type="checkbox" checked={gestureOptions.global} disabled={!info.mouseTriggersSupported}
              onChange={event => setGesture({ global: event.target.checked })} />允许在其他应用中触发</label>
          </div>}
          {category !== "edge" && <div className={`trigger-capture${category === "gesture" ? " gesture-capture" : ""}`} data-shortcut-capture role="group" tabIndex={0} ref={captureArea}
            aria-label="正在录制快捷键"
            onKeyDown={event => {
              if (category !== "keyboard" || event.repeat || busy || event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Tab" && !event.ctrlKey && !event.altKey && !event.metaKey) return;
              event.preventDefault();
              event.stopPropagation();
              const input = readKey(event);
              if (input) pressed.current = { code: event.code, input };
            }}
            onKeyUp={event => {
              if (event.code !== pressed.current?.code) return;
              record(pressed.current.input);
              pressed.current = undefined;
              event.preventDefault();
            }}
            onPointerDown={event => {
              if (category === "gesture") {
                const button = gestureButtons[event.button];
                if (!button || event.pointerType !== "mouse" || busy) return;
                event.preventDefault();
                if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
                const start = point(event);
                const input = { ...gestureOptions, device: "gesture" as const, button, modifiers: modifiersFor(event) };
                const samples = [`${start.x},${start.y}`];
                drawing.current = { id: event.pointerId, input, path: new GesturePath(start, input, performance.now()), trail: samples };
                setTrail(samples.slice());
                setCandidate(undefined);
                return;
              }
              const button = mouseButtons[event.button];
              if (category !== "mouse" || !info.mouseTriggersSupported || !button || busy || event.pointerType !== "mouse" ||
                  event.getModifierState("AltGraph")) return;
              event.preventDefault();
              if (event.isTrusted) event.currentTarget.setPointerCapture(event.pointerId);
              pointer.current = { id: event.pointerId, input: { device: "mouse", button,
                modifiers: modifiersFor(event), gesture: "press" } };
            }}
            onPointerMove={event => {
              const active = drawing.current;
              if (!active || active.id !== event.pointerId) return;
              const current = point(event);
              active.path.move(current, performance.now());
              if (active.trail.length < 256) {
                active.trail.push(`${current.x},${current.y}`);
                setTrail(active.trail.slice());
              }
            }}
            onPointerUp={event => {
              if (category === "gesture") {
                const active = drawing.current;
                if (!active || active.id !== event.pointerId) return;
                drawing.current = undefined;
                event.preventDefault();
                const path = active.path.finish(point(event), performance.now());
                if (path.length) record({ ...active.input, path });
                else setStatus("距离不足、方向不明确或已超时，请重试。");
                return;
              }
              const started = pointer.current;
              if (!started || started.id !== event.pointerId || started.input.button !== mouseButtons[event.button]) return;
              event.preventDefault();
              pointer.current = undefined;
              record(started.input);
            }}
            onPointerCancel={() => { pointer.current = undefined; drawing.current = undefined; setTrail([]); }}
            onContextMenu={event => { if (category === "gesture") event.preventDefault(); }}
            onAuxClick={event => {
              if (info.mouseTriggersSupported && mouseButtons[event.button]) event.preventDefault();
            }}>
            {trail.length > 1 && <svg aria-hidden="true"><polyline points={trail.join(" ")} /></svg>}
            <span>{candidate ? <kbd>{label(candidate)}</kbd> : category === "gesture" ? "按住右键、中键或侧键绘制，松开完成"
              : category === "mouse" ? "点击中键或侧键，可同时按住修饰键" : "按下并松开目标组合键"}</span>
          </div>}
          {candidate?.device === "edge" && <div className="edge-options" ref={captureArea} tabIndex={0}>
            <strong>编辑{edgeRegions[candidate.region]}</strong>
            <div className="gesture-options">
              <label>所需修饰键 <AppSelect label="所需修饰键" value={candidate.modifier ?? ''} onValueChange={value => editEdge({modifier:value || null})}
                options={[{value:'',label:'无'},{value:'Control',label:'Ctrl'},{value:'Alt',label:'Alt'},{value:'Shift',label:'Shift'}]} /></label>
              <label className="trigger-option"><input type="checkbox" checked={candidate.desktopOnly}
                onChange={event => editEdge({ desktopOnly: event.target.checked })} />仅在 Windows 桌面触发</label>
              <label className="trigger-option"><input type="checkbox" checked={candidate.pauseFullscreen}
                onChange={event => editEdge({ pauseFullscreen: event.target.checked })} />全屏应用中暂停</label>
            </div>
          </div>}
          {candidate && <label className="trigger-option">名称
            <input maxLength={40} value={editing.name ?? ""} placeholder="可选"
              onChange={event => setEditing({ ...editing, name: event.target.value })} />
          </label>}
          {candidate && <label className="trigger-option">执行动作
            <AppSelect label="执行动作" value={editing.action} onValueChange={action => setEditing({...editing,action})}
              options={Object.entries(info.triggerActions).map(([value,label])=>({value:value as TriggerAction,label}))} />
          </label>}
          {candidate?.device === "mouse" && candidate.button === "Middle" && <label className="trigger-option">
            中键手势
            <AppSelect label="中键手势" value={candidate.gesture} onValueChange={gesture => record({...candidate,gesture})}
              options={[{value:'press',label:'单击'},{value:'double',label:'双击'}]} />
          </label>}
          {plainMiddle && <label className="trigger-option xigra-notice" data-tone="warning">
            <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
            我了解中键仍会触发浏览器开标签或自动滚动等原应用操作。
          </label>}
          {plainDrag && candidate?.device === "gesture" && <label className="trigger-option xigra-notice" data-tone="warning">
            <input type="checkbox" checked={!!candidate.allowUnmodified}
              onChange={event => setCandidate({ ...candidate, allowUnmodified: event.target.checked })} />
            确认启用无修饰键拖动。原应用仍可能弹出菜单、滚动或平移。
          </label>}
          <p className="trigger-status" role="status">{status}</p>
          <p>{category === "gesture" ? "建议用修饰键区分手势与普通拖动。仅窗口手势在标题工具区生效。"
            : category === "edge" ? "在工作区内侧停留。跨屏接缝、任务栏和按住鼠标拖动时跳过。"
              : "Esc 取消录制。普通字母和数字须搭配修饰键。"}</p>
          <button className="button primary" disabled={busy || !candidate || checked !== candidate || (plainMiddle && !accepted)}
            onClick={() => candidate && void apply(() => desktop.settings({ triggers: candidateConfig(editing, candidate) }))}>确认保存</button>
          <button className="button" disabled={busy} onClick={() => { endCapture(); setStatus("录制已取消。"); }}>取消</button>
        </div>}
      </section>;
    })}
  </section>;
}
