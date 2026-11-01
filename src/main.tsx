import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Download,
  GripHorizontal,
  Keyboard,
  Layers3,
  Minus,
  MousePointer2,
  Network,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import {
  BoardClient,
  DesktopInfo,
  StrokeValue,
  TextValue,
  uid,
  Value,
} from "./board";
import "./style.css";
import { QuickPanel } from "./QuickPanel";

const COLORS = ["#263449", "#39796b", "#d05a4b", "#4668c6"];
const pointsPath = (points: number[][]) =>
  points.map((p, i) => `${i ? "L" : "M"} ${p[0]} ${p[1]}`).join(" ") +
  (points.length === 1 ? ` l .1 .1` : "");
function App() {
  const [, refresh] = useState(0);
  const [client] = useState(() => new BoardClient(() => refresh((n) => n + 1)));
  const [tool, setTool] = useState<"select" | "text" | "pen" | "erase">("text");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [zoom, setZoom] = useState(80);
  const [selected, setSelected] = useState("");
  const [stroke, setStroke] = useState<StrokeValue | null>(null);
  const drawing = useRef<StrokeValue | null>(null);
  const drag = useRef<{
    id: string;
    value: TextValue;
    x: number;
    y: number;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    id: string;
    value: TextValue;
  } | null>(null);
  const [info, setInfo] = useState<DesktopInfo | null>(null);
  const [expanded, setExpanded] = useState(!window.desktop);
  const [dialog, setDialog] = useState<"share" | "settings" | null>(null);
  const [shortcut, setShortcut] = useState("Control+Alt+N");
  const [theme, setTheme] = useState<DesktopInfo["theme"]>(() => {
    const saved = localStorage.getItem("arasn-theme");
    return saved === "light" || saved === "dark" ? saved : "system";
  });
  const [toast, setToast] = useState("");
  const [working, setWorking] = useState(false);
  const paper = useRef<HTMLDivElement>(null);
  const undo = useRef<
    { id: string; previous: Value | null; expected: number }[]
  >([]);
  const items = client.view();
  const visible = Object.entries(items).filter(([, item]) => item.value);
  const scale = zoom / 100;
  const texts = visible.filter(([, item]) => item.value?.type === "text");
  const strokes = visible.filter(([, item]) => item.value?.type === "stroke");

  useEffect(() => {
    void client.start();
    if (window.desktop)
      void window.desktop.info().then((value) => {
        setInfo(value);
        setShortcut(value.shortcut);
        setTheme(value.theme);
        setExpanded(value.expanded);
      });
    const unsubscribe = window.desktop?.onLayout(setExpanded);
    return () => {
      client.stop();
      unsubscribe?.();
    };
  }, [client]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    localStorage.setItem("arasn-theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  async function changeSettings(patch: Partial<DesktopInfo>) {
    const previous = info;
    if (window.desktop)
      setInfo((current) => (current ? { ...current, ...patch } : current));
    setWorking(true);
    try {
      if (window.desktop) {
        const updated = await window.desktop.settings(patch);
        setInfo(updated);
        setTheme(updated.theme);
        setShortcut(updated.shortcut);
      } else if (patch.theme) setTheme(patch.theme);
      setToast("设置已保存");
    } catch (error) {
      setInfo(previous);
      setToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  function captureShortcut(event: React.KeyboardEvent<HTMLInputElement>) {
    event.preventDefault();
    if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
    if (event.key === "Escape") {
      event.currentTarget.blur();
      return;
    }
    const key = /^(Key[A-Z]|Digit[0-9])$/.test(event.code)
      ? event.code.replace(/^(Key|Digit)/, "")
      : /^F([1-9]|1[0-9]|2[0-4])$/.test(event.key)
        ? event.key
        : (
            {
              " ": "Space",
              Enter: "Enter",
              Tab: "Tab",
              Home: "Home",
              End: "End",
              PageUp: "PageUp",
              PageDown: "PageDown",
              ArrowUp: "Up",
              ArrowDown: "Down",
              ArrowLeft: "Left",
              ArrowRight: "Right",
            } as Record<string, string>
          )[event.key];
    if (!key || !(event.ctrlKey || event.altKey || event.metaKey))
      return setToast("请搭配 Ctrl、Alt 或 Win 键录入组合");
    setShortcut(
      [
        event.ctrlKey && "Control",
        event.altKey && "Alt",
        event.shiftKey && "Shift",
        event.metaKey && "Super",
        key,
      ]
        .filter(Boolean)
        .join("+"),
    );
  }
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (event.key === "Escape") {
        if (dialog) setDialog(null);
        else if (window.desktop) void window.desktop.hide();
        return;
      }
      if (
        event.isComposing ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLInputElement
      )
        return;
      if (event.key === "Delete" && selected) commit(selected, null);
      if (event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLast();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  function commit(id: string, value: Value | null) {
    const current = client.view()[id];
    client.edit(id, value);
    undo.current.push({
      id,
      previous: current?.value || null,
      expected: client.view()[id]?.version || 0,
    });
    if (undo.current.length > 100) undo.current.shift();
  }
  function undoLast() {
    const entry = undo.current.pop();
    if (!entry) return setToast("没有可撤销的操作");
    if (client.view()[entry.id]?.version !== entry.expected)
      return setToast("内容已有新修改，未覆盖他人的改动");
    if (entry.previous && client.view()[entry.id]?.value === null)
      client.edit(uid(), entry.previous);
    else client.edit(entry.id, entry.previous);
  }
  function coordinate(event: React.PointerEvent) {
    const rect = paper.current!.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1600, (event.clientX - rect.left) / scale)),
      Math.max(0, Math.min(1000, (event.clientY - rect.top) / scale)),
    ];
  }
  function addText(x = 90, y = 100) {
    if (!client.ready) return;
    const id = uid();
    commit(id, {
      type: "text",
      text: "",
      x: Math.min(1320, x),
      y: Math.min(860, y),
      color,
    });
    setSelected(id);
    setTool("select");
    setTimeout(() => document.getElementById(`note-${id}`)?.focus(), 0);
  }
  function down(event: React.PointerEvent) {
    if (event.button !== 0 || !client.ready) return;
    const point = coordinate(event);
    if (tool === "text") {
      addText(...(point as [number, number]));
      return;
    }
    if (tool === "select") {
      setSelected("");
      return;
    }
    if (tool === "pen") {
      event.currentTarget.setPointerCapture(event.pointerId);
      drawing.current = { type: "stroke", color, width, points: [point] };
      setStroke(drawing.current);
    }
  }
  function move(event: React.PointerEvent) {
    if (drag.current) {
      const d = drag.current;
      setDragPreview({
        id: d.id,
        value: {
          ...d.value,
          x: Math.max(
            0,
            Math.min(1320, d.value.x + (event.clientX - d.x) / scale),
          ),
          y: Math.max(
            0,
            Math.min(860, d.value.y + (event.clientY - d.y) / scale),
          ),
        },
      });
    }
    if (!drawing.current || drawing.current.points.length >= 3000) return;
    const point = coordinate(event),
      last = drawing.current.points.at(-1)!;
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < 2) return;
    drawing.current = {
      ...drawing.current,
      points: [...drawing.current.points, point],
    };
    setStroke(drawing.current);
  }
  function up() {
    if (drawing.current) {
      commit(uid(), drawing.current);
      drawing.current = null;
      setStroke(null);
    }
    if (drag.current && dragPreview) commit(drag.current.id, dragPreview.value);
    drag.current = null;
    setDragPreview(null);
  }
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 1600, 1000);
    for (const [, item] of visible) {
      const value = item.value!;
      if (value.type === "stroke") {
        ctx.strokeStyle = value.color;
        ctx.lineWidth = value.width;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke(new Path2D(pointsPath(value.points)));
      } else {
        ctx.fillStyle = "#f6f8fb";
        ctx.fillRect(value.x, value.y, 280, 140);
        ctx.fillStyle = value.color;
        ctx.font = '18px "Segoe UI", "Microsoft YaHei", sans-serif';
        let row = 0,
          line = "";
        for (const char of value.text + "\n") {
          if (char === "\n" || ctx.measureText(line + char).width > 248) {
            ctx.fillText(line, value.x + 16, value.y + 38 + row * 25);
            row++;
            line = char === "\n" ? "" : char;
          } else line += char;
          if (row >= 4) break;
        }
      }
    }
    canvas.toBlob((blob) => blob && download(blob, "Arasn-随手页.png"));
  }
  async function share(enabled: boolean) {
    setWorking(true);
    try {
      await client.tick();
      setInfo(await window.desktop!.share(enabled));
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function copy(text: string) {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(text);
      else {
        const area = document.createElement("textarea");
        area.value = text;
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        if (!ok) throw new Error();
      }
      setToast("已复制");
    } catch {
      setToast("复制失败，请选中文字后按 Ctrl+C");
    }
  }
  return (
    <div className={`app-shell ${expanded ? "" : "compact-shell"}`}>
      {!expanded ? (
        <QuickPanel
          client={client}
          info={info}
          expand={() => void window.desktop?.layout(true)}
          settings={() => setDialog("settings")}
          share={() => setDialog("share")}
          undo={undoLast}
          strokeCommit={commit}
          copy={copy}
        />
      ) : (
        <>
          <aside className="sidebar">
            <div className="brand">
              <span className="brand-mark">A</span>
              <div>
                Arasn<span>办公随手页</span>
              </div>
            </div>
            <button
              className="new-note"
              onClick={() =>
                addText(
                  100 + (texts.length % 4) * 330,
                  110 + (Math.floor(texts.length / 4) % 4) * 190,
                )
              }
              disabled={!client.ready}
            >
              <Plus size={17} /> 写一张便笺 <span>＋</span>
            </button>
            <div className="section-label">工作空间</div>
            <button className="space active">
              <Layers3 size={17} />
              <span>我的随手页</span>
              <span className="count">1</span>
            </button>
            <button className="space" onClick={() => setDialog("share")}>
              <Network size={17} />
              <span>局域网共享</span>
              {info?.sharing && <i className="dot" />}
            </button>
            <div className="sidebar-note">
              <span className="small-line" />
              随手写，随时接着想。
              <p>
                临时想法、会议重点、
                <br />
                需要快速传递的小事。
              </p>
            </div>
            <div className="sidebar-bottom">
              <div className="shortcut-label">
                <Keyboard size={15} /> 快速呼出{" "}
                <kbd>
                  {info?.shortcut
                    .replace("Control", "Ctrl")
                    .replaceAll("+", " + ") || "Ctrl + Alt + N"}
                </kbd>
              </div>
              <button className="space" onClick={() => setDialog("settings")}>
                <Settings2 size={16} /> 设置与快捷键
              </button>
              <span className="version">ARASN NOTEBOOK · 0.4</span>
            </div>
          </aside>
          <main>
            <header className="topbar">
              <div className="breadcrumb">
                工作空间 <span>/</span> <strong>我的随手页</strong>
              </div>
              <div className="header-actions">
                {window.desktop && (
                  <button
                    className="button"
                    aria-label="收回小窗"
                    onClick={() => void window.desktop?.layout(false)}
                  >
                    收回小窗
                  </button>
                )}
                <span
                  className={`save-state ${client.pending.length ? "pending" : ""}`}
                >
                  <i className="dot" />
                  {client.status}
                </span>
                <button
                  className="icon-button"
                  title="隐藏到托盘"
                  aria-label="隐藏到托盘"
                  onClick={() =>
                    window.desktop
                      ? window.desktop.hide()
                      : setToast("浏览器版本可直接最小化窗口")
                  }
                >
                  <Minus size={18} />
                </button>
              </div>
            </header>
            <section className="page-heading">
              <div>
                <div className="eyebrow">留一点空间，给正在发生的想法</div>
                <h1>
                  我的随手页<span className="title-dot">.</span>
                </h1>
                <p>文字、草图与灵感，在这里自由放下。</p>
              </div>
              <div className="page-actions">
                <button className="button" onClick={exportImage}>
                  <Download size={16} /> 导出图片
                </button>
                <button
                  className="button primary"
                  onClick={() => setDialog("share")}
                >
                  <Network size={16} />
                  {info?.sharing ? "正在共享" : "局域网共享"}
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </section>
            {info && !info.shortcutOk && (
              <div className="notice">
                快捷键被占用，可从托盘打开页面，或在设置中更换快捷键。
              </div>
            )}
            {client.error && (
              <div className="notice" role="status">
                {client.error}
                {client.conflicts.length > 0 && (
                  <button onClick={() => client.recover()}>
                    恢复 {client.conflicts.length} 条本机改动为新内容
                  </button>
                )}
                <button onClick={() => void client.tick()}>重试连接</button>
              </div>
            )}
            <section className="workspace">
              <div className="toolbar">
                <div className="tool-group">
                  {(
                    [
                      {
                        id: "select",
                        icon: MousePointer2,
                        label: "选择与拖动",
                      },
                      { id: "text", icon: Type, label: "添加文字" },
                      { id: "pen", icon: Pencil, label: "自由绘图" },
                      { id: "erase", icon: Trash2, label: "删除笔迹" },
                    ] as const
                  ).map(({ id, icon: Icon, label }) => (
                    <button
                      key={id}
                      className={`tool ${tool === id ? "selected" : ""}`}
                      onClick={() => setTool(id)}
                      title={label}
                      aria-label={label}
                      aria-pressed={tool === id}
                    >
                      <Icon size={19} />
                    </button>
                  ))}
                </div>
                <span className="divider" />
                <div className="colors">
                  {COLORS.map((c, i) => (
                    <button
                      key={c}
                      aria-label={["墨色", "松绿", "朱红", "靛蓝"][i]}
                      aria-pressed={color === c}
                      className={`color ${color === c ? "chosen" : ""}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                <select
                  aria-label="画笔粗细"
                  value={width}
                  onChange={(e) => setWidth(Number(e.target.value))}
                >
                  <option value={2}>细笔</option>
                  <option value={4}>中笔</option>
                  <option value={7}>粗笔</option>
                </select>
                <span className="divider" />
                <button
                  className="tool"
                  title="撤销上次操作"
                  aria-label="撤销上次操作"
                  onClick={undoLast}
                >
                  <Undo2 size={18} />
                </button>
                <span className="toolbar-spacer" />
                <span className="paper-label">自由编辑页</span>
                <select
                  aria-label="缩放"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                >
                  <option value={60}>60%</option>
                  <option value={80}>80%</option>
                  <option value={100}>100%</option>
                </select>
              </div>
              <div className="paper-scroll">
                <div style={{ width: 1600 * scale, height: 1000 * scale }}>
                  <div
                    ref={paper}
                    data-testid="paper"
                    className={`paper tool-${tool}`}
                    style={{ transform: `scale(${scale})` }}
                    onPointerDown={down}
                    onPointerMove={move}
                    onPointerUp={up}
                    onPointerCancel={up}
                  >
                    {!visible.length && !stroke && (
                      <div className="empty-page">
                        <div className="empty-symbol">
                          <Pencil size={28} />
                          <span>+</span>
                        </div>
                        <h2>从一个想法开始</h2>
                        <p>点击任意位置写字，或拿起画笔画一画。</p>
                        <span>内容会自动保存，随时回来继续。</span>
                      </div>
                    )}
                    <svg className="ink" viewBox="0 0 1600 1000">
                      {strokes.map(([id, item]) => {
                        const s = item.value as StrokeValue;
                        return (
                          <path
                            key={id}
                            data-testid="stroke"
                            d={pointsPath(s.points)}
                            stroke={s.color}
                            strokeWidth={s.width}
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              pointerEvents:
                                tool === "erase" ? "stroke" : "none",
                              cursor: "crosshair",
                            }}
                            onPointerDown={(e) => {
                              if (tool === "erase") {
                                e.stopPropagation();
                                commit(id, null);
                              }
                            }}
                          />
                        );
                      })}
                      {stroke && (
                        <path
                          d={pointsPath(stroke.points)}
                          stroke={stroke.color}
                          strokeWidth={stroke.width}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                    </svg>
                    {texts.map(([id, item]) => {
                      const value =
                        dragPreview?.id === id
                          ? dragPreview.value
                          : (item.value as TextValue);
                      return (
                        <div
                          key={id}
                          className={`note ${selected === id ? "focused" : ""}`}
                          style={{
                            left: value.x,
                            top: value.y,
                            color: value.color,
                          }}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelected(id);
                          }}
                        >
                          <div
                            className="note-handle"
                            aria-label="拖动便笺"
                            onPointerDown={(e) => {
                              e.preventDefault();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              drag.current = {
                                id,
                                value,
                                x: e.clientX,
                                y: e.clientY,
                              };
                              setDragPreview({ id, value });
                            }}
                          >
                            <GripHorizontal size={17} />
                            <div>
                              <button
                                aria-label="复制便笺"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => copy(value.text)}
                              >
                                <Copy size={13} />
                              </button>
                              <button
                                aria-label="删除便笺"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => commit(id, null)}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          <textarea
                            id={`note-${id}`}
                            aria-label="便笺文字"
                            placeholder="在这里写点什么…"
                            value={value.text}
                            maxLength={10000}
                            onChange={(e) =>
                              client.edit(id, {
                                ...value,
                                text: e.target.value,
                              })
                            }
                            onFocus={() => setSelected(id)}
                            spellCheck={false}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              <footer className="canvas-footer">
                <span>
                  <i className="dot" />
                  {info?.sharing
                    ? "局域网共享已开启"
                    : window.desktop
                      ? "本机工作空间"
                      : "已连接共享工作空间"}
                </span>
                <span>
                  {texts.length} 张便笺 · {strokes.length} 段笔迹{" "}
                  <span className="footer-separator">|</span>{" "}
                  {tool === "pen"
                    ? "按住鼠标绘图"
                    : tool === "text"
                      ? "点击空白处添加文字"
                      : tool === "erase"
                        ? "点击笔迹删除"
                        : "拖动便笺顶部调整位置"}
                </span>
              </footer>
            </section>
            <div className="bottom-caption">
              给办公留一张随手可用的纸。<span>写下来，就不必一直记着。</span>
            </div>
          </main>
        </>
      )}
      {dialog && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={dialog === "share" ? "局域网共享" : "设置"}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="关闭弹窗"
              onClick={() => setDialog(null)}
            >
              <X size={18} />
            </button>
            {dialog === "share" ? (
              <>
                <span className="modal-symbol">
                  <Network size={24} />
                </span>
                <h2>让想法，走到另一张桌面。</h2>
                <p>
                  将这张随手页分享给同一局域网里的同事，文字和绘图会自动同步。
                </p>
                {window.desktop ? (
                  <>
                    <div className="share-state">
                      <span>
                        {info?.sharing ? "共享已开启" : "当前仅自己可见"}
                      </span>
                      <button
                        className="button primary"
                        disabled={working}
                        onClick={() => share(!info?.sharing)}
                      >
                        {working
                          ? "正在处理…"
                          : info?.sharing
                            ? "停止共享"
                            : "开启共享"}
                      </button>
                    </div>
                    {info?.links.map((link) => (
                      <div className="share-link" key={link}>
                        <input
                          aria-label="共享链接"
                          value={link}
                          readOnly
                          onFocus={(e) => e.target.select()}
                        />
                        <button
                          aria-label="复制共享链接"
                          onClick={() => copy(link)}
                        >
                          <Copy size={17} />
                        </button>
                      </div>
                    ))}
                    {info?.sharing && !info.links.length && (
                      <p>未发现局域网地址，请检查 Wi-Fi 或网线连接。</p>
                    )}
                    <div className="modal-tip">
                      同事用浏览器打开链接即可编辑。主机需要保持运行；若无法连接，请检查
                      Windows 防火墙的专用网络权限。
                    </div>
                  </>
                ) : (
                  <div className="modal-tip">
                    你正在访问共享页面。共享开关和邀请链接由主机上的桌面应用管理。
                  </div>
                )}
                <div className="privacy-note">
                  持有链接的人都能查看和编辑整页。仅在可信办公局域网使用，传输未加密；停止共享会立即断开连接。
                </div>
              </>
            ) : (
              <>
                <h2>顺手，才是好工具。</h2>
                <p>桌面应用运行时，随时呼出你的工作页。</p>
                <label className="field-label">
                  全局快捷键
                  <input
                    aria-label="录入全局快捷键"
                    readOnly
                    value={shortcut
                      .replace("Control", "Ctrl")
                      .replace("Super", "Win")
                      .replaceAll("+", " + ")}
                    onKeyDown={captureShortcut}
                    disabled={!window.desktop || working}
                  />
                  <span className="setting-hint">
                    点击输入框后按下组合键，支持字母、数字、方向键和 F1–F24；Esc
                    结束录入。
                  </span>
                </label>
                <button
                  className="button primary"
                  disabled={!window.desktop || working}
                  onClick={() => changeSettings({ shortcut })}
                >
                  保存快捷键
                </button>
                <label className="field-label">
                  外观主题
                  <select
                    aria-label="外观主题"
                    value={theme}
                    disabled={working}
                    onChange={(e) =>
                      changeSettings({
                        theme: e.target.value as DesktopInfo["theme"],
                      })
                    }
                  >
                    <option value="system">跟随系统</option>
                    <option value="light">浅色</option>
                    <option value="dark">深色</option>
                  </select>
                </label>
                <label className="setting-toggle">
                  <span>
                    开机自启动<small>登录 Windows 后自动运行</small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="开机自启动"
                    checked={info?.openAtLogin || false}
                    disabled={!info?.autoStartSupported || working}
                    onChange={(e) =>
                      changeSettings({ openAtLogin: e.target.checked })
                    }
                  />
                </label>
                {!info?.autoStartSupported && (
                  <p className="setting-hint">
                    开机自启动仅在打包后的 Windows 程序中可用。
                  </p>
                )}
                <label className="setting-toggle">
                  <span>
                    开机启动时隐藏到托盘
                    <small>按快捷键即可呼出，不打断工作</small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="开机启动时隐藏到托盘"
                    checked={info?.startMinimized ?? true}
                    disabled={!window.desktop || working}
                    onChange={(e) =>
                      changeSettings({ startMinimized: e.target.checked })
                    }
                  />
                </label>
                <label className="setting-toggle">
                  <span>
                    窗口始终置顶<small>在其他办公窗口之上显示</small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="窗口始终置顶"
                    checked={info?.alwaysOnTop || false}
                    disabled={!window.desktop || working}
                    onChange={(e) =>
                      changeSettings({ alwaysOnTop: e.target.checked })
                    }
                  />
                </label>
                <hr />
                <h3>保存一份完整备份</h3>
                <p>
                  图片仅导出可见内容；完整备份保留全部文字、笔迹和未提交改动。
                </p>
                <button
                  className="button"
                  onClick={() =>
                    download(
                      new Blob(
                        [
                          JSON.stringify(
                            {
                              ...client.base,
                              items: client.view(),
                              conflicts: client.conflicts,
                            },
                            null,
                            2,
                          ),
                        ],
                        { type: "application/json" },
                      ),
                      "Arasn-完整备份.json",
                    )
                  }
                >
                  <Download size={16} /> 导出完整备份
                </button>
                <div className="modal-tip">
                  关闭窗口会隐藏到托盘；完全退出请使用托盘菜单。网页参与者不支持全局快捷键。
                </div>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
