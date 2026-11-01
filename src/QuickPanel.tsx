import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Minus,
  Network,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { BoardClient, DesktopInfo, StrokeValue, TextValue, uid } from "./board";
import { SHAPES, Shape, shapePoints } from "./drawing";

const COLORS = ["#263449", "#39796b", "#d05a4b", "#4668c6"];
export function QuickPanel({
  client,
  info,
  expand,
  settings,
  share,
  undo,
  strokeCommit,
  copy,
}: {
  client: BoardClient;
  info: DesktopInfo | null;
  expand(): void;
  settings(): void;
  share(): void;
  undo(): void;
  strokeCommit(id: string, value: StrokeValue | null): void;
  copy(text: string): void;
}) {
  const [mode, setMode] = useState<"text" | "draw">("text");
  const [selected, setSelected] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [textColor, setTextColor] = useState(COLORS[0]);
  const [fontSize, setFontSize] = useState(18);
  const [bold, setBold] = useState(false);
  const [width, setWidth] = useState(7);
  const [shape, setShape] = useState<Shape>("free");
  const [erase, setErase] = useState(false);
  const [ink, setInk] = useState<StrokeValue | null>(null);
  const activeStroke = useRef<StrokeValue | null>(null);
  const anchor = useRef<number[]>([]);
  const input = useRef<HTMLTextAreaElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const items = Object.entries(client.view());
  const notes = items.filter(([, item]) => item.value?.type === "text");
  const strokes = items.filter(([, item]) => item.value?.type === "stroke");
  const activeId = notes.some(([id]) => id === selected)
    ? selected
    : notes.at(-1)?.[0];
  const active = activeId
    ? (client.view()[activeId]?.value as TextValue)
    : null;
  const focus = () =>
    mode === "text" ? input.current?.focus() : svg.current?.focus();
  useEffect(() => {
    focus();
    return window.desktop?.onFocus(focus);
  }, [mode]);
  useEffect(() => {
    if (client.ready && mode === "text") input.current?.focus();
  }, [client.ready]);
  function newNote() {
    if (!client.ready) return;
    const id = uid();
    client.edit(id, {
      type: "text",
      text: "",
      x: 100 + (notes.length % 4) * 330,
      y: 100 + (Math.floor(notes.length / 4) % 4) * 190,
      color: textColor,
      fontSize,
      bold,
    });
    setSelected(id);
    input.current?.focus();
  }
  function formatText(patch: Partial<TextValue>) {
    if (patch.color) setTextColor(patch.color);
    if (patch.fontSize) setFontSize(patch.fontSize);
    if (patch.bold !== undefined) setBold(patch.bold);
    if (activeId && active) client.edit(activeId, { ...active, ...patch });
  }
  const point = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(
        0,
        Math.min(1600, ((event.clientX - rect.left) * 1600) / rect.width),
      ),
      Math.max(
        0,
        Math.min(1000, ((event.clientY - rect.top) * 1000) / rect.height),
      ),
    ];
  };
  function finish() {
    if (activeStroke.current) strokeCommit(uid(), activeStroke.current);
    activeStroke.current = null;
    setInk(null);
  }
  const path = (value: StrokeValue) =>
    value.points.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ") +
    (value.points.length === 1 ? " l .1 .1" : "");
  return (
    <section className="quick-panel" aria-label="快捷面板">
      <header className="quick-header">
        <strong>
          <span>A</span> Arasn
        </strong>
        <div>
          <button
            className="icon-button"
            aria-label="设置与快捷键"
            title="设置"
            onClick={settings}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="展开完整页面"
            title="展开完整页面"
            onClick={expand}
          >
            <ArrowUpRight size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="隐藏到托盘"
            onClick={() => window.desktop?.hide()}
          >
            <Minus size={18} />
          </button>
        </div>
      </header>
      <div className="quick-tabs" role="tablist" aria-label="编辑模式">
        <button
          role="tab"
          aria-selected={mode === "text"}
          onClick={() => setMode("text")}
        >
          <Type size={17} /> 打字
        </button>
        <button
          role="tab"
          aria-selected={mode === "draw"}
          onClick={() => setMode("draw")}
        >
          <Pencil size={17} /> 画图
        </button>
      </div>
      {client.error && (
        <div className="quick-notice" role="status">
          {client.error}
          {client.conflicts.length > 0 && (
            <button onClick={() => client.recover()}>恢复本机改动</button>
          )}
        </div>
      )}
      {info && !info.shortcutOk && (
        <div className="quick-notice">快捷键被占用，请到设置更换。</div>
      )}
      <div className="quick-content">
        {mode === "text" ? (
          <>
            <div className="quick-tools">
              <select
                aria-label="当前便笺"
                value={activeId || ""}
                onChange={(e) => setSelected(e.target.value)}
              >
                {!notes.length && <option value="">新的便笺</option>}
                {notes.map(([id, item], i) => (
                  <option key={id} value={id}>
                    {(item.value as TextValue).text
                      .split("\n")[0]
                      .slice(0, 20) || `便笺 ${i + 1}`}
                  </option>
                ))}
              </select>
              <button
                className="icon-button"
                aria-label="写一张便笺"
                title="新便笺"
                disabled={!client.ready}
                onClick={newNote}
              >
                <Plus size={18} />
              </button>
              <button
                className="icon-button"
                aria-label="复制文字"
                title="复制文字"
                disabled={!active?.text}
                onClick={() => copy(active?.text || "")}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="quick-tools format-tools">
              <label>
                文字颜色{" "}
                <input
                  type="color"
                  aria-label="文字颜色"
                  value={active?.color || textColor}
                  onChange={(e) => formatText({ color: e.target.value })}
                />
              </label>
              <select
                aria-label="文字字号"
                value={active ? active.fontSize || 18 : fontSize}
                onChange={(e) =>
                  formatText({ fontSize: Number(e.target.value) })
                }
              >
                <option value={14}>小字</option>
                <option value={18}>标准</option>
                <option value={24}>大字</option>
                <option value={32}>标题</option>
              </select>
              <button
                className={`tool ${(active ? active.bold : bold) ? "selected" : ""}`}
                aria-label="文字加粗"
                aria-pressed={!!(active ? active.bold : bold)}
                onClick={() =>
                  formatText({ bold: !(active ? active.bold : bold) })
                }
              >
                <strong>B</strong>
              </button>
            </div>
            <textarea
              ref={input}
              className="quick-input"
              aria-label="便笺文字"
              disabled={!client.ready}
              maxLength={10000}
              value={active?.text || ""}
              style={{
                color: active?.color || textColor,
                fontSize: active ? active.fontSize || 18 : fontSize,
                fontWeight: (active ? active.bold : bold) ? 700 : 400,
              }}
              placeholder="直接打字，随手记下…"
              onChange={(e) => {
                const id = activeId || uid();
                client.edit(
                  id,
                  active
                    ? { ...active, text: e.target.value }
                    : {
                        type: "text",
                        text: e.target.value,
                        x: 100,
                        y: 100,
                        color: textColor,
                        fontSize,
                        bold,
                      },
                );
                setSelected(id);
              }}
            />
          </>
        ) : (
          <>
            <div className="quick-tools">
              <div className="colors">
                {COLORS.map((c, i) => (
                  <button
                    key={c}
                    aria-label={["墨色", "松绿", "朱红", "靛蓝"][i]}
                    aria-pressed={color === c}
                    className={`color ${color === c ? "chosen" : ""}`}
                    style={{ background: c }}
                    onClick={() => {
                      setColor(c);
                      setErase(false);
                    }}
                  />
                ))}
              </div>
              <input
                type="color"
                aria-label="自定义画笔颜色"
                value={color}
                onChange={(e) => {
                  setColor(e.target.value);
                  setErase(false);
                }}
              />
              <span className="toolbar-spacer" />
              <button
                className={`tool ${erase ? "selected" : ""}`}
                aria-label="删除笔迹"
                aria-pressed={erase}
                onClick={() => setErase(!erase)}
              >
                <Trash2 size={17} />
              </button>
              <button className="tool" aria-label="撤销上次操作" onClick={undo}>
                <Undo2 size={18} />
              </button>
            </div>
            <div className="quick-tools shape-tools">
              <select
                aria-label="绘图工具"
                value={shape}
                onChange={(e) => {
                  setShape(e.target.value as Shape);
                  setErase(false);
                }}
              >
                {SHAPES.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="画笔粗细"
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
              >
                <option value={2}>细笔</option>
                <option value={4}>中笔</option>
                <option value={7}>粗笔</option>
                <option value={12}>加粗</option>
              </select>
            </div>
            <div className="quick-drawing">
              <svg
                ref={svg}
                tabIndex={0}
                aria-label="小窗画布"
                data-testid="quick-canvas"
                viewBox="0 0 1600 1000"
                onPointerDown={(e) => {
                  if (erase || !client.ready || e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  anchor.current = point(e);
                  activeStroke.current = {
                    type: "stroke",
                    color,
                    width,
                    points: [anchor.current],
                  };
                  setInk(activeStroke.current);
                }}
                onPointerMove={(e) => {
                  if (
                    !activeStroke.current ||
                    activeStroke.current.points.length >= 3000
                  )
                    return;
                  const p = point(e),
                    last = activeStroke.current.points.at(-1)!;
                  if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 3) return;
                  activeStroke.current = {
                    ...activeStroke.current,
                    points:
                      shape === "free"
                        ? [...activeStroke.current.points, p]
                        : shapePoints(shape, anchor.current, p),
                  };
                  setInk(activeStroke.current);
                }}
                onPointerUp={finish}
                onPointerCancel={finish}
              >
                {strokes.map(([id, item]) => {
                  const s = item.value as StrokeValue;
                  return (
                    <path
                      key={id}
                      data-testid="quick-stroke"
                      d={path(s)}
                      stroke={s.color}
                      strokeWidth={s.width}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      onPointerDown={(e) => {
                        if (erase) {
                          e.stopPropagation();
                          strokeCommit(id, null);
                        }
                      }}
                      style={{ pointerEvents: erase ? "stroke" : "none" }}
                    />
                  );
                })}
                {ink && (
                  <path
                    d={path(ink)}
                    stroke={ink.color}
                    strokeWidth={ink.width}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              {!strokes.length && !ink && (
                <div className="quick-draw-hint">按住鼠标，随手画一画</div>
              )}
            </div>
            <p className="quick-hint">
              {shape === "free" ? "按住鼠标绘画。" : "按住并拖动鼠标绘制图形。"}{" "}
              切换模式不会清空。
            </p>
          </>
        )}
      </div>
      <footer className="quick-footer">
        <div className="save-state">
          <i className="dot" />
          {client.status}
        </div>
        <button
          className={`button ${info?.sharing ? "primary" : ""}`}
          onClick={share}
        >
          <Network size={15} />
          {info?.sharing ? "共享中" : "传递 / 共享"}
        </button>
      </footer>
      <div className="quick-bottom">
        {info?.sharing
          ? "同一共享页内，文字与图画会自动传递。"
          : "当前仅本机保存，开启局域网共享即可传递。"}
      </div>
    </section>
  );
}
