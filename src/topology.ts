import type { Item, NodeValue, TextValue } from "./board";

export const NODE_KINDS = {
  note: "便签", question: "问题", idea: "灵感", task: "待办", file: "文件",
};
export const NODE_STATUSES = { open: "待处理", active: "进行中", done: "已完成" };
export const RELATION_TYPES = { related: "关联", reference: "引用", dependency: "依赖", resolves: "解决", source: "来源", attachment: "附件" };

export function relationCurve(from: Point, to: Point) {
  const bend = Math.max(80, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}

// Layout-only geometry: existing node IDs, relation types and stored endpoints stay unchanged.
export function relationGeometry(a: Bounds, b: Bounds, zoom: number, occupiedLabels: Bounds[] = []) {
  const direction = b.x + b.width / 2 >= a.x + a.width / 2 ? 1 : -1;
  const sourcePort = direction > 0 ? a.x + a.width : a.x;
  const targetPort = direction > 0 ? b.x : b.x + b.width;
  const gap = (targetPort - sourcePort) * direction;
  const short = gap > 0 && gap * zoom < 80;
  const clearance = short ? Math.min(1, gap * zoom / 32) : 1;
  const start = { x: sourcePort + direction * 6 * clearance / zoom, y: a.y + a.height / 2 };
  const end = { x: targetPort - direction * 10 * clearance / zoom, y: b.y + b.height / 2 };
  const normalBend = Math.max(40 / zoom, Math.min(180 / zoom, Math.abs(end.x - start.x) * .5 + Math.abs(end.y - start.y) * .12));
  // Close, separated cards keep monotonic control points instead of folding back.
  const bend = short ? Math.min(normalBend, Math.abs(end.x - start.x) / 2) : normalBend;
  const c1 = { x: start.x + direction * bend, y: start.y }, c2 = { x: end.x - direction * bend, y: end.y };
  const point = (t: number) => {
    const u = 1 - t;
    return { x: u ** 3 * start.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * end.x,
      y: u ** 3 * start.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * end.y };
  };
  const labelWidth = Math.min(180, Math.max(72, Math.hypot(end.x - start.x, end.y - start.y) * zoom - 32));
  let label = { ...point(.5), y: point(.5).y - 22 / zoom };
  const outsideCard = Math.max(a.height, b.height) * zoom / 2 + 28;
  search: for (const t of [.5, .35, .65, .2, .8]) for (const offset of [-22, 38, -44, 60, -66, 82, -outsideCard, outsideCard]) {
    const p = point(t), candidate = { x: p.x, y: p.y + offset / zoom };
    const rect = { x: candidate.x - labelWidth / 2 / zoom, y: candidate.y - 14 / zoom, width: labelWidth / zoom, height: 28 / zoom };
    if (![a, b].some(node => overlaps(rect, node, 8 / zoom)) && !occupiedLabels.some(other => overlaps(rect, other, 4 / zoom))) { label = candidate; break search; }
  }
  return { start, end, c1, c2, label, labelWidth, direction,
    labelBounds: { x: label.x - labelWidth / 2 / zoom, y: label.y - 14 / zoom, width: labelWidth / zoom, height: 28 / zoom },
    path: `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}` };
}

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Bounds = Point & Size;
export type Camera = Point & { zoom: number };
export type CanvasOptions = { roomId: string; grid: boolean; snap: boolean; minimap: boolean; wheel: "auto" | "zoom" | "pan" };
export type TopologyViewport = Camera & { roomId: string };
export type TopologyLayout = Bounds & {
  kind: keyof typeof NODE_KINDS;
  status: keyof typeof NODE_STATUSES;
  hidden?: boolean;
  locked?: boolean;
};
export type TopologyNote = NodeValue | TextValue;

const WORLD_LIMIT = 1_000_000;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const worldLimit = (value: number) => Math.min(WORLD_LIMIT, Math.max(-WORLD_LIMIT, value));

export function noteLayout(x: number, y: number, kind: TopologyLayout["kind"] = "note"): TopologyLayout {
  return { x, y, width: 280, height: 140, kind, status: "open" };
}

export function vacantLayout(layout: TopologyLayout, items: Record<string, Item>, canvasId: string) {
  const occupied = Object.values(items).flatMap(item => item.value?.type === "canvas-node" &&
    item.value.canvasId === canvasId && !item.value.layout.hidden ? [item.value.layout] : []);
  for (let step = 0; step < 40; step++) {
    const candidate = { ...layout, x: worldLimit(layout.x + (step % 5) * 320), y: worldLimit(layout.y + Math.floor(step / 5) * 190) };
    if (!occupied.some(other => overlaps(candidate, other, 24))) return candidate;
  }
  return layout;
}

export function layoutOf(value: TopologyNote) {
  return value.type === "node" ? value.topology : value.topology ?? noteLayout(value.x, value.y);
}

export function sameLayout(a: TopologyLayout, b: TopologyLayout) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height &&
    a.kind === b.kind && a.status === b.status && Boolean(a.hidden) === Boolean(b.hidden) && Boolean(a.locked) === Boolean(b.locked);
}

export function screenToWorld(point: Point, size: Size, camera: Camera): Point {
  return {
    x: camera.x + (point.x - size.width / 2) / camera.zoom,
    y: camera.y + (point.y - size.height / 2) / camera.zoom,
  };
}

export function zoomAt(camera: Camera, size: Size, point: Point, zoom: number, maxZoom = MAX_ZOOM): Camera {
  zoom = Math.min(maxZoom, Math.max(MIN_ZOOM, zoom));
  const anchor = screenToWorld(point, size, camera);
  return {
    x: worldLimit(anchor.x - (point.x - size.width / 2) / zoom),
    y: worldLimit(anchor.y - (point.y - size.height / 2) / zoom),
    zoom,
  };
}

export function viewportBounds(camera: Camera, size: Size): Bounds {
  return { ...screenToWorld({ x: 0, y: 0 }, size, camera),
    width: size.width / camera.zoom, height: size.height / camera.zoom };
}

export function enclosingBounds(items: Bounds[]): Bounds | undefined {
  if (!items.length) return;
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const item of items) {
    x = Math.min(x, item.x);
    y = Math.min(y, item.y);
    right = Math.max(right, item.x + item.width);
    bottom = Math.max(bottom, item.y + item.height);
  }
  return { x, y, width: right - x, height: bottom - y };
}

export function fitCamera(bounds: Bounds | undefined, size: Size): Camera {
  if (!bounds) return DEFAULT_CAMERA;
  const zoom = Math.max(MIN_ZOOM, Math.min(1, (size.width - 64) / bounds.width, (size.height - 64) / bounds.height));
  return { x: worldLimit(bounds.x + bounds.width / 2), y: worldLimit(bounds.y + bounds.height / 2), zoom };
}

export function overlaps(a: Bounds, b: Bounds, margin = 0) {
  return a.x + a.width + margin >= b.x && b.x + b.width + margin >= a.x &&
    a.y + a.height + margin >= b.y && b.y + b.height + margin >= a.y;
}
