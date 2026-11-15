import { useEffect, useState, type CSSProperties } from "react";
import type { Direction } from "../../desktop/engines/gesture-path.mjs";
import type { EdgeInput } from "./TriggerSettings";

export const edgeRegions = {
  "top-left": "左上角", top: "顶部", "top-right": "右上角",
  left: "左侧", right: "右侧", "bottom-left": "左下角", bottom: "底部", "bottom-right": "右下角",
} as const;
export type EdgeRegion = keyof typeof edgeRegions;

const regions = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"] as const;
const regionLabels: Record<EdgeRegion, string> = {
  "top-left": "左上角", top: "上边缘", "top-right": "右上角",
  left: "左边缘", right: "右边缘", "bottom-left": "左下角", bottom: "下边缘", "bottom-right": "右下角",
};
type Zone = { input: EdgeInput; action: string; active: boolean; state: "已启用" | "已禁用" | "未注册" | "已暂停" | "待保存" };
type Timing = Pick<EdgeInput, "width" | "dwellMs" | "cooldownMs">;

function zoneShape(region: EdgeRegion, width: number) {
  const t = Math.max(3, Math.min(24, width || 0) * .55 + 2);
  const left = 10, top = 10, right = 350, bottom = 186, arm = 37;
  switch (region) {
    case "top": return { x: left + arm, y: top, width: right - left - arm * 2, height: t };
    case "bottom": return { x: left + arm, y: bottom - t, width: right - left - arm * 2, height: t };
    case "left": return { x: left, y: top + arm, width: t, height: bottom - top - arm * 2 };
    case "right": return { x: right - t, y: top + arm, width: t, height: bottom - top - arm * 2 };
    default: {
      const x = region.endsWith("left") ? left : right;
      const y = region.startsWith("top") ? top : bottom;
      const dx = x === left ? 1 : -1;
      const dy = y === top ? 1 : -1;
      return { d: `M ${x} ${y} h ${arm * dx} v ${t * dy} h ${(t - arm) * dx} v ${(arm - t) * dy} h ${-t * dx} Z` };
    }
  }
}

function HotzoneTiming({ dwellMs, cooldownMs }: Pick<EdgeInput, "dwellMs" | "cooldownMs">) {
  const [phase, setPhase] = useState<"idle" | "dwell" | "cooldown" | "done">("idle");
  const running = phase === "dwell" || phase === "cooldown";
  const duration = phase === "dwell" ? dwellMs : cooldownMs;
  const valid = dwellMs >= 200 && dwellMs <= 3000 && cooldownMs >= 400 && cooldownMs <= 5000;
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => setPhase(phase === "dwell" ? "cooldown" : "done"), duration);
    return () => window.clearTimeout(timer);
  }, [phase, duration, running]);
  const phaseText = { idle: "等待演示", dwell: "模拟停留中", cooldown: "模拟冷却中", done: "演示结束" };
  return <div className="hotzone-timing">
    <div className="hotzone-timing-header">
      <span role="status">{phaseText[phase]}</span>
      <button className="button" type="button" disabled={!valid}
        onClick={() => setPhase(running ? "idle" : "dwell")}>{running ? "停止演示" : "演示停留"}</button>
    </div>
    <div className="hotzone-meter" aria-hidden="true">
      {running && <span key={phase} data-phase={phase} style={{ "--hotzone-duration": `${duration}ms` } as CSSProperties} />}
    </div>
  </div>;
}

export function HotzoneVisualizer({ zones, selected, disabled, onSelect, onTimingChange }: {
  zones: Partial<Record<EdgeRegion, Zone>>;
  selected?: EdgeRegion;
  disabled?: boolean;
  onSelect(region: EdgeRegion, button: HTMLButtonElement): void;
  onTimingChange?(patch: Partial<Timing>): void;
}) {
  const [hover, setHover] = useState<EdgeRegion>();
  const [focus, setFocus] = useState<EdgeRegion>();
  const current = selected && zones[selected];
  return <figure className="hotzone-visual">
    <div className="trigger-heading">
      <h4>屏幕热区</h4>
      <span className="hotzone-legend"><i />已启用 <i />未启用</span>
    </div>
    <div className="hotzone-monitor" role="group" aria-label="屏幕热区示意图">
      <svg viewBox="0 0 360 210" preserveAspectRatio="none" aria-hidden="true">
        <rect className="hotzone-frame" x="1" y="1" width="358" height="194" rx="10" />
        <rect className="hotzone-screen" x="10" y="10" width="340" height="176" rx="2" />
        <path className="hotzone-frame" d="M163 195h34v8h31v6h-96v-6h31z" />
        {regions.map(region => {
          if (region === "center") return null;
          const zone = zones[region];
          const shape = zoneShape(region, zone?.input.width ?? 4);
          const attributes = { "data-zone": region, "data-active": !!zone?.active,
            "data-selected": selected === region, "data-highlighted": hover === region || focus === region };
          return "d" in shape ? <path key={region} {...attributes} d={shape.d} /> : <rect key={region} {...attributes} {...shape} />;
        })}
      </svg>
      <div className="hotzone-targets">
        {regions.map(region => region === "center" ? <span key={region}>工作区示意</span> :
          <button type="button" key={region} disabled={disabled} aria-pressed={selected === region}
            aria-description={zones[region] ? `${zones[region].action}，${zones[region].state}` : "未配置"}
            onPointerEnter={() => setHover(region)} onPointerLeave={() => setHover(undefined)}
            onFocus={() => setFocus(region)} onBlur={() => setFocus(undefined)}
            onClick={event => onSelect(region, event.currentTarget)}><span>{edgeRegions[region]}</span></button>)}
      </div>
    </div>
    <figcaption>选边缘或热角编辑。色带按设定宽度放大，实际范围以 DIP 数值为准。</figcaption>
    {current && <div className="hotzone-detail">
      <div className="trigger-heading"><strong>{regionLabels[current.input.region]}</strong><span>{current.state}</span></div>
      <p>{current.action}</p>
      {onTimingChange ? <div className="hotzone-fields">
        <label>宽度（DIP）<input type="number" min={4} max={24} value={current.input.width} disabled={disabled}
          onChange={event => onTimingChange({ width: +event.target.value })} /></label>
        <label>停留（ms）<input type="number" min={200} max={3000} value={current.input.dwellMs} disabled={disabled}
          onChange={event => onTimingChange({ dwellMs: +event.target.value })} /></label>
        <label>冷却（ms）<input type="number" min={400} max={5000} value={current.input.cooldownMs} disabled={disabled}
          onChange={event => onTimingChange({ cooldownMs: +event.target.value })} /></label>
      </div> : <div className="hotzone-values">
        <span>实际宽度 <b>{current.input.width} DIP</b></span>
        <span>停留 <b>{current.input.dwellMs} ms</b></span>
        <span>冷却 <b>{current.input.cooldownMs} ms</b></span>
      </div>}
      <HotzoneTiming key={`${current.input.region}-${current.input.dwellMs}-${current.input.cooldownMs}`}
        dwellMs={current.input.dwellMs} cooldownMs={current.input.cooldownMs} />
      <p className="trigger-caption">图内演示，不执行动作。</p>
    </div>}
  </figure>;
}

const vectors: Record<Direction, [number, number]> = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};

export function GestureVisualizer({ path }: { path: Direction[] }) {
  const points = [[0, 0]];
  for (const direction of path) {
    const [x, y] = points.at(-1)!;
    const [dx, dy] = vectors[direction];
    points.push([x + dx, y + dy]);
  }
  const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
  const spanX = Math.max(...xs) - Math.min(...xs), spanY = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min(18, 52 / (spanX || 1), 32 / (spanY || 1));
  const coords = points.map(([x, y]) => [
    34 + (x - Math.min(...xs) - spanX / 2) * scale, 24 + (y - Math.min(...ys) - spanY / 2) * scale,
  ]);
  const [endX, endY] = coords.at(-1)!;
  const [dx, dy] = vectors[path.at(-1)!];
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  return <svg className="trigger-gesture-preview" viewBox="0 0 68 48" aria-hidden="true">
    <polyline points={coords.map(point => point.join(",")).join(" ")} />
    <circle cx={coords[0][0]} cy={coords[0][1]} r="2.6" />
    <path d="M-6 -4 L0 0 L-6 4" transform={`translate(${endX} ${endY}) rotate(${angle})`} />
  </svg>;
}

type MousePart = "Left" | "Right" | "Middle" | "Mouse4" | "Mouse5";
const mouseParts: [MousePart, string][] = [
  ["Left", "左键"], ["Right", "右键"], ["Middle", "中键"], ["Mouse4", "侧键 Mouse4"], ["Mouse5", "侧键 Mouse5"],
];

export function MouseButtonVisualizer({ active }: { active: ReadonlySet<string> }) {
  const [highlight, setHighlight] = useState<MousePart>();
  const part = (name: MousePart) => ({ "data-part": name, "data-active": active.has(name),
    "data-highlighted": highlight === name });
  return <figure className="mouse-visual">
    <svg viewBox="0 0 92 112" aria-hidden="true">
      <path className="mouse-outline" d="M46 3c24 0 41 16 41 42v20c0 28-15 43-41 43S5 93 5 65V45C5 19 22 3 46 3Z" />
      <path {...part("Left")} d="M44 8C24 8 10 21 10 44h32V32h-3V16h5Z" />
      <path {...part("Right")} d="M48 8c20 0 34 13 34 36H50V32h3V16h-5Z" />
      <rect {...part("Middle")} x="42" y="16" width="8" height="19" rx="4" />
      <rect {...part("Mouse4")} x="2" y="49" width="13" height="10" rx="3" />
      <rect {...part("Mouse5")} x="2" y="64" width="13" height="10" rx="3" />
      <g className="mouse-diagram-numbers">
        <text x="27" y="31">1</text><text x="65" y="31">2</text><text x="46" y="47">3</text>
        <text x="24" y="58">4</text><text x="24" y="73">5</text>
      </g>
    </svg>
    <figcaption>
      <strong>鼠标按键位置</strong>
      <ul>{mouseParts.map(([id, name], index) => <li key={id} data-active={active.has(id)}
        onPointerEnter={() => setHighlight(id)} onPointerLeave={() => setHighlight(undefined)}>
        <i aria-hidden="true">{index + 1}</i><span>{name}</span>{active.has(id) && <small>已有启用绑定</small>}
      </li>)}</ul>
      <p>中键仍可能打开浏览器标签或启动自动滚动。侧键的实际位置因设备而异。</p>
    </figcaption>
  </figure>;
}
