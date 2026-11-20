import { Button } from "../Button";
import { ToolbarDockControls } from "../ToolbarDockControls";
import { useToolbarDock } from "../useToolbarDock";
import { CardResizeHandle } from "../CardResizeHandle";
import { RecordAttachments } from "../FilePicker";
import {placeRelationTooltip} from '../relation-tooltip';
import { rankRelationHits } from '../relation-hit';
import {ExportDialog} from '../ExportDialog';
import {exportPalette, type ExportSource} from '../render-export';
import {Dialog} from '@base-ui/react/dialog';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {Menu} from '@base-ui/react/menu';
import {arrangeGraph} from '../graph-layout';
import { AppSelect } from "./AppSelect";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type MouseEvent } from "react";
import { CircleHelp, File, Lightbulb, ListTodo, Maximize, Plus, Redo2, RotateCcw, StickyNote, Trash2, Undo2, X, Minus, Pencil, Link2, MoreHorizontal, CheckCircle2, MousePointer2, Settings2, Network, Download, Search, Paperclip, Palette } from "lucide-react";
import { Popover } from '@base-ui/react/popover';
import { BoardClient, uid, type Item, type CanvasNodeValue, type CanvasEdgeValue, type CanvasMigrationResult } from "../board";
import {
  DEFAULT_CAMERA, MAX_ZOOM, MIN_ZOOM, NODE_KINDS, NODE_STATUSES, enclosingBounds, fitCamera,
  RELATION_TYPES, relationCurve, relationGeometry, centeredNodeLayout, vacantLayout, overlaps, sameLayout, screenToWorld, viewportBounds, worldLimit, zoomAt,
  type CanvasOptions, type Camera, type Point, type Size, type TopologyLayout, type TopologyNote, type TopologyViewport,
} from "../topology";
import "./topology.css";
import { relationTokens } from "../relation-appearance";
import { FloatingInspector } from "./FloatingInspector";
import { nodeCardLayout, nodePreviewLines, readableNodeContent } from "./node-preview";
import { NodeColorDialog } from "./NodeColorDialog";
import { SaveStatus, StatusPill } from "./visuals";

const KIND_ICONS = { note: StickyNote, question: CircleHelp, idea: Lightbulb, task: ListTodo, file: File };
type Node = { id: string; sourceId: string; missing: boolean; value: TopologyNote; layout: TopologyLayout; title: string; summary: string };
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
  notify(message: string): void;
  middlePanBlocked?: boolean;
};

function worldPosition(start: Point, delta: Point, zoom: number, direction: number) {
  return { x: worldLimit(start.x + direction * delta.x / zoom), y: worldLimit(start.y + direction * delta.y / zoom) };
}

const kindOptions = Object.entries(NODE_KINDS).filter(([id]) => id !== 'file').map(([value, label]) => ({value: value as Exclude<TopologyLayout['kind'], 'file'>,label,tone:`var(--kind-${value})`}));
const toolPlacement = { side: "right", align: "start", sideOffset: 14, collisionPadding: { top: 52, right: 12, bottom: 12, left: 12 } } as const;

export function TopologyWorkspace({ active, client, items, savedViewport, onViewport, notify, request, onOpenRecord, savedOptions, onOptions }: Props) {
  const viewport = useRef<HTMLDivElement>(null);
  const surface = useRef<HTMLDivElement>(null);
  const dock = useToolbarDock('relation');
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
  const [preview, setPreview] = useState<(Point & { id: string; width?: number; height?: number; positions?: Record<string, Point> }) | null>(null);
  const [panning, setPanning] = useState(false);
  const [kind, setKind] = useState<TopologyLayout["kind"]>("note");
  const [colorDialog, setColorDialog] = useState<"create" | { id: string; color?: string }>();
  const [selected, setSelected] = useState("");
  const [selectedMore, setSelectedMore] = useState<string[]>([]);
  const selection = new Set([selected, ...selectedMore].filter(Boolean));
  function selectOnly(id: string) { setSelected(id); setSelectedMore([]); }
  function selectNodes(ids: string[]) { setSelected(ids[0] ?? ""); setSelectedMore(ids.slice(1)); }
  const [options, setOptions] = useState<CanvasOptions>({ roomId: client.base.roomId, grid: true, snap: false, minimap: true, wheel: "auto" });
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [resultIndex, setResultIndex] = useState(-1);
  const searchInput = useRef<HTMLInputElement>(null);
  const [pendingDelete, setPendingDelete] = useState<{ edge: string } | { nodes: string[] } | null>(null);
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
  const [edgeChoices, setEdgeChoices] = useState<{ ids: string[]; x: number; y: number }>();
  useEffect(() => { setEdgeChoices(undefined); }, [camera.x,camera.y,camera.zoom,roomId,active]);
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
    if (!active) { reset(); setExportOpen(false); changeSearch(false); setPendingDelete(null); setColorDialog(undefined); setInspector(""); setComposing(false); setHoveredEdge(""); setFocusedEdge(""); }
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

  const compactCards = options.nodeDisplay === "compact";
  const nodeFont = useMemo(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-font').trim() || 'sans-serif', [items]);
  const attachmentsByRecord = useMemo(() => {
    const files = new Map<string, Set<string>>();
    for (const { value } of Object.values(items)) {
      if (value?.type !== "content-link" || value.roomId !== roomId || value.targetRef.kind !== "file") continue;
      const ids = files.get(value.recordId) ?? new Set<string>();
      ids.add(value.targetRef.id);
      files.set(value.recordId, ids);
    }
    return files;
  }, [items, roomId]);
  const nodes = useMemo(() => Object.entries(items).flatMap(([id, item]): Node[] => {
    const value = item.value;
    if (value?.type !== "canvas-node" || value.canvasId !== roomId || value.roomId !== roomId) return [];
    const source = value.contentRef.kind === "record" ? items[value.contentRef.id]?.value : undefined;
    const missing = source?.type !== "text" && source?.type !== "node";
    const body: TopologyNote = !missing ? source : { type: "node", text: value.contentRef.kind === "file" ? "文件引用\n文件预览将在后续批次接入" : "原记录已删除或不可用\n可以移除此引用，原始内容不会受影响", topology: value.layout };
    const { title, summary } = readableNodeContent(body);
    const preview = missing ? "" : summary;
    return [{ id, sourceId: value.contentRef.id, missing, value: body, title, summary: preview,
      layout: nodeCardLayout(value.layout, title, preview, compactCards, nodeFont) }];
  }), [items, roomId, compactCards, nodeFont]);
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
  const selectedNodes = live.filter(node => selection.has(node.id));
  const searchTerm = query.trim().toLowerCase();
  const results = searchOpen && searchTerm ? live.filter(node =>
    `${node.title} ${node.summary} ${node.value.text}`.toLowerCase().includes(searchTerm)).slice(0, 8) : [];
  const activeResult = resultIndex < 0 ? undefined : results[resultIndex];
  const activeEdge = [hoveredEdge, focusedEdge, selectedEdge].find(id => edges.some(edge => edge.id === id && nodeById.has(edge.value.fromNodeId) && nodeById.has(edge.value.toNodeId))) || '';
  const focusedRelation = edges.find(edge => edge.id === activeEdge);
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
      const pan = !event.ctrlKey && !event.metaKey && options.wheel === "pan";
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
  function confirmDelete() {
    if (!pendingDelete || busy) return;
    if ("edge" in pendingDelete) editEdge(pendingDelete.edge, null);
    else layouts(pendingDelete.nodes.filter(id => nodeById.has(id)).map(id => ({ id, patch: { hidden: true } })));
    setPendingDelete(null);
    selectOnly(""); setSelectedEdge(""); setInspector("");
    setConnection(null);
  }
  function showRemoved() {
    selectOnly(""); setSelectedEdge("");
    setRecoveryOpen(!recoveryOpen);
    setInspector(recoveryOpen ? "" : "recovery");
  }
  function changeSearch(open: boolean) {
    setSearchOpen(open);
    if (!open) { setQuery(""); setResultIndex(-1); }
  }
  function locateResult(node: Node) {
    selectOnly(node.id); setSelectedEdge(""); setInspector(""); setRecoveryOpen(false);
    setConnection(null);
    showCamera({ ...cameraRef.current, x: node.layout.x + node.layout.width / 2,
      y: node.layout.y + node.layout.height / 2, zoom: Math.max(.7, cameraRef.current.zoom) });
    changeSearch(false);
  }
  function searchKeys(event: KeyboardEvent<HTMLInputElement>) {
    if (!results.length || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter") {
      event.preventDefault();
      locateResult(activeResult ?? results[0]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (resultIndex + 1) % results.length : resultIndex <= 0 ? results.length - 1 : resultIndex - 1;
      setResultIndex(next);
      document.getElementById(`relation-result-${results[next].id}`)?.scrollIntoView({ block: "nearest" });
    }
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
  function layoutSignature() {
    return JSON.stringify([
      Object.entries(client.view()).filter(([, item]) => item.value?.type === "canvas-node" || item.value?.type === "canvas-edge"),
      live.map(({ id, layout }) => [id, layout.width, layout.height]),
    ]);
  }
  function arrange() {
    try {const movable=selection.size>1?selection:new Set(live.map(n=>n.id));
      const positions=arrangeGraph(live,edges.map(e=>e.value),movable);
      setArrangement({positions,signature:layoutSignature()});
    }catch(e){notify((e as Error).message);}
  }

  async function create(center?: Point, text = "", nodeKind = kind, color?: string) {
    if (!client.ready || !enabled || busy) return;
    const point = center ?? cameraRef.current;
    const base = centeredNodeLayout(point, nodeKind);
    if (color) base.color = color;
    const layout = center ? base : vacantLayout(base, client.view(), roomId);
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
    if (busy || (event.button !== 0 && event.button !== 1) || interaction.current || connecting.current) return;
    const pan = event.button === 1 || space.current;
    if ((event.target as Element).closest("input, select, textarea") || !pan && (event.target as Element).closest("[data-anchor], [data-edge], button, .topology-node-actions")) return;
    const target = (event.target as Element).closest<HTMLElement>("[data-topology-node]");
    const node = !pan && target ? nodeById.get(target.dataset.topologyNode!) : undefined;
    event.preventDefault(); setPopup(undefined); setEdgeChoices(undefined);
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
    if (!event.currentTarget.contains(target)) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f" && !target.closest("input, textarea, select")) {
      event.preventDefault(); changeSearch(true); return;
    }
    if (event.key === "Escape") { setFocusedEdge("");setHoveredEdge("");
      if (edgeChoices) { event.preventDefault(); setEdgeChoices(undefined); viewport.current?.focus(); return; }
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
  const edgeGeometry = new Map(edges.flatMap(({id,value}) => {
    const from=nodeById.get(value.fromNodeId),to=nodeById.get(value.toNodeId);
    if(!from||!to)return [];
    const geometry=relationGeometry(shownLayout(from),shownLayout(to),camera.zoom,relationLabels);
    relationLabels.push(geometry.labelBounds);
    return [[id,geometry] as const];
  }));
  function relationCandidates(event: {clientX:number;clientY:number}) {
    const rect=viewport.current!.getBoundingClientRect();
    const point=screenToWorld({x:event.clientX-rect.left,y:event.clientY-rect.top},size,cameraRef.current);
    return rankRelationHits(point,[...edgeGeometry].map(([id,geometry])=>({id,...geometry})),cameraRef.current.zoom);
  }
  function chooseEdge(id:string) {
    setEdgeChoices(undefined); setSelectedEdge(id); setHoveredEdge(''); selectOnly(''); setInspector(`edge:${id}`);
  }
  function clickRelation(event: MouseEvent<SVGPathElement>, fallback:string) {
    event.stopPropagation();
    if (space.current || event.button !== 0) return;
    const hits=relationCandidates(event), first=hits[0];
    const ambiguous=first ? hits.filter(hit=>hit.distance-first.distance<=2) : [];
    if(event.detail!==0 && ambiguous.length>1) {
      const rect=viewport.current!.getBoundingClientRect();
      setEdgeChoices({ids:ambiguous.map(hit=>hit.id),x:event.clientX-rect.left,y:event.clientY-rect.top});
      setHoveredEdge(first.id);
    } else chooseEdge(first?.id ?? fallback);
  }
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
    <p>将现有便签放进可连接的内容空间。</p>
    <p>启用时会先备份，再保留原记录并建立画布引用。旧版应用无法直接打开升级后的数据库。</p>
    {migration && <p>将整理 {migration.added} 个节点；原正文、文件与纸面位置保持不变。</p>}
    {migrationError && <p role="alert">{migrationError}</p>}
    <button className="button topology-primary" disabled={busy || !migration || !client.ready} onClick={() => void upgrade()}>{busy ? "正在备份并启用…" : "备份并启用关系画布"}</button>
  </section>;

  return <section id={active ? "workspace" : undefined} className="topology-workspace" hidden={!active}
    tabIndex={-1} aria-label="关系画布" onKeyDown={shortcuts}>
    {active && colorDialog && <NodeColorDialog
      initialKind={colorDialog === "create" ? kind === "file" ? "note" : kind : undefined}
      initialColor={colorDialog === "create" ? undefined : colorDialog.color}
      onClose={() => setColorDialog(undefined)}
      onSave={(color, nextKind) => {
        if (colorDialog === "create") {
          if (nextKind) { setKind(nextKind); void create(undefined, "", nextKind, color); }
        } else if (nodeById.has(colorDialog.id)) editLayout(colorDialog.id, { color });
        setColorDialog(undefined);
      }}/>}
    {active && pendingDelete && <AlertDialog.Root open onOpenChange={open => { if (!open) setPendingDelete(null); }}>
      <AlertDialog.Portal><AlertDialog.Backdrop className="desk-backdrop"/>
        <AlertDialog.Popup className="modal xigra-record-dialog correctness-dialog">
          <AlertDialog.Title>{"edge" in pendingDelete ? "删除连接" : `移除 ${pendingDelete.nodes.length} 个节点`}</AlertDialog.Title>
          <AlertDialog.Description>{"edge" in pendingDelete
            ? "所选连接将从画布删除，可通过撤销恢复。"
            : "所选节点将从画布移除，原始便签仍会保留。可通过撤销或「已移除节点」恢复。"}</AlertDialog.Description>
          <div className="dialog-actions">
            <AlertDialog.Close render={<Button />}>取消</AlertDialog.Close>
            <Button variant="danger" disabled={busy} onClick={confirmDelete}>确认删除</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>}
    {arrangement&&<Dialog.Root open onOpenChange={open=>{if(!open)setArrangement(null);}}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="modal xigra-record-dialog correctness-dialog" onKeyDown={e=>e.stopPropagation()}>
      <Dialog.Title>整理节点</Dialog.Title><Dialog.Description>将按连接方向重新排列 {Object.keys(arrangement.positions).length} 个节点。循环关系放在同层，按节点实际尺寸避让；锁定及未选节点保留位置。多选时仅整理所选节点。手动位置将改变，正文、引用与关系类型保持不变。</Dialog.Description>
      <p>确认后可用一次“撤销节点操作”恢复。本操作不保证消除所有交叉连线。</p><div className="dialog-actions"><button className="button" onClick={()=>setArrangement(null)}>取消</button><button className="button primary" onClick={()=>{if(layoutSignature()!==arrangement.signature){notify('画布已有新修改，请重新整理');setArrangement(null);return;}layouts(Object.entries(arrangement.positions).map(([id,patch])=>({id,patch})));setArrangement(null);}}>确认整理</button></div>
    </Dialog.Popup></Dialog.Portal></Dialog.Root>}
    {active&&exportOpen&&<ExportDialog target={()=>viewport.current} close={()=>setExportOpen(false)} notify={notify} snapshot={():ExportSource=>{
      if(!viewport.current)throw new Error('请先打开关系画布。');
      return {name:'Arasn-关系画布',palette:exportPalette(viewport.current),view:viewportBounds(cameraRef.current,size),zoom:cameraRef.current.zoom,
        strokes:[],edges:structuredClone(edges.map(edge=>edge.value)),cards:live.map(node=>{
          const {title,summary,layout}=node;
          const status=layout.kind==='task'||layout.kind==='question'||layout.status!=='open'?(layout.kind==='question'&&layout.status==='done'?'已解决':NODE_STATUSES[layout.status]):'';
          return {id:node.id,kind:'node',box:{x:layout.x,y:layout.y,width:layout.width,height:layout.height},title,text:node.missing?'':summary,color:layout.color,
            short:layout.height<130,missing:node.missing,footer:[NODE_KINDS[layout.kind],status,node.missing?'原内容不可用':''].filter(Boolean).join(' · ')};
        })};
    }}/>}

    <div className="topology-frame">
      <div className="topology-surface" ref={surface}>
      <aside ref={dock.ref} style={dock.style} data-dock-side={dock.side} data-dragging={dock.dragging || undefined} className="relation-tool-panel free-tool-rail" data-mode="full" aria-label="关系画布工具">
        <ToolbarDockControls dock={dock} />
        <Button className="tool" tooltip="选择 · 拖动空白处平移" aria-label="选择与平移" aria-pressed={!connection} onClick={() => { setConnection(null); setInspector(""); viewport.current?.focus(); }}><MousePointer2 size={18}/><span>选择</span></Button>
        <Menu.Root modal={false}>
          <Menu.Trigger render={<Button className="tool" tooltip="节点" />} aria-label="新建节点" disabled={!client.ready || busy || !enabled}>
            <Plus size={18}/><span>节点</span>
          </Menu.Trigger>
          <Menu.Portal><Menu.Positioner className="relation-tool-position" {...toolPlacement}>
            <Menu.Popup className="relation-tool-popup relation-tool-kind" aria-label="新建节点类型">
              {kindOptions.map(option => {
                const Icon = KIND_ICONS[option.value];
                return <Menu.Item key={option.value} onClick={() => { setKind(option.value); void create(undefined, "", option.value); }}>
                  <Icon size={18} aria-hidden="true" style={{ color: option.tone }}/>{option.label}
                </Menu.Item>;
              })}
              <Menu.Item onClick={() => setColorDialog("create")}><Palette size={18} aria-hidden="true"/>自定义颜色…</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner></Menu.Portal>
        </Menu.Root>
        <Button className="tool" tooltip={current ? "连线" : "连线 · 先选择源节点"} aria-label="创建连接" aria-pressed={!!connection} onClick={() => { if (current) setConnection(connection ? null : { source: current.id, point: { x: current.layout.x + current.layout.width + 40, y: current.layout.y + current.layout.height / 2 } }); }} disabled={!current || busy}><Link2 size={18}/><span>连线</span></Button>
        <Popover.Root open={active && searchOpen} onOpenChange={changeSearch}>
          <Popover.Trigger render={<Button className="tool" tooltip="搜索 · Ctrl+F" />} aria-label="搜索节点" aria-keyshortcuts="Control+F">
            <Search size={18}/><span>搜索</span>
          </Popover.Trigger>
          <Popover.Portal><Popover.Positioner className="relation-tool-position" {...toolPlacement}>
            <Popover.Popup className="relation-tool-popup relation-tool-search" initialFocus={searchInput}>
              <Popover.Title className="sr-only">搜索节点</Popover.Title>
              <input ref={searchInput} className="topology-select" role="combobox" aria-label="搜索节点" aria-expanded={!!results.length}
                aria-controls="relation-search-results" aria-activedescendant={activeResult && `relation-result-${activeResult.id}`}
                placeholder="搜索标题或正文…" value={query} onKeyDown={searchKeys} onChange={event => { setQuery(event.target.value); setResultIndex(-1); }} />
              <div id="relation-search-results" role="listbox" aria-label="搜索结果" hidden={!results.length}>
                {results.map(node => <button type="button" role="option" tabIndex={-1} key={node.id} id={`relation-result-${node.id}`}
                  aria-selected={activeResult?.id === node.id} onClick={() => locateResult(node)}>{node.title}</button>)}
              </div>
              {searchTerm && !results.length && <small role="status">没有匹配节点</small>}
            </Popover.Popup>
          </Popover.Positioner></Popover.Portal>
        </Popover.Root>
        <Button className="tool" tooltip="截图 / 导出" aria-label="截图 / 导出" onClick={() => setExportOpen(true)}><Download size={18}/><span>截图</span></Button>
        <Button className="tool" tooltip="整理" aria-label="整理节点" disabled={!live.length || busy} onClick={arrange}><Network size={18}/><span>整理</span></Button>
        <Popover.Root>
          <Popover.Trigger render={<Button className="tool" tooltip="设置" />} aria-label="画布设置"><Settings2 size={18}/><span>设置</span></Popover.Trigger>
          <Popover.Portal><Popover.Positioner className="relation-tool-position" {...toolPlacement}>
          <Popover.Popup className="relation-tool-popup relation-tool-options">
          <Popover.Title className="sr-only">画布设置</Popover.Title>
          <label><input type="checkbox" aria-label="显示网格" checked={options.grid} onChange={event => changeOptions({ grid: event.target.checked })}/>显示网格</label>
          <label><input type="checkbox" aria-label="网格吸附" checked={options.snap} onChange={event => changeOptions({ snap: event.target.checked })}/>网格吸附</label>
          <label><input type="checkbox" aria-label="显示小地图" checked={options.minimap} onChange={event => changeOptions({ minimap: event.target.checked })}/>显示小地图</label>
          <label>节点展示<AppSelect variant="relation-settings" label="节点展示" value={options.nodeDisplay ?? "detailed"} onValueChange={nodeDisplay => changeOptions({ nodeDisplay })}
            options={[{ value: "detailed", label: "详细模式" }, { value: "compact", label: "简洁模式" }]}/></label>
          <label>滚轮行为<AppSelect variant="relation-settings" label="滚轮行为" value={options.wheel} onValueChange={next => changeOptions({ wheel: next as CanvasOptions["wheel"] })} options={[{value:'auto',label:'自动识别'},{value:'zoom',label:'滚轮缩放'},{value:'pan',label:'触控板平移'}]} /></label>
          <small>自动与缩放模式使用滚轮缩放；可显式选择触控板平移。Ctrl/双指捏合始终缩放。</small>
          <Popover.Close render={<Button />} onClick={showRemoved}><RotateCcw size={16}/>已移除节点</Popover.Close>
          </Popover.Popup></Popover.Positioner></Popover.Portal>
        </Popover.Root>
        <div className="relation-tool-history" role="group" aria-label="编辑操作">
          <Button className="tool" tooltip="撤销 · Ctrl+Z" aria-label="撤销节点操作" disabled={busy || !history.past.length} onClick={() => replay(false)}><Undo2 size={18}/></Button>
          <Button className="tool" tooltip="重做 · Ctrl+Shift+Z" aria-label="重做节点操作" disabled={busy || !history.future.length} onClick={() => replay(true)}><Redo2 size={18}/></Button>
          <Button className="tool" variant="danger" tooltip="删除选中对象" aria-label="删除选中对象" disabled={busy || (!currentEdge && !selectedNodes.length)}
            onClick={() => setPendingDelete(currentEdge ? { edge: currentEdge.id } : { nodes: selectedNodes.map(node => node.id) })}><Trash2 size={18}/></Button>
        </div>
      </aside>

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
              const geometry = edgeGeometry.get(id)!;
              const path = geometry.path;
              const related = selection.has(from.id) || selection.has(to.id);
              const type = value.relationType ?? "related";
              const emphasized = activeEdge === id;
              const arrow = `url(#relation-arrow-${type}-${emphasized})`;
              return <g key={id} data-edge={id} data-relation={type} data-selected={selectedEdge === id || undefined}
                data-hovered={activeEdge === id && selectedEdge !== id || undefined}
                style={relationTokens(type) as CSSProperties}
                data-muted={activeEdge ? activeEdge !== id || undefined : !!selected && !related || undefined}
                onPointerMove={event => { if(!interaction.current&&!connection&&!edgeChoices) setHoveredEdge(relationCandidates(event)[0]?.id ?? ''); }} onPointerLeave={() => { if(!edgeChoices) setHoveredEdge(""); }}
                onFocus={() => setFocusedEdge(id)} onBlur={() => setFocusedEdge("")}>

                {selectedEdge===id && <path className="relation-selection-halo" d={path} aria-hidden="true"/>}
                {geometry.vertical && [geometry.sourceAnchor, geometry.targetAnchor].map((port, index) =>
                  <circle key={index} className="relation-vertical-anchor" cx={port.x} cy={port.y} r={4 / camera.zoom} aria-hidden="true"/>)}
                <path className="relation-line" d={path} markerEnd={value.direction !== "none" ? arrow : undefined} markerStart={value.direction === "both" ? arrow : undefined} />
                <path className="relation-hit" d={path} role="button" tabIndex={0} aria-pressed={selectedEdge===id} aria-describedby={(hoveredEdge||focusedEdge)===id&&tooltipPosition&&!inspector&&!connection&&!edgeChoices?"relation-compact-tooltip":undefined} aria-label={`选择关系：${from.title} 到 ${to.title}（${RELATION_TYPES[type]}）${value.label?`，${value.label}`:""}`} onClick={event => clickRelation(event,id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); chooseEdge(id); } }} />
                <foreignObject className="relation-label-wrap" transform={`translate(${geometry.label.x} ${geometry.label.y}) scale(${1 / camera.zoom})`} x={-geometry.labelWidth / 2} y={-14} width={geometry.labelWidth} height={28}>
                  <div className="relation-label-position"><span className="relation-label">{RELATION_TYPES[type]}{value.label ? ` · ${value.label}` : ""}</span></div>
                </foreignObject>
              </g>;
            })}
            {connection && (() => { const from = live.find(node => node.id === connection.source); return from ? <path className="relation-line relation-draft" d={relationCurve({ x: from.layout.x + from.layout.width, y: from.layout.y + from.layout.height / 2 }, connection.point)} /> : null; })()}
          </svg>
          {live.filter(node => selection.has(node.id) || node.id === preview?.id || overlaps(area, node.layout, 200 / camera.zoom)).map(node => {
            const { id, layout, title, summary } = node;
            const Glyph = KIND_ICONS[layout.kind];
            const bodySync = client.saveState(node.sourceId), layoutSync = client.saveState(id);
            const sync = bodySync.tone === 'error' || layoutSync.tone === 'saved' ? bodySync : layoutSync;
            const position = shownLayout(node);
            const previewLines = !compactCards && camera.zoom >= .55 && summary ? nodePreviewLines(position, title, nodeFont, camera.zoom) : 0;
            const attachmentCount = attachmentsByRecord.get(node.sourceId)?.size ?? 0;
            const screenRight = size.width / 2 + (position.x + position.width - camera.x) * camera.zoom;
            const actionInset = (Math.max(0, screenRight - size.width + 8) - Math.max(0, 206 - screenRight)) / camera.zoom;
            const relationFocus = focusedRelation && (focusedRelation.value.fromNodeId === id || focusedRelation.value.toNodeId === id);
            const actionsBelow = size.height / 2 + (position.y - camera.y) * camera.zoom < 60;
            return <article className="topology-node" key={id} tabIndex={0} data-topology-node={id}
              onMouseEnter={() => setHoveredNode(id)} onMouseLeave={() => setHoveredNode("")} data-connectable={connectTarget===id?"true":undefined} data-kind={layout.kind} data-created={newNode === id || undefined} data-dragging={!!preview?.positions?.[id] || preview?.id === id || undefined}
              data-relation-focus={relationFocus || undefined} data-compact={camera.zoom < .55 || undefined} data-display={compactCards ? "compact" : "detailed"} data-node-color={layout.color}
              data-tight={position.width < 200 || undefined} data-short={position.height < 104 || undefined}
              aria-label={`${NODE_KINDS[layout.kind]}，${title}${node.missing?'，原内容不可用':sync.tone==='error'?`，${sync.label}`:''}`} title={`${title} · 双击或使用编辑按钮查看正文`} data-selected={selection.has(id) || undefined}
              style={{ left: position.x, top: position.y, width: position.width, height: position.height,
                '--node-preview-lines': previewLines, '--node-kind-color': `var(--kind-${layout.kind}, var(--ui-text-secondary))`, '--node-accent': layout.color,
                '--node-footer-inset': compactCards ? '0px' : `${10 / camera.zoom}px`,
                '--node-title-size': `${Math.max(16,11/camera.zoom)}px`, '--node-title-line': `${Math.max(22,15/camera.zoom)}px`,
                ...(relationFocus ? relationTokens(focusedRelation.value.relationType ?? "related") : {}) } as CSSProperties}
              onClick={event => { if (space.current || composing || performance.now() < suppressClick.current) return; if (connection && connection.source !== id) { connect(connection.source, id); setConnection(null); return; } setRecoveryOpen(false); if (event.shiftKey) selectNodes(selection.has(id) ? [...selection].filter(key => key !== id) : [...selection, id]); else selectOnly(id); setSelectedEdge(""); setInspector(previous => previous === id ? previous : ""); }}
              onKeyDown={event => { if (event.key === "Enter" && !(event.target as Element).closest("button")) { selectOnly(id); setSelectedEdge(""); setInspector(""); } }}
              onDoubleClick={event => { if (composing || performance.now() < suppressClick.current || (event.target as Element).closest("button, .topology-node-actions")) return; event.stopPropagation(); focusEditor.current = true; selectOnly(id); setInspector(id); }}
              onAnimationEnd={() => setNewNode(previous => previous === id ? "" : previous)}>
              <strong data-drag-handle>{title}</strong>
              {!compactCards && <CardResizeHandle width={position.width} height={position.height} zoom={camera.zoom}
                limits={{ minWidth: Math.min(220, layout.width), maxWidth: Math.max(420, layout.width), minHeight: Math.min(104, layout.height), maxHeight: 480 }}
                onPreview={size => setPreview({ id, x: layout.x, y: layout.y, ...size })}
                onCancel={() => setPreview(null)} onCommit={size => {
                  setPreview(null);
                  if (size.width !== layout.width || size.height !== layout.height) layouts([{ id, patch: { ...size, autoSize: false } }]);
                }}/>}

              {camera.zoom < .55 && (node.missing||sync.tone==='error'||sync.tone==='pending') && <span className="topology-compact-status" data-tone={node.missing?'error':sync.tone} role="img" aria-label={node.missing?'原内容不可用':sync.label} title={node.missing?'原内容不可用':sync.label} style={{fontSize:12/camera.zoom}}>{node.missing||sync.tone==='error'?'!':'…'}</span>}
              {previewLines > 0 && <span className="topology-node-summary">{summary}</span>}
              <span className="topology-node-footer topology-node-meta"><span className="topology-node-kind"><Glyph size={13} aria-hidden="true"/>{NODE_KINDS[layout.kind]}</span>
                {(layout.kind==='task'||layout.kind==='question'||layout.status!=='open')&&<span className="topology-node-status" data-status={layout.status}>{layout.kind === "question" && layout.status === "done" ? "已解决" : NODE_STATUSES[layout.status]}</span>}
                {!compactCards && attachmentCount > 0 && <span className="topology-node-attachments" aria-label={`${attachmentCount} 个附件`} title={`${attachmentCount} 个附件`}><Paperclip size={13} aria-hidden="true"/>{attachmentCount}</span>}
                {(!compactCards || node.missing || sync.tone === "error" || sync.tone === "pending") && <span className="node-sync" data-tone={node.missing ? "error" : sync.tone}>
                  {!node.missing && sync.tone === 'saved' ? <span role="img" aria-label="已保存" title="已保存"><CheckCircle2 size={13} aria-hidden="true"/></span>
                    : <span className="topology-node-sync-label" title={node.missing ? "原内容不可用" : sync.label}>{node.missing ? "原内容不可用" : sync.label}</span>}
                </span>}
              </span>
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
        {edgeChoices && <div className="relation-choice" role="dialog" aria-label="选择交叉连接" style={{left:Math.max(8,Math.min(edgeChoices.x,size.width-268)),top:Math.max(8,Math.min(edgeChoices.y,size.height-228))}} onPointerDown={event=>event.stopPropagation()}>
          <header><strong>选择连接</strong><button aria-label="关闭连接选择" onClick={()=>setEdgeChoices(undefined)}><X size={14}/></button></header>
          <div>{edgeChoices.ids.map((id,index)=>{const edge=edges.find(e=>e.id===id);if(!edge)return null;const from=nodeById.get(edge.value.fromNodeId),to=nodeById.get(edge.value.toNodeId);return <button key={id} autoFocus={index===0} onFocus={()=>setHoveredEdge(id)} onPointerEnter={()=>setHoveredEdge(id)} onClick={()=>chooseEdge(id)} style={relationTokens(edge.value.relationType??'related') as CSSProperties}><span>{from&&from.title} → {to&&to.title}</span><small>{RELATION_TYPES[edge.value.relationType??'related']}{edge.value.label?` · ${edge.value.label}`:''}</small></button>;})}</div>
        </div>}
        {!live.length && <div className="topology-empty"><StickyNote size={24} /><strong>从一个节点开始</strong><span>双击空白处，或用「节点」把想法放到画布上。</span></div>}
      </div>
      {tooltipEdge&&tooltipPosition&&!inspector&&!connection&&!edgeChoices&&<div id="relation-compact-tooltip" role="tooltip" className="relation-compact-tooltip" style={{left:tooltipPosition.x,top:tooltipPosition.y,width:tooltipPosition.width}}><strong>{RELATION_TYPES[tooltipEdge.value.relationType??'related']}</strong><span>{tooltipEdge.value.label||'点击连接线编辑关系属性'}</span></div>}
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
          <Button iconOnly className="icon-button" aria-label="缩小画布" title={camera.zoom <= MIN_ZOOM ? "已达最小缩放比例" : "缩小画布"} disabled={camera.zoom <= MIN_ZOOM} onClick={() => zoomBy(0.8)}><Minus size={16} /></Button>
          <Button iconOnly className="button topology-reset" aria-label="复位视图" title="复位视图" onClick={() => showCamera(DEFAULT_CAMERA)}>{Math.round(camera.zoom * 100)}%</Button>
          <Button iconOnly className="icon-button" aria-label="放大画布" title={camera.zoom >= MAX_ZOOM ? "已达最大缩放比例" : "放大画布"} disabled={camera.zoom >= MAX_ZOOM} onClick={() => zoomBy(1.25)}><Plus size={16} /></Button>
          <Button iconOnly className="icon-button" aria-label="适配节点" title="适配节点" onClick={() => showCamera(fitCamera(bounds, size))}><Maximize size={15} /></Button>
        </div>
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
        <label>起点<AppSelect label="起点节点" value={currentEdge.value.fromNodeId} onValueChange={next => editEdge(currentEdge.id, { fromNodeId: next })} options={live.map(node => ({value: node.id, label: node.title}))} /></label>
        <label>终点<AppSelect label="终点节点" value={currentEdge.value.toNodeId} onValueChange={next => editEdge(currentEdge.id, { toNodeId: next })} options={live.map(node => ({value: node.id, label: node.title}))} /></label>
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
            <Button className="topology-color-button" disabled={composing}
              onClick={() => setColorDialog({ id: current.id, color: current.layout.color })}>
              {current.layout.color
                ? <span className="topology-color-swatch" aria-hidden="true" style={{ backgroundColor: current.layout.color }}/>
                : <Palette size={16} aria-hidden="true"/>}
              节点颜色
            </Button>
          </div>
          <label className="topology-body">正文<textarea ref={editor} key={current.id} aria-label="节点正文" value={current.value.text} disabled={current.missing}
            placeholder="第一行写标题，下面补充内容" maxLength={10000} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onChange={event => {
              const value = client.view()[current.sourceId]?.value;
              if (value?.type === "text" || value?.type === "node") client.edit(current.sourceId, { ...value, text: event.target.value });
            }} /></label>
          {current.value.type === "text" && <RecordAttachments client={client} recordId={current.sourceId} active={active} notify={notify}/>}
          {!current.missing && <button className="button" disabled={composing} onClick={() => onOpenRecord(current.sourceId)}>打开原记录</button>}
          <details className="topology-inspector-connections"><summary>关联与连接</summary><label>连接到节点<AppSelect label="连接到节点" value={targetNode} onValueChange={next => setTargetNode(next)} options={[{value:"",label:"选择目标节点"}, ...live.filter(node => node.id !== current.id).map(node => ({value: node.id, label: node.title}))]} /></label>
          <button className="button" title={live.some(node => node.id === targetNode && node.id !== current.id) ? "连接到所选节点" : "先选择其他目标节点"} disabled={!live.some(node => node.id === targetNode && node.id !== current.id)} onClick={() => connect(current.id, targetNode)}>建立连接</button></details>
          {current.value.type === "text" && <p className="topology-source">与原记录同步，移除仅删除画布引用。</p>}
          <button className="button topology-remove" onClick={() => { layouts([...selection].map(id => ({ id, patch: { hidden: true } }))); viewport.current?.focus({ preventScroll: true }); }}><Trash2 size={15} />从画布移除</button>
        </> : hidden.length ? <ul className="topology-recovery">{hidden.map(node => <li key={node.id}>
          <span title={node.title}>{node.title}</span>
          <button className="button" aria-label={`恢复 ${node.title}`} onClick={() => {
            editLayout(node.id, { hidden: false });
            showCamera({ ...camera, x: worldLimit(node.layout.x + node.layout.width / 2), y: worldLimit(node.layout.y + node.layout.height / 2) });
            setRecoveryOpen(false);
            selectOnly(node.id);
          }}><RotateCcw size={15} />恢复</button>
        </li>)}</ul> : <p className="topology-source">移除的节点会出现在这里。</p>}
      </FloatingInspector>}
    </div>
    <footer className="canvas-footer relation-save-footer">
      <div className="canvas-footer-state"><StatusPill tone="neutral">本机工作空间</StatusPill><SaveStatus client={client}/></div>
      <span>{live.length} 个节点 · {edges.length} 条连线<span className="footer-separator">|</span><span id="topology-controls-help">空白拖动平移 · Shift 拖动框选 · 滚轮缩放</span></span>
    </footer>
  </section>;
}
