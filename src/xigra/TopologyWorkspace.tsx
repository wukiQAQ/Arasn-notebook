import {placeRelationTooltip} from '../relation-tooltip';
import {ExportDialog} from '../ExportDialog';
import {renderFreeExport} from '../render-export';
import {Dialog} from '@base-ui/react/dialog';
import {arrangeGraph} from '../graph-layout';
import { AppSelect } from "./AppSelect";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ArrowLeft, CircleHelp, File, Lightbulb, ListTodo, Maximize, Plus, Redo2, RotateCcw, StickyNote, Trash2, Undo2, X, Minus, Pencil, Link2, MoreHorizontal } from "lucide-react";
import { BoardClient, uid, type Item, type CanvasNodeValue, type CanvasEdgeValue, type CanvasMigrationResult } from "../board";
import {
  DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM, NODE_KINDS, NODE_STATUSES, enclosingBounds, fitCamera,
  RELATION_TYPES, relationCurve, relationGeometry, noteLayout, vacantLayout, overlaps, sameLayout, screenToWorld, viewportBounds, worldLimit, zoomAt,
  type CanvasOptions, type Camera, type Point, type Size, type TopologyLayout, type TopologyNote, type TopologyViewport,
} from "../topology";
import "./topology.css";
import { relationTokens } from "../relation-appearance";
import { FloatingInspector } from "./FloatingInspector";

const KIND_ICONS = { note: StickyNote, question: CircleHelp, idea: Lightbulb, task: ListTodo, file: File };
type Node = { id: string; sourceId: string; missing: boolean; value: TopologyNote; layout: TopologyLayout };
type CanvasValue = CanvasNodeValue | CanvasEdgeValue;
type Change = { id: string; before: CanvasValue | null; after: CanvasValue | null };
type Interaction = { pointer: number; start: Point; camera: Camera; moved: boolean; node?: Node; nodes?: Node[]; mode: "node" | "pan" | "box" | "idle"; additive?: boolean };
type Props = {
  active: boolean;
  client: BoardClient;
  items: Record<string, Item>;
  request?: { id: string; token: number };
  onOpenRecord(id: string): void;
  savedViewport?: TopologyViewport;
  savedOptions?: CanvasOptions;
  onOptions(options: CanvasOptions): void;
  onViewport(camera: Camera): void;
  onBack(): void;
  notify(message: string): void;
  middlePanBlocked?: boolean;
};

function content(text: string, name?: string) {
  if (name?.trim()) return { title: name.trim(), summary: text.trim() };
  const [title = "", ...body] = text.trim().split("\n");
  return { title: title.trim() || "未命名节点", summary: body.join("\n").trim() };
}

function worldPosition(start: Point, delta: Point, zoom: number, direction: number) {
  return { x: worldLimit(start.x + direction * delta.x / zoom), y: worldLimit(start.y + direction * delta.y / zoom) };
}

const kindOptions = Object.entries(NODE_KINDS).filter(([id]) => id !== 'file').map(([value, label]) => ({value: value as Exclude<TopologyLayout['kind'], 'file'>,label,tone:`var(--kind-${value})`}));

export function TopologyWorkspace({ active, client, items, savedViewport, onViewport, onBack, notify, request, onOpenRecord, savedOptions, onOptions, middlePanBlocked }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const [exportOpen,setExportOpen]=useState(false);
  const [arrangement,setArrangement]=useState<{positions:Record<string,Point>;signature:string}|null>(null);
  const [inspector, setInspector] = useState("");
  const [composing, setComposing] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const focusEditor = useRef(false);
  const initialized = useRef("");
  const interaction = useRef<Interaction | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>(DEFAULT_CAMERA);
  const cameraRef = useRef(camera);
  const [preview, setPreview] = useState<(Point & { id: string; positions?: Record<string, Point> }) | null>(null);
  const [panning, setPanning] = useState(false);
  const [kind, setKind] = useState<TopologyLayout["kind"]>("note");
  const [selected, setSelected] = useState("");
  const [selectedMore, setSelectedMore] = useState<string[]>([]);
  const selection = new Set([selected, ...selectedMore].filter(Boolean));
  function selectOnly(id: string) { setSelected(id); setSelectedMore([]); }
  function selectNodes(ids: string[]) { setSelected(ids[0] ?? ""); setSelectedMore(ids.slice(1)); }
  const [options, setOptions] = useState<CanvasOptions>({ roomId: client.base.roomId, grid: true, snap: false, minimap: true, wheel: "auto" });
  const [query, setQuery] = useState("");
  const [popup, setPopup] = useState<{ screen: Point; point: Point; node?: string; create?: boolean }>();
  const [createText, setCreateText] = useState("");
  const [marquee, setMarquee] = useState<{ x: number; y: number; width: number; height: number }>();
  const clipboard = useRef<{ nodes: { id: string; value: CanvasNodeValue; text?: string }[]; edges: CanvasEdgeValue[] } | undefined>(undefined);
  const previewFrame = useRef(0), cameraFrame = useRef(0);
  const pendingPreview = useRef<typeof preview>(null);
  const suppressClick = useRef(0);
  const pasteOffset = useRef(0);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [newNode, setNewNode] = useState("");
  const [history, setHistory] = useState<{ past: Change[][]; future: Change[][] }>({ past: [], future: [] });
  const roomId = client.base.roomId;
  const [migration, setMigration] = useState<CanvasMigrationResult>();
  const [busy, setBusy] = useState(false);
  const [migrationError, setMigrationError] = useState("");
  const enabled = migration?.roomId === roomId && migration.migrated === true;
  const [selectedEdge, setSelectedEdge] = useState("");
  const [focusedEdge,setFocusedEdge]=useState("");
  const [connectTarget,setConnectTarget]=useState("");
  const [hoveredEdge, setHoveredEdge] = useState("");
  const [hoveredNode, setHoveredNode] = useState("");
  const [moreNode, setMoreNode] = useState("");
  const [targetNode, setTargetNode] = useState("");
  const [connection, setConnection] = useState<{ source: string; point: Point } | null>(null);
  const connecting = useRef<{ source: string; pointer: number } | null>(null);
  const space = useRef(false);
  const handledRequest = useRef(-1);
  useEffect(() => { setOptions(savedOptions?.roomId === roomId ? savedOptions : { roomId, grid: true, snap: false, minimap: true, wheel: "auto" }); }, [roomId, savedOptions]);
  useEffect(() => () => { cancelAnimationFrame(previewFrame.current); cancelAnimationFrame(cameraFrame.current); }, []);
  useEffect(() => {
    if (!popup) return;
    const dismiss = (event: globalThis.PointerEvent) => { if (!(event.target as Element).closest(".topology-popup")) setPopup(undefined); };
    document.addEventListener("pointerdown", dismiss); return () => document.removeEventListener("pointerdown", dismiss);
  }, [popup]);
  function changeOptions(patch: Partial<CanvasOptions>) { const next = { ...options, ...patch, roomId }; setOptions(next); onOptions(next); }
  function shownLayout(node: Node) { const point = preview?.positions?.[node.id] ?? (preview?.id === node.id ? preview : undefined); return point ? { ...node.layout, ...point } : node.layout; }
  function queuePreview(value: typeof preview) { pendingPreview.current = value; if (!previewFrame.current) previewFrame.current = requestAnimationFrame(() => { previewFrame.current = 0; setPreview(pendingPreview.current); }); }
  const snapped = (value: number) => worldLimit(options.snap ? Math.round(value / 32) * 32 : value);

  useEffect(() => { setMoreNode(""); }, [selected]);

  useEffect(() => {
    if (!active || !client.ready || !roomId) return;
    let alive = true;
    client.migrateCanvas(true).then(value => { if (alive) { setMigration(value); setMigrationError(""); } })
      .catch(error => { if (alive) setMigrationError(String(error.message ?? error)); });
    return () => { alive = false; };
  }, [active, roomId, client.ready]);

  useEffect(() => {
    const reset = () => { if (interaction.current?.mode === "pan") showCamera(interaction.current.camera, false); cancelAnimationFrame(previewFrame.current); previewFrame.current = 0; setMarquee(undefined); setPopup(undefined); space.current = false; connecting.current = null; setConnectTarget(""); setConnection(null); interaction.current = null; setPreview(null); setPanning(false); };
    const release = (event: globalThis.KeyboardEvent) => { if (event.code === "Space") space.current = false; };
    window.addEventListener("blur", reset); window.addEventListener("keyup", release);
    if (!active) { reset(); setInspector(""); setComposing(false); }
    return () => { window.removeEventListener("blur", reset); window.removeEventListener("keyup", release); };
  }, [active]);

  async function upgrade() {
    setBusy(true);
    try {
      await client.flush();
      if (migration?.revision !== client.base.revision || migration.roomId !== client.base.roomId) {
        setMigration(await client.migrateCanvas(true));
        setMigrationError("工作页已有更改，已刷新预览，请核对后重新启用。");
        return;
      }
      await client.migrateCanvas(false);
      setMigration(await client.migrateCanvas(true));
      notify("关系画布已启用，升级前备份已保存");
    } catch (error) { setMigrationError(String(error instanceof Error ? error.message : error)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!active || !enabled || !request || handledRequest.current === request.token) return;
    handledRequest.current = request.token;
    let cancelled = false;
    void client.addRecordToCanvas(request.id, { ...cameraRef.current, roomId }).then(({ nodeId }) => {
      if (cancelled || client.base.roomId !== roomId) return;
      const value = client.view()[nodeId]?.value;
      if (value?.type !== "canvas-node") return;
      showCamera({ ...cameraRef.current, x: value.layout.x + value.layout.width / 2, y: value.layout.y + value.layout.height / 2 });
      selectOnly(nodeId); setSelectedEdge(""); setRecoveryOpen(false); setInspector("");
    }).catch(error => notify(String(error instanceof Error ? error.message : error)));
    return () => { cancelled = true; };
  }, [active, enabled, request]);

  const nodes = useMemo(() => active ? Object.entries(items).flatMap(([id, item]): Node[] => {
    const value = item.value;
    if (value?.type !== "canvas-node" || value.canvasId !== roomId || value.roomId !== roomId) return [];
    const source = value.contentRef.kind === "record" ? items[value.contentRef.id]?.value : undefined;
    const missing = source?.type !== "text" && source?.type !== "node";
    const body: TopologyNote = !missing ? source : { type: "node", text: value.contentRef.kind === "file" ? "文件引用\n文件预览将在后续批次接入" : "原记录已删除或不可用\n可以移除此引用，原始内容不会受影响", topology: value.layout };
    return [{ id, sourceId: value.contentRef.id, missing, value: body, layout: value.layout }];
  }) : [], [active, items, roomId]);
  const live = useMemo(() => nodes.filter(node => !node.layout.hidden), [nodes]);
  const nodeById = useMemo(() => new Map(live.map(node => [node.id, node])), [live]);
  const hidden = useMemo(() => nodes.filter(node => node.layout.hidden), [nodes]);
  const bounds = useMemo(() => enclosingBounds(live.map(node => node.layout)), [live]);
  const minimapPath = useMemo(() => live.map(({ layout: { x, y, width, height } }) =>
    `M${x} ${y}h${width}v${height}h${-width}Z`).join(""), [live]);
  const current = live.find(node => node.id === selected);
  const edges = Object.entries(items).flatMap(([id, item]) => item.value?.type === "canvas-edge" &&
    item.value.roomId === roomId && item.value.canvasId === roomId ? [{ id, value: item.value }] : []);
  const currentEdge = edges.find(edge => edge.id === selectedEdge);
  const focusedRelation = edges.find(edge => edge.id === hoveredEdge) ?? currentEdge;
  const area = viewportBounds(camera, size);
  const minimapArea = enclosingBounds(bounds ? [bounds, area] : [area])!;
  const mapWidth = Math.max(1, minimapArea.width);
  const mapHeight = Math.max(1, minimapArea.height);
  const mapPadding = Math.max(mapWidth, mapHeight) * 0.06;

  function showCamera(next: Camera, save = true) {
    cameraRef.current = next;
    if (!cameraFrame.current) cameraFrame.current = requestAnimationFrame(() => { cameraFrame.current = 0; setCamera(cameraRef.current); });
    if (save) onViewport(next);
  }

  useLayoutEffect(() => {
    if (!active || !enabled || !viewport.current) return;
    const element = viewport.current;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(element);
    return () => resize.disconnect();
  }, [active, enabled]);

  useLayoutEffect(() => {
    if (!active || !roomId || !size.width || !size.height || initialized.current === roomId) return;
    initialized.current = roomId;
    selectOnly("");
    setHistory({ past: [], future: [] });
    if (savedViewport?.roomId === roomId) showCamera(savedViewport, false);
    else showCamera(fitCamera(bounds, size));
  }, [active, roomId, size, savedViewport, bounds]);

  useLayoutEffect(() => {
    if (current && inspector === current.id && focusEditor.current) {
      focusEditor.current = false;
      editor.current?.focus({ preventScroll: true });
    }
  }, [current, inspector]);

  useEffect(() => {
    if (!active || !enabled || !viewport.current) return;
    const element = viewport.current;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (interaction.current) return;
      const rect = element.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? size.height : 1;
      const base = cameraRef.current;
      const pan = !event.ctrlKey && !event.metaKey && (options.wheel === "pan" || options.wheel === "auto" && event.deltaMode === 0 && (event.deltaX !== 0 || Math.abs(event.deltaY) < 40));
      if (pan) showCamera({ ...base, ...worldPosition(base, { x: event.deltaX * units, y: event.deltaY * units }, base.zoom, 1) });
      else showCamera(zoomAt(base, size, { x: event.clientX - rect.left, y: event.clientY - rect.top }, base.zoom * Math.exp(-event.deltaY * units * .002)));

    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [active, enabled, size, onViewport, options.wheel]);

  function readNode(id: string) {
    const value = client.view()[id]?.value;
    return value?.type === "canvas-node" ? value : undefined;
  }

  function remember(changes: Change | Change[]) {
    const batch = Array.isArray(changes) ? changes : [changes];
    if (batch.length) setHistory(previous => ({ past: [...previous.past, structuredClone(batch)].slice(-100), future: [] }));
  }
  function mutate(changes: Change[]) { for (const change of changes) client.edit(change.id, change.after); remember(changes); }
  function layouts(patches: { id: string; patch: Partial<TopologyLayout> }[]) {
    const changes = patches.flatMap(({ id, patch }): Change[] => { const value = readNode(id); if (!value) return []; const after = { ...value, layout: { ...value.layout, ...patch } }; return sameLayout(value.layout, after.layout) ? [] : [{ id, before: value, after }]; });
    mutate(changes);
    if (changes.some(change => change.id === selected && change.after?.type === "canvas-node" && change.after.layout.hidden)) selectOnly("");
  }
  function editLayout(id: string, patch: Partial<TopologyLayout>) { layouts([{ id, patch }]); }
  function editEdge(id: string, patch: Partial<CanvasEdgeValue> | null) {
    const before = client.view()[id]?.value; if (before?.type !== "canvas-edge") return;
    const after = patch ? { ...before, ...patch } : null;
    if (after && (after.fromNodeId === after.toNodeId || edges.some(edge => edge.id !== id && edge.value.fromNodeId === after.fromNodeId && edge.value.toNodeId === after.toNodeId))) { notify("起点终点不能相同，也不能重复连接"); return; }
    mutate([{ id, before, after }]);
  }
  function replay(redo: boolean) {
    if (busy) return;
    const changes = (redo ? history.future : history.past).at(-1); if (!changes) return;
    if (changes.some(change => JSON.stringify(client.view()[change.id]?.value ?? null) !== JSON.stringify(redo ? change.before : change.after))) { notify("内容已有新修改，保留当前数据"); setHistory({ past: [], future: [] }); return; }
    // Tombstones remain immutable: restoring an edge creates a new identity.
    const replaced = new Map<string, string>();
    for (const change of changes) {
      const value = redo ? change.after : change.before;
      const id = value?.type === "canvas-edge" && client.view()[change.id]?.value === null ? uid() : change.id;
      if (id !== change.id) replaced.set(change.id, id);
      client.edit(id, value);
    }
    selectOnly(""); setSelectedEdge(""); setInspector("");
    const remap = (stack: Change[][]) => stack.map(batch => batch.map(change => replaced.has(change.id) ? { ...change, id: replaced.get(change.id)! } : change));
    setHistory(redo ? { past: remap([...history.past, changes]), future: remap(history.future.slice(0, -1)) } : { past: remap(history.past.slice(0, -1)), future: remap([...history.future, changes]) });
  }
  function copyNodes() {
    pasteOffset.current = 0;
    clipboard.current = { nodes: live.filter(node => selection.has(node.id)).flatMap(node => { const value = readNode(node.id); return value ? [{ id: node.id, value: structuredClone(value), text: node.value.text }] : []; }), edges: edges.filter(edge => selection.has(edge.value.fromNodeId) && selection.has(edge.value.toNodeId)).map(edge => structuredClone(edge.value)) };
    notify(`已复制 ${clipboard.current.nodes.length} 个节点`);
  }
  async function pasteNodes(point?: Point) {
    if (busy || !clipboard.current?.nodes.length) return;
    if (clipboard.current.nodes.some(entry => entry.value.roomId !== roomId)) { notify("请在当前工作页重新复制节点"); return; } setBusy(true);
    pasteOffset.current += 40;
    const clip = clipboard.current, ids: string[] = [], mapping = new Map<string, string>(), changes: Change[] = [];
    const minX = Math.min(...clip.nodes.map(node => node.value.layout.x)), minY = Math.min(...clip.nodes.map(node => node.value.layout.y));
    try {
      for (const entry of clip.nodes) {
        const layout = { ...entry.value.layout, x: snapped(entry.value.layout.x + (point ? point.x - minX : pasteOffset.current)), y: snapped(entry.value.layout.y + (point ? point.y - minY : pasteOffset.current)) };
        let id: string;
        if (entry.value.contentRef.kind === "record") id = await client.createCanvasRecord(layout, entry.text ?? "");
        else { id = uid(); client.edit(id, { ...entry.value, layout }); }
        const value = readNode(id); if (!value) throw new Error("粘贴节点未创建");
        mapping.set(entry.id, id); ids.push(id);
        changes.push({ id, before: { ...value, layout: { ...layout, hidden: true } }, after: value });
      }
      for (const edge of clip.edges) {
        const fromNodeId = mapping.get(edge.fromNodeId), toNodeId = mapping.get(edge.toNodeId);
        if (!fromNodeId || !toNodeId) continue;
        const id = uid(), after = { ...edge, roomId, canvasId: roomId, fromNodeId, toNodeId };
        client.edit(id, after); changes.push({ id, before: null, after });
      }
      await client.flush(); remember(changes); selectNodes(ids);
    } catch (error) { notify(String(error instanceof Error ? error.message : error)); if (changes.length) remember(changes); }
    finally { setBusy(false); }
  }
  function layoutSignature(){return JSON.stringify(Object.entries(client.view()).filter(([,i])=>i.value?.type==='canvas-node'||i.value?.type==='canvas-edge'));}
  function arrange() {
    try {const movable=selection.size>1?selection:new Set(live.map(n=>n.id));
      const positions=arrangeGraph(live,edges.map(e=>e.value),movable);
      setArrangement({positions,signature:layoutSignature()});
    }catch(e){notify((e as Error).message);}
  }

  async function create(center?: Point, text = "") {
    if (!client.ready || !enabled || busy) return;
    const point = center ?? cameraRef.current;
    const layout = center ? noteLayout(worldLimit(point.x - 140), worldLimit(point.y - 70), kind)
      : vacantLayout(noteLayout(worldLimit(point.x - 140), worldLimit(point.y - 70), kind), client.view(), roomId);
    if (!center) {
      // Keep the new title and grab area visible when repeatedly adding at the same view center.
      for (let step = 0; step < 8 && live.some(({ layout: other }) =>
        Math.abs(other.x - layout.x) < 20 && Math.abs(other.y - layout.y) < 20); step++) {
        layout.x = worldLimit(layout.x + 26);
        layout.y = worldLimit(layout.y + 26);
      }
    }
    layout.x = snapped(layout.x); layout.y = snapped(layout.y);
    setBusy(true);
    let id: string;
    try { id = await client.createCanvasRecord(layout, text); }
    catch (error) { notify(String(error instanceof Error ? error.message : error)); return; }
    finally { setBusy(false); }
    const created = readNode(id); if (created) remember({ id, before: { ...created, layout: { ...layout, hidden: true } }, after: created });
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) setNewNode(id);
    focusEditor.current = true;
    selectOnly(id);
    setInspector(id);
    setRecoveryOpen(false);
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button === 1 && middlePanBlocked) return;
    if (busy || (event.button !== 0 && event.button !== 1) || interaction.current || connecting.current) return;
    const pan = event.button === 1 || space.current;
    if ((event.target as Element).closest("input, select, textarea") || !pan && (event.target as Element).closest("[data-anchor], [data-edge], button, .topology-node-actions")) return;
    const target = (event.target as Element).closest<HTMLElement>("[data-topology-node]");
    const node = !pan && target ? nodeById.get(target.dataset.topologyNode!) : undefined;
    event.preventDefault(); setPopup(undefined);
    if (node) target?.focus({ preventScroll: true }); else event.currentTarget.focus({ preventScroll: true });
    const capture = node && target ? target : event.currentTarget; capture.setPointerCapture(event.pointerId);
    interaction.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, camera: cameraRef.current, moved: false, node,
      nodes: node ? selection.has(node.id) ? live.filter(n => selection.has(n.id)) : [node] : undefined,
      mode: pan ? "pan" : node ? "node" : event.shiftKey ? "box" : "pan", additive: event.shiftKey };
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (connecting.current?.pointer === event.pointerId) {
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-topology-node]')?.dataset.topologyNode;
      setConnectTarget(target&&target!==connecting.current.source&&!edges.some(e=>e.value.fromNodeId===connecting.current!.source&&e.value.toNodeId===target)?target:'');
      const rect = event.currentTarget.getBoundingClientRect();
      setConnection({ source: connecting.current.source, point: screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, size, cameraRef.current) }); return;
    }
    const gesture = interaction.current; if (!gesture || gesture.pointer !== event.pointerId) return;
    const delta = { x: event.clientX - gesture.start.x, y: event.clientY - gesture.start.y };
    if (!gesture.moved && Math.hypot(delta.x, delta.y) < 4) return; gesture.moved = true;
    if (gesture.mode === "node" && gesture.node) {
      const positions = Object.fromEntries(gesture.nodes!.map(node => [node.id, worldPosition(node.layout, delta, gesture.camera.zoom, 1)]));
      queuePreview({ id: gesture.node.id, ...positions[gesture.node.id], positions });
    } else if (gesture.mode === "pan") { setPanning(true); showCamera({ ...gesture.camera, ...worldPosition(gesture.camera, delta, gesture.camera.zoom, -1) }, false); }
    else if (gesture.mode === "box") {
      const rect = event.currentTarget.getBoundingClientRect();
      setMarquee({ x: Math.min(event.clientX, gesture.start.x) - rect.left, y: Math.min(event.clientY, gesture.start.y) - rect.top, width: Math.abs(delta.x), height: Math.abs(delta.y) });
    }
  }

  function connect(source: string, target: string) {
    if (!client.ready || !live.some(node => node.id === source) || !live.some(node => node.id === target) || target === source) return;
    if (edges.some(({ value }) => value.fromNodeId === source && value.toNodeId === target)) { notify("这两个节点已有连接"); return; }
    const id = uid();
    mutate([{ id, before: null, after: { type: "canvas-edge", roomId, canvasId: roomId, fromNodeId: source, toNodeId: target, relationType: "related", label: "", direction: "forward" } }]);
    setSelectedEdge(id); selectOnly(""); setRecoveryOpen(false); setTargetNode(""); setInspector(`edge:${id}`);
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    if (connecting.current?.pointer === event.pointerId) {
      setConnectTarget("");
      const source = connecting.current.source;
      connecting.current = null; setConnectTarget(""); setConnection(null);
      if (event.type !== "pointerup") return;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-topology-node]")?.dataset.topologyNode;
      if (!target || target === source) { notify("将连接点拖到另一个节点上"); return; }
      connect(source, target);
      return;
    }
    const gesture = interaction.current; if (!gesture || gesture.pointer !== event.pointerId) return;
    interaction.current = null; cancelAnimationFrame(previewFrame.current); previewFrame.current = 0; setPreview(null); setPanning(false); setMarquee(undefined);
    if (event.type !== "pointerup") { if (gesture.mode === "pan") showCamera(gesture.camera, false); return; }
    const delta = { x: event.clientX - gesture.start.x, y: event.clientY - gesture.start.y };
    if (gesture.moved) suppressClick.current = performance.now() + 100;
    if (gesture.mode === "node" && gesture.moved) {
      layouts(gesture.nodes!.map(node => { const point = worldPosition(node.layout, delta, gesture.camera.zoom, 1); return { id: node.id, patch: { x: snapped(point.x), y: snapped(point.y) } }; }));
      if (!selection.has(gesture.node!.id)) selectOnly(gesture.node!.id);
    } else if (gesture.mode === "pan" && gesture.moved) showCamera({ ...gesture.camera, ...worldPosition(gesture.camera, delta, gesture.camera.zoom, -1) });
    else if (gesture.mode === "box" && gesture.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      const a = screenToWorld({ x: gesture.start.x - rect.left, y: gesture.start.y - rect.top }, size, gesture.camera);
      const b = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, size, gesture.camera);
      const box = { x: Math.min(a.x,b.x), y: Math.min(a.y,b.y), width: Math.abs(a.x-b.x), height: Math.abs(a.y-b.y) };
      selectNodes([...new Set([...selection, ...live.filter(node => overlaps(box, node.layout)).map(node => node.id)])]); setSelectedEdge("");
    } else if (!gesture.node && !gesture.moved && event.button === 0) { selectOnly(""); setSelectedEdge(""); setMoreNode(""); setInspector(""); }
  }

  function zoomBy(factor: number) {
    showCamera(zoomAt(cameraRef.current, size, { x: size.width / 2, y: size.height / 2 }, cameraRef.current.zoom * factor));
  }

  function shortcuts(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const target = event.target as HTMLElement;
    if (event.key === "Escape") { setFocusedEdge("");setHoveredEdge("");
      if (popup) { event.preventDefault(); setPopup(undefined); return; }
      if (moreNode) { event.preventDefault(); setMoreNode(""); return; }
      if (connection) { event.preventDefault(); connecting.current = null; setConnectTarget(""); setConnection(null); return; }
      if (inspector) { event.preventDefault(); closeInspector(); return; }
      setSelectedEdge(""); connecting.current = null; setConnectTarget(""); setConnection(null);
      event.preventDefault();
      selectOnly("");
      setRecoveryOpen(false);
      viewport.current?.focus({ preventScroll: true });
      return;
    }
    if (target.closest("input, textarea, select")) return;
    if (event.code === "Space") { if (target.closest("button, summary, a")) return; event.preventDefault(); space.current = true; return; }
    if (event.key === "Delete" && currentEdge) { event.preventDefault(); editEdge(currentEdge.id, null); setSelectedEdge(""); return; }
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "c" && selection.size) { event.preventDefault(); copyNodes(); return; }
    if ((event.ctrlKey || event.metaKey) && key === "v") { event.preventDefault(); void pasteNodes(); return; }
    if ((event.ctrlKey || event.metaKey) && key === "a") { event.preventDefault(); selectNodes(live.map(node => node.id)); return; }
    if ((event.ctrlKey || event.metaKey) && (key === "z" || key === "y")) {
      event.preventDefault();
      if (!event.repeat) replay(key === "y" || event.shiftKey);
    } else if (event.key === "Delete" && current && (target === viewport.current || target.dataset.topologyNode === current.id)) {
      event.preventDefault();
      layouts([...selection].map(id => ({ id, patch: { hidden: true } })));
      viewport.current?.focus({ preventScroll: true });
    } else if (target === viewport.current) {
      const steps: Record<string, Point> = { ArrowUp: { x: 0, y: -64 }, ArrowDown: { x: 0, y: 64 },
        ArrowLeft: { x: -64, y: 0 }, ArrowRight: { x: 64, y: 0 } };
      if (Object.hasOwn(steps, event.key)) {
        event.preventDefault();
        showCamera({ ...camera, ...worldPosition(camera, steps[event.key], camera.zoom, 1) });
      }
    }
  }

  const relationLabels: { x: number; y: number; width: number; height: number }[] = [];
  const inspectorLayout = current ? shownLayout(current) : undefined;
  const inspectorAnchor = inspectorLayout ? { x: size.width / 2 + (inspectorLayout.x - camera.x) * camera.zoom,
    y: size.height / 2 + (inspectorLayout.y - camera.y) * camera.zoom, width: inspectorLayout.width * camera.zoom, height: inspectorLayout.height * camera.zoom }
     : (() => { const from = currentEdge && nodeById.get(currentEdge.value.fromNodeId), to = currentEdge && nodeById.get(currentEdge.value.toNodeId); return from && to ? { x: size.width/2 + ((from.layout.x + from.layout.width + to.layout.x)/2 - camera.x)*camera.zoom, y: size.height/2 + ((from.layout.y + from.layout.height/2 + to.layout.y + to.layout.height/2)/2 - camera.y)*camera.zoom, width: 0, height: 0 } : { x: size.width/2, y: 24, width: 0, height: 0 }; })();
  const tooltipEdge=edges.find(e=>e.id===(hoveredEdge||focusedEdge));
  const tooltipGeometry=tooltipEdge&&(()=>{const a=nodeById.get(tooltipEdge.value.fromNodeId),b=nodeById.get(tooltipEdge.value.toNodeId);return a&&b?relationGeometry(shownLayout(a),shownLayout(b),camera.zoom):undefined;})();
  const tooltipPosition=tooltipGeometry?placeRelationTooltip({x:size.width/2+(tooltipGeometry.label.x-camera.x)*camera.zoom,y:size.height/2+(tooltipGeometry.label.y-camera.y)*camera.zoom},size,live.map(n=>{const p=shownLayout(n);return {x:size.width/2+(p.x-camera.x)*camera.zoom,y:size.height/2+(p.y-camera.y)*camera.zoom,width:p.width*camera.zoom,height:p.height*camera.zoom};})):undefined;
  function closeInspector() {
    if (composing) return;
    setInspector(""); setRecoveryOpen(false);
    const node = viewport.current?.querySelector<HTMLElement>(`[data-topology-node="${selected}"]`);
    (node ?? viewport.current)?.focus({ preventScroll: true });
  }

  if (active && !enabled) return <section className="topology-workspace topology-upgrade" aria-label="关系画布">
    <h1>关系画布</h1><p>将现有便签放进可连接的内容空间。</p>
    <p>启用时会先备份，再保留原记录并建立画布引用。旧版应用无法直接打开升级后的数据库。</p>
    {migration && <p>将整理 {migration.added} 个节点；原正文、文件与纸面位置保持不变。</p>}
    {migrationError && <p role="alert">{migrationError}</p>}
    <button className="button topology-primary" disabled={busy || !migration || !client.ready} onClick={() => void upgrade()}>{busy ? "正在备份并启用…" : "备份并启用关系画布"}</button>
    <button className="button" onClick={onBack}>返回工作页</button>
  </section>;

  return <section id={active ? "workspace" : undefined} className="topology-workspace" hidden={!active}
    tabIndex={-1} aria-label="关系画布" onKeyDown={shortcuts}>
    {arrangement&&<Dialog.Root open onOpenChange={open=>{if(!open)setArrangement(null);}}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="modal xigra-record-dialog correctness-dialog" onKeyDown={e=>e.stopPropagation()}>
      <Dialog.Title>整理节点</Dialog.Title><Dialog.Description>将按连接方向重新排列 {Object.keys(arrangement.positions).length} 个节点。循环关系放在同层，按节点实际尺寸避让；锁定及未选节点保留位置。多选时仅整理所选节点。手动位置将改变，正文、引用与关系类型保持不变。</Dialog.Description>
      <p>确认后可用一次“撤销节点操作”恢复。本操作不保证消除所有交叉连线。</p><div className="dialog-actions"><button className="button" onClick={()=>setArrangement(null)}>取消</button><button className="button primary" onClick={()=>{if(layoutSignature()!==arrangement.signature){notify('画布已有新修改，请重新整理');setArrangement(null);return;}layouts(Object.entries(arrangement.positions).map(([id,patch])=>({id,patch})));setArrangement(null);}}>确认整理</button></div>
    </Dialog.Popup></Dialog.Portal></Dialog.Root>}
    {exportOpen&&<ExportDialog initialViewport={false} close={()=>setExportOpen(false)} run={async(view,multiplier)=>{
      const snapshot=live.map(n=>[n.id,{version:0,value:{type:'text',text:(n.value.title?n.value.title+'\n':'')+n.value.text,color:'#263449',...n.layout,fontSize:16}}] as [string,Item]);
      const blob=await renderFreeExport(snapshot,view?viewportBounds(cameraRef.current,size):undefined,multiplier,cameraRef.current.zoom,()=>Promise.reject(new Error('关系图文件原图尚不支持')),structuredClone(edges.map(e=>e.value)));
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Arasn-关系画布.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    }}/>}
    <header className="topology-toolbar">
      <div className="topology-heading">
        <button className="icon-button" aria-label="返回工作页" title="返回工作页" onClick={onBack}><ArrowLeft size={17} /></button>
        <h1>关系画布</h1><span>{live.length} 个节点</span>
      </div>
      <div className="topology-tools">
        <AppSelect<typeof kind> label="新节点类型" value={kind} onValueChange={setKind} options={kindOptions} />
        <input className="topology-select topology-search" aria-label="搜索节点" placeholder="搜索节点…" value={query} onChange={event => setQuery(event.target.value)} />
        <button className="button" onClick={()=>setExportOpen(true)}>导出关系图</button>
        <button className="button" aria-label="整理节点" title={busy ? "正在处理操作" : live.length ? "按关系整理节点" : "添加节点后可整理"} disabled={!live.length || busy} onClick={arrange}>整理节点</button>
        <details className="topology-options"><summary>画布设置</summary><div>
          <label><input type="checkbox" aria-label="显示网格" checked={options.grid} onChange={event => changeOptions({ grid: event.target.checked })}/>显示网格</label>
          <label><input type="checkbox" aria-label="网格吸附" checked={options.snap} onChange={event => changeOptions({ snap: event.target.checked })}/>网格吸附</label>
          <label><input type="checkbox" aria-label="显示小地图" checked={options.minimap} onChange={event => changeOptions({ minimap: event.target.checked })}/>显示小地图</label>
          <label>滚轮行为<AppSelect label="滚轮行为" value={options.wheel} onValueChange={next => changeOptions({ wheel: next as CanvasOptions["wheel"] })} options={[{value:'auto',label:'自动识别'},{value:'zoom',label:'滚轮缩放'},{value:'pan',label:'触控板平移'}]} /></label>
          <small>自动：整格滚轮缩放，细小/双轴滚动平移；Ctrl/双指捏合始终缩放。</small>
        </div></details>
        <button className="button topology-primary" disabled={!client.ready || busy || !enabled} onClick={() => void create()}><Plus size={16} />新建节点</button>
        <div className="topology-toolgroup" role="group" aria-label="节点操作历史">
          <button className="icon-button" aria-label="撤销节点操作" title={busy ? '正在处理操作' : history.past.length ? '撤销 · Ctrl+Z' : '暂无可撤销的节点操作'} disabled={busy || !history.past.length} onClick={() => replay(false)}><Undo2 size={17} /></button>
          <button className="icon-button" aria-label="重做节点操作" title={busy ? '正在处理操作' : history.future.length ? '重做 · Ctrl+Shift+Z' : '暂无可重做的节点操作'} disabled={busy || !history.future.length} onClick={() => replay(true)}><Redo2 size={17} /></button>
          <button className="icon-button" aria-label="已移除节点" title="已移除节点" aria-pressed={recoveryOpen} onClick={() => { selectOnly(""); setSelectedEdge(""); setRecoveryOpen(!recoveryOpen); setInspector(recoveryOpen ? "" : "recovery"); }}><Trash2 size={16} /></button>
        </div>
      </div>
    </header>
    <div className="topology-frame">
      <div className="topology-surface" ref={surface}>
      <div className="topology-viewport" data-motion="static" ref={viewport} tabIndex={0} role="region" aria-label="节点画布"
        aria-describedby="topology-controls-help" data-panning={panning || undefined}
        style={{ backgroundImage: options.grid ? undefined : "none", backgroundSize: `${32 * camera.zoom}px ${32 * camera.zoom}px`,
          backgroundPosition: `${(size.width / 2 - camera.x * camera.zoom) % (32 * camera.zoom)}px ${(size.height / 2 - camera.y * camera.zoom) % (32 * camera.zoom)}px` }}
        onContextMenu={event => {
          event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect();
          const id = (event.target as Element).closest<HTMLElement>("[data-topology-node]")?.dataset.topologyNode;
          if (id && !selection.has(id)) selectOnly(id);
          setPopup({ screen: { x: event.clientX - rect.left, y: event.clientY - rect.top }, point: screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, size, cameraRef.current), node: id });
        }}
        onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}
        onDoubleClick={event => {
          if ((event.target as Element).closest("[data-topology-node], [data-edge]")) return;
          const rect = event.currentTarget.getBoundingClientRect();
          setCreateText(""); setPopup({ screen: { x: event.clientX - rect.left, y: event.clientY - rect.top }, point: screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, size, cameraRef.current), create: true });
        }}>
        <div className="topology-world" style={{ transform: `translate(${size.width / 2 - camera.x * camera.zoom}px, ${size.height / 2 - camera.y * camera.zoom}px) scale(${camera.zoom})` }}>
          <svg className="relation-edges" aria-label="节点关系" style={{ "--relation-zoom": camera.zoom } as CSSProperties}>
            <defs>{Object.keys(RELATION_TYPES).flatMap(type => [false, true].map(emphasis => <marker key={`${type}-${emphasis}`} id={`relation-arrow-${type}-${emphasis}`} className="relation-arrow-marker" data-emphasis={emphasis || undefined} style={relationTokens(type as keyof typeof RELATION_TYPES) as CSSProperties} markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={10 / camera.zoom} markerHeight={10 / camera.zoom} orient="auto-start-reverse"><path d="M 2 2 L 8 5 L 2 8" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></marker>))}</defs>
            {edges.map(({ id, value }) => {
              const from = nodeById.get(value.fromNodeId), to = nodeById.get(value.toNodeId);
              if (!from || !to) return null;
              const a = shownLayout(from);
              const b = shownLayout(to);
              const geometry = relationGeometry(a, b, camera.zoom, relationLabels);
              relationLabels.push(geometry.labelBounds);
              const path = geometry.path;
              const related = selection.has(from.id) || selection.has(to.id);
              const type = value.relationType ?? "related";
              const sameType = !!currentEdge && (currentEdge.value.relationType ?? "related") === type;
              const arrow = `url(#relation-arrow-${type}-${selectedEdge === id || related || sameType || hoveredEdge === id})`;
              return <g key={id} data-edge={id} data-relation={type} data-selected={selectedEdge === id || related || undefined}
                data-peer={sameType && selectedEdge !== id || undefined}
                style={relationTokens(type) as CSSProperties}
                data-muted={(!!selected || !!selectedEdge) && !related && selectedEdge !== id && !sameType || undefined}
                onPointerEnter={() => setHoveredEdge(id)} onPointerLeave={() => setHoveredEdge("")}
                onFocus={() => setFocusedEdge(id)} onBlur={() => setFocusedEdge("")}>

                <path className="relation-line" d={path} markerEnd={value.direction !== "none" ? arrow : undefined} markerStart={value.direction === "both" ? arrow : undefined} />
                <path className="relation-hit" d={path} role="button" tabIndex={0} aria-describedby={(hoveredEdge||focusedEdge)===id&&tooltipPosition&&!inspector&&!connection?"relation-compact-tooltip":undefined} aria-label={`选择关系：${content(from.value.text, from.value.title).title} 到 ${content(to.value.text, to.value.title).title}（${RELATION_TYPES[type]}）${value.label?`，${value.label}`:""}`} onClick={event => { event.stopPropagation(); setSelectedEdge(id); selectOnly(""); setInspector(`edge:${id}`); }} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); setSelectedEdge(id); selectOnly(""); setInspector(`edge:${id}`); } }} />
                <foreignObject className="relation-label-wrap" transform={`translate(${geometry.label.x} ${geometry.label.y}) scale(${1 / camera.zoom})`} x={-geometry.labelWidth / 2} y={-14} width={geometry.labelWidth} height={28}>
                  <div className="relation-label-position"><span className="relation-label">{RELATION_TYPES[type]}{value.label ? ` · ${value.label}` : ""}</span></div>
                </foreignObject>
              </g>;
            })}
            {connection && (() => { const from = live.find(node => node.id === connection.source); return from ? <path className="relation-line relation-draft" d={relationCurve({ x: from.layout.x + from.layout.width, y: from.layout.y + from.layout.height / 2 }, connection.point)} /> : null; })()}
          </svg>
          {live.filter(node => selection.has(node.id) || node.id === preview?.id || overlaps(area, node.layout, 200 / camera.zoom)).map(node => {
            const { id, value, layout } = node;
            const { title, summary } = content(value.text, value.title);
            const Glyph = KIND_ICONS[layout.kind];
            const bodySync = client.saveState(node.sourceId), layoutSync = client.saveState(id);
            const sync = bodySync.tone === 'error' || layoutSync.tone === 'saved' ? bodySync : layoutSync;
            const position = shownLayout(node);
            const screenRight = size.width / 2 + (position.x + layout.width - camera.x) * camera.zoom;
            const actionInset = (Math.max(0, screenRight - size.width + 8) - Math.max(0, 206 - screenRight)) / camera.zoom;
            const relationFocus = focusedRelation && (focusedRelation.value.fromNodeId === id || focusedRelation.value.toNodeId === id);
            const actionsBelow = size.height / 2 + (position.y - camera.y) * camera.zoom < 60;
            return <article className="topology-node" key={id} tabIndex={0} data-topology-node={id}
              onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode("")} data-connectable={connectTarget===id?"true":undefined} data-kind={layout.kind} data-created={newNode === id || undefined} data-dragging={!!preview?.positions?.[id] || preview?.id === id || undefined}
              data-relation-focus={relationFocus || undefined} aria-label={`${NODE_KINDS[layout.kind]}，${title}`} data-selected={selection.has(id) || undefined}
              style={{ left: position.x, top: position.y, width: layout.width, height: layout.height, ...(relationFocus ? relationTokens(focusedRelation.value.relationType ?? "related") : {}) } as CSSProperties}
              onClick={event => { if (space.current || composing || performance.now() < suppressClick.current) return; if (connection && connection.source !== id) { connect(connection.source, id); setConnection(null); return; } setRecoveryOpen(false); if (event.shiftKey) selectNodes(selection.has(id) ? [...selection].filter(key => key !== id) : [...selection, id]); else selectOnly(id); setSelectedEdge(""); setInspector(previous => previous === id ? previous : ""); }}
              onKeyDown={event => { if (event.key === "Enter" && !(event.target as Element).closest("button")) { selectOnly(id); setSelectedEdge(""); setInspector(""); } }}
              onDoubleClick={event => { if (composing || performance.now() < suppressClick.current || (event.target as Element).closest("button, .topology-node-actions")) return; event.stopPropagation(); focusEditor.current = true; selectOnly(id); setInspector(id); }}
              onAnimationEnd={() => setNewNode(previous => previous === id ? "" : previous)}>
              <span className="topology-node-meta" data-drag-handle><span><Glyph size={15} />{NODE_KINDS[layout.kind]}</span>
                <span className="topology-node-status" data-status={layout.status}>{layout.kind === "question" && layout.status === "done" ? "已解决" : NODE_STATUSES[layout.status]}</span></span>
              <strong>{title}</strong><span className="topology-node-summary">{summary || "双击查看正文"}</span>
              <span className="topology-node-footer"><span className="topology-record-source">原记录摘要</span><span className="node-sync" data-tone={node.missing ? "error" : sync.tone}>{node.missing ? "原内容不可用" : sync.label}</span></span>
              {(id === selected || id === hoveredNode) && <div className="topology-node-actions" role="group" aria-label="节点操作" data-below={actionsBelow || undefined} style={{ scale: 1 / camera.zoom, right: actionInset }}
                onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
                <button className="topology-action-edit" aria-label="编辑节点" onClick={() => { selectOnly(id); setSelectedEdge(""); focusEditor.current = true; setInspector(id); }}><Pencil size={15}/>编辑</button>
                {id === selected && <>
                  <button aria-label="连接节点" aria-pressed={connection?.source === id} onClick={() => { setConnection(connection?.source === id ? null : { source: id, point: { x: layout.x + layout.width + 40, y: layout.y + layout.height / 2 } }); setMoreNode(""); }}><Link2 size={15}/>连接</button>
                  <button aria-label="更多节点操作" aria-expanded={moreNode === id} onClick={() => setMoreNode(moreNode === id ? "" : id)}><MoreHorizontal size={16}/></button>
                  {moreNode === id && <div className="topology-node-menu">
                    <button onClick={() => { setInspector(id); setMoreNode(""); }}>节点属性</button>
                    <button disabled={node.missing} onClick={() => onOpenRecord(node.sourceId)}>打开原记录</button>
                    <button onClick={() => { editLayout(id, { hidden: true }); setMoreNode(""); }}><Trash2 size={14}/>移除节点</button>
                  </div>}
                </>}
              </div>}
              <button style={{ scale: 1 / camera.zoom }} className="relation-anchor relation-anchor-in" aria-label={`连接到 ${title}`} data-anchor onPointerDown={event => { if (event.button === 0 && !space.current) event.stopPropagation(); }} onClick={event => event.stopPropagation()} />
              <button style={{ scale: 1 / camera.zoom }} className="relation-anchor relation-anchor-out" aria-label={`从 ${title} 创建连接`} data-anchor onClick={event => event.stopPropagation()} onPointerDown={event => {
                if (event.button !== 0 || space.current) return;
                event.stopPropagation(); event.preventDefault();
                viewport.current?.focus({ preventScroll: true });
                viewport.current?.setPointerCapture(event.pointerId);
                connecting.current = { source: id, pointer: event.pointerId };
                setConnection({ source: id, point: { x: layout.x + layout.width + 40, y: layout.y + layout.height / 2 } });
              }} />
            </article>;
          })}
        </div>
        {marquee && <div className="topology-marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.width, height: marquee.height }} aria-hidden="true"/>}
        {!live.length && <div className="topology-empty"><StickyNote size={24} /><strong>从一个节点开始</strong><span>双击空白处，或用「新建节点」把想法放到画布上。</span></div>}
      </div>
      {tooltipEdge&&tooltipPosition&&!inspector&&!connection&&<div id="relation-compact-tooltip" role="tooltip" className="relation-compact-tooltip" style={{left:tooltipPosition.x,top:tooltipPosition.y,width:tooltipPosition.width}}><strong>{RELATION_TYPES[tooltipEdge.value.relationType??'related']}</strong><span>{tooltipEdge.value.label||'点击连接线编辑关系属性'}</span></div>}
      {query.trim() && <div className="topology-search-results" role="group" aria-label="搜索结果">{live.filter(node => `${node.value.title ?? ""} ${node.value.text}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0,8).map(node => <button key={node.id} onClick={() => { selectOnly(node.id); setSelectedEdge(""); setInspector(""); showCamera({ ...cameraRef.current, x: node.layout.x + node.layout.width/2, y: node.layout.y + node.layout.height/2, zoom: Math.max(.7, cameraRef.current.zoom) }); setQuery(""); }}>{content(node.value.text, node.value.title).title}</button>)}{!live.some(node => `${node.value.title ?? ""} ${node.value.text}`.toLowerCase().includes(query.trim().toLowerCase())) && <span>没有匹配节点</span>}</div>}
      {popup && <div className="topology-popup" role={popup.create ? "dialog" : "menu"} aria-label={popup.create ? "快捷创建节点" : "画布上下文菜单"} style={{ left: Math.max(8, Math.min(popup.screen.x, size.width - 258)), top: Math.max(8, Math.min(popup.screen.y, size.height - 260)) }} onKeyDown={event => { if (event.key === "Escape") { setFocusedEdge("");setHoveredEdge(""); event.stopPropagation(); setPopup(undefined); } }}>
        {popup.create ? <form onSubmit={event => { event.preventDefault(); const point = popup.point; setPopup(undefined); void create(point, createText); }}>
          <strong>快捷创建节点</strong><input autoFocus className="topology-select" aria-label="新节点内容" placeholder="输入内容…" value={createText} onChange={event => setCreateText(event.target.value)} maxLength={10000}/>
          <AppSelect<typeof kind> label="快捷节点类型" value={kind} onValueChange={setKind} options={kindOptions} />
          <button className="button topology-primary" type="submit" disabled={busy}>创建节点</button><button type="button" onClick={() => setPopup(undefined)}>取消</button>
        </form> : <>
          {popup.node && <><button role="menuitem" onClick={() => { selectOnly(popup.node!); setInspector(popup.node!); focusEditor.current = true; setPopup(undefined); }}>编辑节点</button><button role="menuitem" onClick={() => { copyNodes(); setPopup(undefined); }}>复制节点</button><button role="menuitem" onClick={() => { layouts([...selection].map(id => ({ id, patch: { hidden: true } }))); setPopup(undefined); }}>移除选中节点</button></>}
          {!popup.node && <button role="menuitem" onClick={() => { setCreateText(""); setPopup({ ...popup, create: true }); }}>在此创建节点</button>}
          <button role="menuitem" disabled={!clipboard.current?.nodes.length || busy} onClick={() => { const point = popup.point; setPopup(undefined); void pasteNodes(point); }}>粘贴节点</button>
          <button role="menuitem" onClick={() => { showCamera(fitCamera(bounds,size)); setPopup(undefined); }}>适配全部节点</button>
          <button role="menuitem" onClick={() => setPopup(undefined)}>关闭菜单</button>
        </>}
      </div>}
      <div className="topology-navigation">
        {selection.size > 1 && <span role="status">已选 {selection.size} 个节点 · 拖动批量移动 · Delete 移除</span>}
        {connection && <span role="status">点击目标节点完成连接 · Esc 取消</span>}
        <div className="topology-zoom" role="group" aria-label="画布视图">
          <button className="icon-button" aria-label="缩小画布" title={camera.zoom <= MIN_ZOOM ? "已达最小缩放比例" : "缩小画布"} disabled={camera.zoom <= MIN_ZOOM} onClick={() => zoomBy(0.8)}><Minus size={16} /></button>
          <button className="button topology-reset" aria-label="复位视图" title="复位视图" onClick={() => showCamera(DEFAULT_CAMERA)}>{Math.round(camera.zoom * 100)}%</button>
          <button className="icon-button" aria-label="放大画布" title={camera.zoom >= MAX_ZOOM ? "已达最大缩放比例" : "放大画布"} disabled={camera.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.25)}><Plus size={16} /></button>
          <button className="icon-button" aria-label="适配节点" title="适配节点" onClick={() => showCamera(fitCamera(bounds, size))}><Maximize size={15} /></button>
        </div>
        <span id="topology-controls-help">拖动空白平移 · 滚轮缩放 · Shift 拖动框选</span>
      </div>
      <details className="relation-legend"><summary>关系颜色</summary><div>{Object.entries(RELATION_TYPES).map(([type, label]) => <span className="relation-type-key" key={type} style={relationTokens(type as keyof typeof RELATION_TYPES) as CSSProperties}><span aria-hidden="true"/>{label}</span>)}</div></details>
      {options.minimap && <button className="topology-map" aria-label="小地图，适配节点" title="点击小地图定位 · 回车适配全部节点"
        onClick={event => {
          const svg = event.currentTarget.querySelector("svg");
          const matrix = svg?.getScreenCTM();
          if (event.detail === 0 || !matrix) return showCamera(fitCamera(bounds, size));
          const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
          showCamera({ ...camera, x: worldLimit(point.x), y: worldLimit(point.y) });
        }}>
        <span>小地图</span>
        <svg aria-hidden="true" viewBox={`${minimapArea.x - mapPadding} ${minimapArea.y - mapPadding} ${mapWidth + 2 * mapPadding} ${mapHeight + 2 * mapPadding}`}>
          <path d={minimapPath} />
          <rect x={area.x} y={area.y} width={area.width} height={area.height} vectorEffect="non-scaling-stroke" />
        </svg>
      </button>}
      </div>
      {currentEdge && inspector === `edge:${currentEdge.id}` && <FloatingInspector host={surface.current} anchor={inspectorAnchor} title="关系详情" closeLabel="关闭关系详情" onClose={closeInspector}>
        <div className="relation-type-key" style={relationTokens(currentEdge.value.relationType ?? "related") as CSSProperties}><span aria-hidden="true"/>{RELATION_TYPES[currentEdge.value.relationType ?? "related"]}</div>
        <label>关系类型<AppSelect label="关系类型" value={currentEdge.value.relationType ?? "related"} onValueChange={next => editEdge(currentEdge.id, { relationType: next as CanvasEdgeValue["relationType"] })} options={Object.entries(RELATION_TYPES).map(([value, label]) => ({ value, label }))} /></label>
        <label>起点<AppSelect label="起点节点" value={currentEdge.value.fromNodeId} onValueChange={next => editEdge(currentEdge.id, { fromNodeId: next })} options={live.map(node => ({value: node.id, label: content(node.value.text, node.value.title).title}))} /></label>
        <label>终点<AppSelect label="终点节点" value={currentEdge.value.toNodeId} onValueChange={next => editEdge(currentEdge.id, { toNodeId: next })} options={live.map(node => ({value: node.id, label: content(node.value.text, node.value.title).title}))} /></label>
        <label>方向<AppSelect label="关系方向" value={currentEdge.value.direction ?? "forward"} onValueChange={next => editEdge(currentEdge.id, { direction: next as CanvasEdgeValue["direction"] })} options={[{value:'forward',label:'起点 → 终点'},{value:'both',label:'双向 ↔'},{value:'none',label:'无方向'}]} /></label>
        <label>说明（可选）<input className="topology-select" aria-label="连接说明" maxLength={200} value={currentEdge.value.label} onChange={event => editEdge(currentEdge.id, { label: event.target.value })}/></label>
        <button className="button" onClick={() => { editEdge(currentEdge.id, null); setSelectedEdge(""); }}><Trash2 size={15}/>删除连接</button>
      </FloatingInspector>}
      {((current && inspector === current.id) || (recoveryOpen && inspector === "recovery")) && <FloatingInspector key={inspector} host={surface.current} anchor={inspectorAnchor} title={current ? "节点详情" : "已移除节点"} closeLabel="关闭详情" onClose={closeInspector}>
        {current ? <>
          <div className="topology-fields">
            <label><input type="checkbox" aria-label="整理时保留位置" checked={!!current.layout.locked} onChange={e=>editLayout(current.id,{locked:e.target.checked})}/>整理时保留位置</label>
            <label>类型<AppSelect label="节点类型" value={current.layout.kind}
              onValueChange={kind => editLayout(current.id, {kind})}
              options={current.layout.kind === 'file' ? [...kindOptions,{value:'file' as const,label:'文件',tone:'var(--kind-file)'}] : kindOptions} /></label>
            <label>状态<AppSelect label="处理状态" value={current.layout.status} onValueChange={next => editLayout(current.id, { status: next as TopologyLayout["status"] })} options={Object.entries(NODE_STATUSES).map(([value, label]) => ({ value, label }))} /></label>
          </div>
          <label className="topology-body">正文<textarea ref={editor} key={current.id} aria-label="节点正文" value={current.value.text} disabled={current.missing}
            placeholder="第一行写标题，下面补充内容" maxLength={10000} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={event => {
              const value = client.view()[current.sourceId]?.value;
              if (value?.type === "text" || value?.type === "node") client.edit(current.sourceId, { ...value, text: event.target.value });
            }} /></label>
          {!current.missing && <button className="button" disabled={composing} onClick={() => onOpenRecord(current.sourceId)}>打开原记录</button>}
          <details className="topology-inspector-connections"><summary>关联与连接</summary><label>连接到节点<AppSelect label="连接到节点" value={targetNode} onValueChange={next => setTargetNode(next)} options={[{value:"",label:"选择目标节点"}, ...live.filter(node => node.id !== current.id).map(node => ({value: node.id, label: content(node.value.text, node.value.title).title}))]} /></label>
          <button className="button" title={live.some(node => node.id === targetNode && node.id !== current.id) ? "连接到所选节点" : "先选择其他目标节点"} disabled={!live.some(node => node.id === targetNode && node.id !== current.id)} onClick={() => connect(current.id, targetNode)}>建立连接</button></details>
          {current.value.type === "text" && <p className="topology-source">与原记录同步，移除仅删除画布引用。</p>}
          <button className="button topology-remove" onClick={() => { layouts([...selection].map(id => ({ id, patch: { hidden: true } }))); viewport.current?.focus({ preventScroll: true }); }}><Trash2 size={15} />从画布移除</button>
        </> : hidden.length ? <ul className="topology-recovery">{hidden.map(node => <li key={node.id}>
          <span title={content(node.value.text, node.value.title).title}>{content(node.value.text, node.value.title).title}</span>
          <button className="button" aria-label={`恢复 ${content(node.value.text, node.value.title).title}`} onClick={() => {
            editLayout(node.id, { hidden: false });
            showCamera({ ...camera, x: worldLimit(node.layout.x + node.layout.width / 2), y: worldLimit(node.layout.y + node.layout.height / 2) });
            setRecoveryOpen(false);
            selectOnly(node.id);
          }}><RotateCcw size={15} />恢复</button>
        </li>)}</ul> : <p className="topology-source">移除的节点会出现在这里。</p>}
      </FloatingInspector>}
    </div>
  </section>;
}
