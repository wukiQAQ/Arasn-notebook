import { useResizableSidebar } from "./useResizableSidebar";
import { Button } from "./Button";
import {ExportDialog} from './ExportDialog';
import { Notification, NotificationProvider, useNotification } from './Notification';
import {freeExportSource} from './render-export';
import { WhiteboardShare, type ShareOperation } from './xigra/WhiteboardShare';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ChevronDown,
  Copy,
  Download,
  GripHorizontal,
  Keyboard,
  Layers3,
  Minus,
  RelationCanvasIcon,
  Network,
  MonitorUp,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "./LagoonIcons";
import {
  BoardClient,
  DesktopInfo,
  StrokeValue,
  TextValue,
  uid,
  Value,
} from "./board";
import "./style.css";
import "./desk.css";
import { SaveRecoveryActions, SaveStatus, StatusPill, XigraBrand } from "./xigra/visuals";
import './interaction.css';
import { Dialog } from "@base-ui/react/dialog";
import { CommandMenu } from "./CommandMenu";
import { Search, FileText, Command } from "./LagoonIcons";
import { FileStation } from "./FileStation";
import { FilePicker } from "./FilePicker";
import type { FreePlacement, Item, ManagedFile } from "./board";
import { RecordWorkspace } from "./xigra/records/RecordWorkspace";
import { LanNotesDialog, type LanRequest } from "./xigra/LanNotesDialog";
import { HelpPopover } from "./xigra/HelpPopover";
import { GlobalRecordSearch } from "./xigra/records/RecordSearch";
import { recordTitle } from "./xigra/records/RecordList";
import { useRecordSession } from "./xigra/records/session";
import { TriggerSettings, type TriggerAction } from "./xigra/TriggerSettings";
import { watchLocalGestures } from "./xigra/local-trigger";
import "./xigra/records/records.css";
import { Icon } from "./LagoonIcons";
import { LagoonMotion } from "./LagoonMotion";
import "./lagoon.css";
import "./xigra/tokens.css";
import "./xigra/primitives.css";
import "./xigra/graphite.css";
import "./xigra/file-station.css";
import { SHAPES, Shape, shapePoints } from "./drawing";
import { TopologyWorkspace } from "./xigra/TopologyWorkspace";
import { FreeFileCard } from "./FreeFileCard";
import { transformStroke, strokeBounds } from "./drawing";
import type { ImportResult, FreeFileValue } from "./board";
import { DrawingHistory } from "./drawing-history";
import { useDrawingTools } from "./useDrawingTools";
import { useFreeViewport } from "./useFreeViewport";
import "./free-canvas.css";
import { FreeToolbar, freeToolHint } from "./FreeToolbar";
import { NewNoteButton } from "./NewNoteButton";
import { BrushProperties } from './BrushProperties';
import { DEFAULT_BRUSH, brushPath, brushDash, validPreset, type BrushStyle, type BrushPreset } from './brush';
import { AppSelect } from "./xigra/AppSelect";
import "./xigra/note-roles.css";
import "./sidebar.css";
import "./file-workspace.css";
import "./visual-order.css";
import "./xigra/shell.css";
import "./note-file-polish.css";
import "./nav-active.css";
import { NavItem } from "./NavItem";
import "./xigra/whiteboard-share.css";
import "./glass-surface.css";
import "./control-states.css";
import { FocusModality } from "./FocusModality";
import { ControlTooltip } from "./ControlTooltip";
import { ArrowLeft } from "lucide-react";
import { useAdaptiveLayout } from "./useAdaptiveLayout";
import "./adaptive-layout.css";
import { PageHeader } from "./PageHeader";
import "./page-header.css";
import "./ui-system.css";
import { useToolbarDock } from './useToolbarDock';
import { ToolbarDockControls } from './ToolbarDockControls';
import './space-economy.css';
import { WindowNavigationBar, usePageHistory } from './WindowNavigationBar';
import './window-navigation.css';
import './five-fixes.css';
import './detail-refinements.css';
import { SettingsLayout } from './SettingsLayout';
import { AppearanceActions, AppearancePanel } from './AppearanceSettings';
import { useAppearance } from './useAppearance';
import { CanvasNoteContent } from './CanvasNoteContent';
import { CardResizeHandle, CARD_LIMITS } from './CardResizeHandle';
import { enclosingBounds } from "./topology";
import type { Camera, TopologyViewport } from "./topology";
import "./search-sidebar-refinement.css";
import "./xigra/records/workspace.css";

const COLORS = ["#263449", "#39796b", "#d05a4b", "#4668c6"];
const NOTE_WIDTH = 280, NOTE_HEIGHT = 140;
const notePosition = (x: number, y: number) => ({
  x: Math.round(Math.max(-1_000_000, Math.min(1_000_000, x))),
  y: Math.round(Math.max(-1_000_000, Math.min(1_000_000, y))),
});
function freeNote(value: Item["value"] | undefined): TextValue | undefined {
  if (value?.type === "text" && !value.localOnly) return value;
  if ((value?.type === "text" || value?.type === "node") && value.freePlacement) {
    return { type: "text", text: value.text, title: value.title, color: "#263449", ...value.freePlacement };
  }
}

function App() {
  const [, refresh] = useState(0);
  const [client] = useState(() => new BoardClient(() => refresh((n) => n + 1)));
  const [tool, setTool] = useState<"select" | "hand" | "text" | "pen" | "erase">("select");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(4);
  const [brushStyle,setBrushStyle]=useState<BrushStyle>(DEFAULT_BRUSH);
  const [brushPresets,setBrushPresets]=useState<BrushPreset[]>([]);
  const [textStyle,setTextStyle]=useState({fontSize:18,bold:false});
  const [textColor, setTextColor] = useState(COLORS[0]);
  const [shapeBrush, setShapeBrush] = useState({ color: COLORS[0], width: 4, ...DEFAULT_BRUSH });
  const [lastShape, setLastShape] = useState<Shape>("rect");
  const [shape, setShape] = useState<Shape>("free");
  const [properties, setProperties] = useState(false);
  const [selected, setSelected] = useState("");
  const [workbenchPage, setWorkbenchPage, pageHistory] = usePageHistory<"canvas" | "records" | "topology" | "files">(window.desktop ? "records" : "canvas");
  const sidebar = useResizableSidebar();
  const [fileReturnPage, setFileReturnPage] = useState<"canvas" | "records" | "topology">("canvas");
  const [recordSearchOpen, setRecordSearchOpen] = useState(false);
  const [recordQuery, setRecordQuery] = useState("");
  const [deleteRecord, setDeleteRecord] = useState("");
  const [lanRequest, setLanRequest] = useState<LanRequest | null>(null);
  const [lanCount, setLanCount] = useState(0);
  useEffect(() => window.desktop?.lan.onOpen(() => setLanRequest({})), []);
  const paperPan = useRef<{ pointer: number; x: number; y: number; camera: Camera } | null>(null);
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
  useEffect(() => { if (info) return watchLocalGestures(info.triggers); }, [info?.triggers]);
  const [quickCapture, setQuickCapture] = useState(false);
  const [showFullRecordNavigation, setShowFullRecordNavigation] = useState(false);
  const [dialog, setDialog] = useState<"share" | "settings" | "devices" | null>(null);
  // Base UI keeps the popup mounted during exit. Keep its actual content too.
  const lastDialog = useRef<NonNullable<typeof dialog>>("settings");
  if (dialog) lastDialog.current = dialog;
  const dialogContent = dialog ?? lastDialog.current;
  const [dialogError, setDialogError] = useState('');
  const [shareAddress, setShareAddress] = useState('');
  const appearance = useAppearance();
  const { notice, notify: setToast, dismiss: dismissNotice, settingsNotice } = useNotification();
  useEffect(() => {
    if (client.error) setToast(`保存未完成：${client.error}`, { tone: 'error', duration: null, source: 'save', retry: async () => {
      client.retry(); await client.flush(); if (client.error) throw new Error(client.error);
    } });
    else if (notice?.source === 'save') dismissNotice();
  }, [client.error, client.canRetry, setToast, dismissNotice]);
  const inRecords = Boolean(window.desktop) && workbenchPage === "records";
  const inTopology = Boolean(window.desktop) && workbenchPage === "topology";
  const inFiles = Boolean(window.desktop) && workbenchPage === "files";
  const inCanvas = !inRecords && !inTopology && !inFiles;
  const viewport = useFreeViewport(client.base.roomId, setToast, inCanvas);
  const scale = viewport.camera.zoom;
  const zoom = Math.round(scale * 100);
  const [working, setWorking] = useState(false);
  const [shareOperation, setShareOperation] = useState<ShareOperation | null>(null);
  const [shareRetry, setShareRetry] = useState<ShareOperation | null>(null);
  const [importing,setImporting]=useState(false);
  const [importProgress,setImportProgress]=useState("");
  useEffect(()=>window.desktop?.files.progress(p=>setImportProgress(`正在导入 ${p.name}`)),[]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [filesOpen, setFilesOpen] = useState(false);
  const [attachmentRecord, setAttachmentRecord] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [reader, setReader] = useState(true);
  const [mobile, setMobile] = useState(innerWidth < 640);
  useEffect(() => { const media = matchMedia("(max-width:639px)"); const change = () => setMobile(media.matches); media.addEventListener("change", change); return () => media.removeEventListener("change", change); }, []);
  const paper = useRef<HTMLDivElement>(null);
  const newCanvasNote = useRef("");
  const history = useRef(new DrawingHistory());
  const items = client.view();
  const records = useRecordSession(client, items);
  const [recordImporting, setRecordImporting] = useState(false);
  const [canvasRequest, setCanvasRequest] = useState<{ id: string; token: number }>();
  useEffect(() => { if (!inCanvas) setProperties(false); }, [inCanvas]);
  const pageTitle = inTopology ? "关系画布" : inRecords ? (quickCapture ? "快捷记录" : "便签") : inFiles ? "文件中心" : "自由工作页";
  function openFilePage() {
    if (records.composing) return;
    if (workbenchPage !== "files") setFileReturnPage(workbenchPage);
    setFilesOpen(false);
    setWorkbenchPage("files");
  }
  function openFilePicker(recordId: string | null = null) {
    setAttachmentRecord(recordId);
    setFilesOpen(true);
  }
  async function attachFiles(files: ManagedFile[], target: "canvas" | "record", recordId = attachmentRecord, origin = "文件中心引用") {
    if (target === "record") {
      if (!recordId || !["text", "node"].includes(client.view()[recordId]?.value?.type ?? "")) throw new Error("请先选择一张已保存的便签");
      const roomId = client.base.roomId;
      for (const file of files) {
        const exists = Object.values(client.view()).some(item => item.value?.type === "content-link" && item.value.recordId === recordId && item.value.targetRef.kind === "file" && item.value.targetRef.id === file.id);
        if (!exists) {
          client.edit(uid(), { type: "content-link", roomId, recordId, targetRef: { kind: "file", id: file.id } });
          await window.desktop!.files.action('attachmentOrigin', { id: file.id, recordId, origin }).catch(() => undefined);
        }
      }
      await client.flush();
    } else {
      const added = await importAttachments(async () => files.map(file => ({ ok: true, file })));
      if (!added) throw new Error("附件未添加，请检查保存状态后重试；文件副本已保留");
      await client.flush();
    }
  }
  const pendingViewport = useRef<TopologyViewport | undefined>(undefined);
  const viewportTimer = useRef(0);
  const viewportWrite = useRef<Promise<boolean> | null>(null);
  const flushViewport = useCallback(function flush(): Promise<boolean> {
    window.clearTimeout(viewportTimer.current);
    if (viewportWrite.current) return viewportWrite.current.then(ok => ok && pendingViewport.current ? flush() : ok);
    const next = pendingViewport.current;
    const desktop = window.desktop;
    pendingViewport.current = undefined;
    if (!next || !desktop || next.roomId !== client.base.roomId) return Promise.resolve(true);
    viewportWrite.current = desktop.settings({ topologyViewport: next }).then(updated => {
      setInfo(current => current && { ...current, topologyViewport: updated.topologyViewport });
      return true;
    }, () => {
      pendingViewport.current ??= next;
      setToast("关系画布位置未保存，请重试");
      return false;
    }).finally(() => { viewportWrite.current = null; });
    return viewportWrite.current;
  }, [client]);
  const queueViewport = useCallback((camera: Camera) => {
    pendingViewport.current = { ...camera, roomId: client.base.roomId };
    window.clearTimeout(viewportTimer.current);
    viewportTimer.current = window.setTimeout(() => void flushViewport(), 180);
  }, [client, flushViewport]);
  const composingTarget = useRef<Node | null>(null);
  const focusRecords = useRef(() => {});
  const prepareWindow = useRef<(action: "hide" | "quit") => Promise<boolean>>(async () => false);
  focusRecords.current = () => {
    if (composingTarget.current?.isConnected) return;
    if (recordSearchOpen || deleteRecord || dialog || commandOpen || filesOpen || indexOpen || lanRequest) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body &&
        !active.closest("[data-hide-panel]")) return;
    if (inRecords) records.focus();
    else if (inCanvas) paper.current?.querySelector<HTMLTextAreaElement>(".note.focused textarea")?.focus({ preventScroll: true });
  };
  prepareWindow.current = async (action) => {
    if (composingTarget.current?.isConnected) return false;
    if (action === "hide" && document.activeElement?.hasAttribute("data-shortcut-capture")) return false;
    let durable = false;
    if (!records.hasVolatileText()) {
      let deadline = 0;
      try {
        durable = await Promise.race([
          Promise.all([client.ensureRecoverable(), flushViewport(), viewport.save()]).then(results => results.every(Boolean)),
          new Promise<boolean>(resolve => { deadline = window.setTimeout(() => resolve(false), 1800); }),
        ]);
      } finally { window.clearTimeout(deadline); }
    }
    if (!durable || records.hasVolatileText()) {
      setToast("便笺尚未落盘，请等保存完成后重试，或先复制正文。");
      return false;
    }
    if (composingTarget.current?.isConnected) return false;
    return true;
  };
  useEffect(() => {
    if (!window.desktop) return;
    const compositionStart = (event: CompositionEvent) => {
      if (event.target instanceof Node) composingTarget.current = event.target;
    };
    const compositionEnd = () => { composingTarget.current = null; };
    const unsubscribe = window.desktop.onFocus(() => focusRecords.current());
    const unlisten = window.desktop.onWindowIntent(action => prepareWindow.current(action));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let arrival: Animation | undefined;
    const cancelArrival = () => arrival?.cancel();
    const stopArrival = window.desktop.triggers.onArrival(region => {
      if (reduced.matches) return;
      const shell = document.querySelector(".app-shell");
      if (!shell) return;
      const x = region.includes("left") ? -6 : region.includes("right") ? 6 : 0;
      const y = region.startsWith("top") ? -6 : region.startsWith("bottom") ? 6 : 0;
      const tokens = getComputedStyle(shell);
      cancelArrival();
      arrival = shell.animate([{ opacity: .88, translate: `${x}px ${y}px` }, { opacity: 1, translate: "0 0" }],
        { duration: parseFloat(tokens.getPropertyValue("--xigra-motion-panel")) || 180,
          easing: tokens.getPropertyValue("--xigra-ease").trim() || "ease-out" });
    });
    reduced.addEventListener("change", cancelArrival);
    document.addEventListener("compositionstart", compositionStart, true);
    document.addEventListener("compositionend", compositionEnd, true);
    return () => {
      unsubscribe();
      unlisten();
      stopArrival();
      cancelArrival();
      reduced.removeEventListener("change", cancelArrival);
      document.removeEventListener("compositionstart", compositionStart, true);
      document.removeEventListener("compositionend", compositionEnd, true);
    };
  }, []);
  const selectedText =
    items[selected]?.value?.type === "text"
      ? (items[selected].value as TextValue)
      : null;
  const visible = Object.entries(items).filter(([, item]) => item.value);
  const texts = visible.flatMap(([id, item]) => {
    const value = freeNote(item.value);
    return value ? [[id, { ...item, value }] as const] : [];
  });
  function updateFreeNote(id: string, patch: FreePlacement | Partial<TextValue>, group?: string) {
    const source = client.view()[id]?.value;
    if (source?.type === "text" && !source.localOnly) commit(id, { ...source, ...patch }, group);
    else if ((source?.type === "text" || source?.type === "node") && source.freePlacement) {
      const { x, y, width, height } = { ...source.freePlacement, ...patch };
      commit(id, { ...source, ...("text" in patch ? { text: patch.text ?? "" } : {}), freePlacement: { x, y, width, height } }, group);
    }
  }
  useLayoutEffect(() => {
    if (!newCanvasNote.current || newCanvasNote.current !== selected) return;
    const note = document.getElementById(`note-${selected}`);
    if (!note) return;
    newCanvasNote.current = "";
    note.focus({ preventScroll: true });
  }, [selected]);
  const strokes = visible.filter(([, item]) => item.value?.type === "stroke");
  useEffect(()=>{history.current=new DrawingHistory();},[client.base.roomId]);
  const drawingBrush = shape === 'free' ? { color, width, ...brushStyle } : shapeBrush;
  const tools=useDrawingTools({client,tool,shape,color:drawingBrush.color,width:drawingBrush.width,brushStyle:drawingBrush,scale,selected,select:setSelected,point:viewport.point,commit:commitGroup});
  async function saveBrushPresets(next: BrushPreset[]) {
    if(next.length>12||!next.every(validPreset))throw new Error('方案无效');
    if(window.desktop)await window.desktop.settings({brushPresets:next});
    else localStorage.setItem('arasn-brush-presets-v1',JSON.stringify(next));
    setBrushPresets(next);
  }
  useEffect(()=>{
    if(window.desktop)void window.desktop.info().then(info=>{if(Array.isArray(info.brushPresets)&&info.brushPresets.length<=12&&info.brushPresets.every(validPreset))setBrushPresets(info.brushPresets);});
    else {try {const saved=JSON.parse(localStorage.getItem('arasn-brush-presets-v1')||'[]');if(Array.isArray(saved)&&saved.length<=12&&saved.every(validPreset))setBrushPresets(saved);}catch{/* Ignore corrupt local preferences. */}}
  },[]);
  function changeBrush(patch: Partial<BrushPreset>) {
    const value=client.view()[selected]?.value;
    const {name: _name,...style}=patch;
    if(tool==='select'&&value?.type==='stroke')commit(selected,{...value,...style});
    else if(tool==='select'&&value?.type==='text') {if(style.color)commit(selected,{...value,color:style.color});}
    else if(tool==='text') {if(style.color)setTextColor(style.color);}
    else if(tool==='pen'&&shape!=='free')setShapeBrush(v=>({...v,...style}));
    else {if(style.color)setColor(style.color);if(style.width)setWidth(style.width);setBrushStyle(v=>({...v,...Object.fromEntries(Object.entries(style).filter(([k])=>!['color','width'].includes(k)))}));}
  }


  useEffect(() => {
    void client.start();
    void window.desktop?.info().then(setInfo);
    return () => client.stop();
  }, [client]);
  useEffect(() => {
    setDialogError('');
    setShareRetry(null);
    if (!dialog || !window.desktop) return;
    let active = true;
    void window.desktop.info().then(next => { if (active) setInfo(next); })
      .catch(error => { if (active) setDialogError(error.message); });
    return () => { active = false; };
  }, [dialog]);
  async function refreshInfo(sharing = false) {
    if (!window.desktop) return;
    if (sharing) { setShareOperation('refresh'); setShareRetry(null); }
    setWorking(true); setDialogError('');
    try { setInfo(await window.desktop.info()); }
    catch (error) { setDialogError((error as Error).message); if (sharing) setShareRetry('refresh'); }
    finally { setWorking(false); if (sharing) setShareOperation(null); }
  }
  async function changeSettings(patch: Partial<DesktopInfo>, silent = false) {
    const previous = info;
    if (window.desktop && patch.openAtLogin === undefined)
      setInfo((current) => (current ? { ...current, ...patch } : current));
    setDialogError('');
    setWorking(true);
    try {
      if (window.desktop) {
        const updated = await window.desktop.settings(patch);
        setInfo(updated);
      }
      if (!silent) settingsNotice("设置已保存");
    } catch (error) {
      setInfo(previous);
      if (window.desktop) {
        try { setInfo(await window.desktop.info()); } catch { /* Keep the last known state and show the failure. */ }
      }
      const message = (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');
      setDialogError(message);
      settingsNotice(`设置保存失败：${message}`, () => changeSettings(patch));
    } finally {
      setWorking(false);
    }
  }
  async function hidePanel() {
    if (!window.desktop || records.composing) return;
    try { await window.desktop.hide(); }
    catch (error) {
      setToast((error as Error).message);
    }
  }
  const actionHandler = useRef<(action: TriggerAction, local?: boolean) => Promise<void>>(async () => {});
  actionHandler.current = async (action, local = false) => {
    if (composingTarget.current?.isConnected || (local && document.hidden)) return;
    if ((dialog || indexOpen || recordSearchOpen || deleteRecord || lanRequest || exportRequest) &&
        action !== "quick-note" && action !== "workbench") return;
    if (action === "quick-note") {
      if (dialog || indexOpen || recordSearchOpen || deleteRecord || lanRequest || exportRequest || filesOpen || commandOpen) return;
      setWorkbenchPage("records");
      setQuickCapture(true);
      setShowFullRecordNavigation(false);
      records.focus();
      return;
    }
    if (action === "workbench") {
      setQuickCapture(false);
      return;
    }
    if (action === "commands" && !filesOpen) {
      setCommandOpen(open => local ? !open : true);
    } else if (action === "files" && !commandOpen) {
      openFilePage();
    }
  };
  useEffect(() => {
    let queue = Promise.resolve();
    return window.desktop?.triggers.onAction((action, focus = true, version = 0) => {
      queue = queue.then(async () => {
        await actionHandler.current(action);
        await window.desktop!.reveal(focus, version);
      }).catch(error => setToast(String(error)));
    });
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 || composingTarget.current?.isConnected) return;
      if (lanRequest || exportRequest) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!event.repeat) void actionHandler.current("commands", true);
        return;
      }
      if (commandOpen || dialog || filesOpen || indexOpen || recordSearchOpen || deleteRecord) return;
      if (event.key === "Escape") {
        if (inFiles) { event.preventDefault(); setWorkbenchPage(fileReturnPage); return; }
        if (!event.repeat && window.desktop) void hidePanel();
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || event.target.closest("input, textarea, select"))
      )
        return;
      if (inCanvas && event.ctrlKey && event.key.toLowerCase() === "y") { event.preventDefault(); undoLast(true); }
      if (event.key === "Delete" && inCanvas && tool === "select" && (boxSelection.length>0 || selected && ["stroke","text","free-file"].includes(client.view()[selected]?.value?.type ?? ""))) removeFreeSelection();
      if (inCanvas && event.ctrlKey && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLast(event.shiftKey);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });
  async function sendNote(id: string, title: string) {
    try {
      await client.flush();
      if (client.saveState(id).tone !== "saved") {
        setToast("请等便签保存成功后再发送");
        return;
      }
      setLanRequest({ note: { id, title } });
    } catch {
      setToast("便签未保存，请重试保存后再发送");
    }
  }
  function commitGroup(changes: { id: string; value: Value | null }[], key?: string) {
    const edits = changes.map(({id,value}) => ({id,before:client.view()[id]?.value??null,after:value}));
    history.current.record(edits,key);
    for (const {id,after} of edits) client.edit(id,after);
  }
  function commit(id: string, value: Value | null, key?: string) { commitGroup([{id,value}],key); }
  function undoLast(redo = false) {
    const result=history.current.apply(redo,id=>client.view()[id]?.value??null,(id,value)=>client.edit(id,value),uid);
    if(result==='empty')setToast(redo?'没有可重做的操作':'没有可撤销的操作');
    if(result==='conflict')setToast('内容已有新修改，未覆盖他人的改动');
    if(result==='ok')setSelected(history.current.resolve(selected));
  }
  function coordinate(event: React.PointerEvent) { return viewport.point(event.clientX, event.clientY); }
  const activeObject=items[selected]?.value;
  const objectBox=activeObject?.type==='stroke'?strokeBounds(activeObject.points):activeObject?.type==='text'?{x:activeObject.x,y:activeObject.y,width:activeObject.width??280,height:activeObject.height??140}:activeObject?.type==='free-file'?activeObject:null;
  function updateBox(key:'x'|'y'|'width'|'height',n:number) {
    if(!activeObject || !objectBox || !Number.isFinite(n))return;
    if((key==='x'||key==='y')&&Math.abs(n)>1e6)return;
    if(key==='width'||key==='height'){const minimum=activeObject.type==='text'?(key==='width'?CARD_LIMITS.minWidth:CARD_LIMITS.minHeight):activeObject.type==='stroke'?1:key==='width'?120:96;const maximum=activeObject.type==='text'?(key==='width'?CARD_LIMITS.maxWidth:CARD_LIMITS.maxHeight):1200;if(n<minimum||n>maximum)return;}
    const box={...objectBox,[key]:n};
    if(activeObject.type==='stroke')commit(selected,{...activeObject,points:transformStroke(activeObject.points,objectBox,box)});
    else if(activeObject.type==='text'||activeObject.type==='free-file')commit(selected,{...activeObject,[key]:n});
  }
  async function importAttachments(load:()=>Promise<ImportResult[]>,point?:[number,number]) {
    if(importing||!client.ready)return false;
    const room=client.base.roomId;
    setImporting(true);setImportProgress("");
    try {
      const results=await load();
      if(room!==client.base.roomId)throw new Error('工作页已更换，文件已保留在文件区');
      const base=point??[viewport.current.current.x-160,viewport.current.current.y-110];
      const changes=results.flatMap((r,index)=>r.ok&&r.file?[{id:uid(),value:{type:'free-file',roomId:room,contentRef:{kind:'file',id:r.file.id},name:r.file.name,category:r.file.category,x:Math.max(-1e6,Math.min(1e6,base[0]+index*32)),y:Math.max(-1e6,Math.min(1e6,base[1]+index*32)),width:320,height:r.file.category==='图片'?240:140,localOnly:true} as FreeFileValue}]:[]);
      commitGroup(changes); if(changes.length){setSelected(changes.at(-1)!.id);setTool('select');}
      const failed=results.filter(r=>!r.ok);
      if(failed.length)setToast(`${failed.length} 个文件导入失败：${failed[0].error??'未知错误'}；成功文件保留`);
      return changes.length > 0;
    } catch(e){setToast(`附件导入失败：${(e as Error).message}`);return false;} finally{setImporting(false);}
  }
  function contentBounds() {
    return enclosingBounds(visible.flatMap(([, item]) => {
      const value = freeNote(item.value) ?? item.value!;
      if (value.type === "text" && !value.localOnly) return [{ x: value.x, y: value.y, width: value.width??NOTE_WIDTH, height: value.height??NOTE_HEIGHT }];
      if(value.type==='free-file')return [{x:value.x,y:value.y,width:value.width,height:value.height}];
      if (value.type !== "stroke") return [];
      return value.points.map(([x, y]) => ({ x: x - value.width / 2, y: y - value.width / 2, width: value.width, height: value.width }));
    }));
  }
  function fitContent() {
    const bounds = contentBounds();
    if (!bounds) return viewport.show({ x: 800, y: 500, zoom: 1 });
    const left=84,right=16,top=12,bottom=72;
    const z=Math.max(.25,Math.min(1,(viewport.size.width-left-right)/Math.max(1,bounds.width),(viewport.size.height-top-bottom)/Math.max(1,bounds.height)));
    const targetLeft=left+Math.max(0,(viewport.size.width-left-right-bounds.width*z)/2);
    const targetTop=top+Math.max(0,(viewport.size.height-top-bottom-bounds.height*z)/2);
    viewport.show({x:bounds.x-(targetLeft-viewport.size.width/2)/z,y:bounds.y-(targetTop-viewport.size.height/2)/z,zoom:z});
  }
  function addText(point?: [number, number]) {
    if (!client.ready) return;
    const center: [number, number] = [viewport.current.current.x - NOTE_WIDTH / 2, viewport.current.current.y - NOTE_HEIGHT / 2];
    let position = notePosition(...(point ?? center));
    if (!point) {
      const occupied=visible.flatMap(([,item])=>{
        const v=freeNote(item.value) ?? item.value;
        return v?.type==='free-file'?[{x:v.x,y:v.y,width:v.width,height:v.height}]:v?.type==='text'&&!v.localOnly?[{x:v.x,y:v.y,width:v.width??280,height:v.height??140}]:[];
      });
      const overlaps=(p:{x:number;y:number})=>occupied.some(o=>p.x<o.x+o.width+16&&p.x+NOTE_WIDTH+16>o.x&&p.y<o.y+o.height+16&&p.y+NOTE_HEIGHT+16>o.y);
      for(const [dx,dy] of [[0,0],[0,240],[0,-240],[320,0],[-320,0],[320,240],[-320,240],[640,0],[-640,0]]){
        const candidate=notePosition(center[0]+dx,center[1]+dy);
        if(!overlaps(candidate)){position=candidate;break;}
      }
    }
    const id = uid();
    commit(id, {
      type: "text",
      text: "",
      ...position,
      color: textColor,
      width: NOTE_WIDTH, height: 180,
      ...textStyle,
    });
    newCanvasNote.current = id;
    setSelected(id);
    setTool("select");
  }
  const [boxSelection,setBoxSelection]=useState<string[]>([]);
  const [freeMarquee,setFreeMarquee]=useState<{x:number;y:number;width:number;height:number}>();
  const freeBox=useRef<{pointer:number;start:[number,number]}|null>(null);
  function removeFreeNoteValue(id: string) {
    const value = client.view()[id]?.value;
    return (value?.type === "text" || value?.type === "node") && value.freePlacement
      ? { ...value, freePlacement: undefined } : null;
  }
  function removeFreeSelection(){const ids=boxSelection.length?boxSelection:[selected];commitGroup(ids.filter(id => { const value = client.view()[id]?.value; return value?.type === 'stroke' || value?.type === 'free-file' || freeNote(value); }).map(id => ({ id, value: removeFreeNoteValue(id) })));setBoxSelection([]);setSelected('');}
  useEffect(()=>{setBoxSelection([]);freeBox.current=null;setFreeMarquee(undefined);},[tool,inCanvas]);
  function down(event: React.PointerEvent) {
    if (!client.ready) return;
    const middleBlocked = Boolean(info && !info.triggers.paused && info.triggers.bindings.some(b => b.enabled && ((b.input.device === "mouse" && b.input.button === "Middle") || (b.input.device === "gesture" && b.input.button === "Middle" && b.input.global))));
    if (event.button !== 0 && (event.button !== 1 || middleBlocked)) return;
    if(tool==='select'&&event.button===0&&event.shiftKey){event.currentTarget.closest<HTMLElement>('.paper-scroll')?.focus({preventScroll:true});event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);freeBox.current={pointer:event.pointerId,start:viewport.point(event.clientX,event.clientY)};setBoxSelection([]);setSelected('');return;}
    if (event.button === 0 && tools.down(event)) return;
    if (tool === "select" || tool === "hand" || event.button === 1) {
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      setSelected("");
      paperPan.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, camera: { ...viewport.current.current } };
      return;
    }
    const point = coordinate(event);
    if (tool === "text") {
      addText(point as [number, number]);
      return;
    }
  }
  function move(event: React.PointerEvent) {
    const box=freeBox.current;if(box?.pointer===event.pointerId){const point=viewport.point(event.clientX,event.clientY);setFreeMarquee({x:Math.min(point[0],box.start[0]),y:Math.min(point[1],box.start[1]),width:Math.abs(point[0]-box.start[0]),height:Math.abs(point[1]-box.start[1])});return;}
    if (tools.move(event)) return;
    const pan = paperPan.current;
    if (pan?.pointer === event.pointerId) { viewport.show({ ...pan.camera, x: pan.camera.x - (event.clientX - pan.x) / pan.camera.zoom, y: pan.camera.y - (event.clientY - pan.y) / pan.camera.zoom }); return; }
    if (drag.current) {
      const d = drag.current;
      setDragPreview({
        id: d.id,
        value: {
          ...d.value,
          ...notePosition(d.value.x + (event.clientX - d.x) / scale, d.value.y + (event.clientY - d.y) / scale),
        },
      });
    }
  }
  function up(event: React.PointerEvent) {
    if(freeBox.current?.pointer===event.pointerId){if(event.type==='pointerup'&&freeMarquee){const box=freeMarquee;setBoxSelection(visible.flatMap(([id,item])=>{const v=freeNote(item.value) ?? item.value;const b=v?.type==='stroke'?strokeBounds(v.points):v?.type==='free-file'?v:v?.type==='text'&&!v.localOnly?{x:v.x,y:v.y,width:v.width??NOTE_WIDTH,height:v.height??NOTE_HEIGHT}:undefined;return b&&b.x<=box.x+box.width&&b.x+b.width>=box.x&&b.y<=box.y+box.height&&b.y+b.height>=box.y?[id]:[];}));}freeBox.current=null;setFreeMarquee(undefined);return;}
    if (tools.up(event)) return;
    const pan = paperPan.current;
    if (pan?.pointer === event.pointerId) { if (event.type !== "pointerup") viewport.show(pan.camera); paperPan.current = null; viewport.save(); return; }
    const d = drag.current;
    if (d && event.type === "pointerup") {
      const value = freeNote(client.view()[d.id]?.value);
      const position = notePosition(d.value.x + (event.clientX - d.x) / scale, d.value.y + (event.clientY - d.y) / scale);
      if (value?.type === "text" && (value.x !== position.x || value.y !== position.y)) updateFreeNote(d.id, position);
    }
    drag.current = null;
    setDragPreview(null);
  }
  useEffect(() => {
    const cancel = () => {
      if (paperPan.current) viewport.show(paperPan.current.camera);
      freeBox.current=null;setFreeMarquee(undefined);
      paperPan.current = null; drag.current = null;
      setDragPreview(null);
    };
    window.addEventListener("blur", cancel);
    return () => window.removeEventListener("blur", cancel);
  }, [viewport.show]);
  function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const [exportRequest,setExportRequest]=useState(false);
  function exportImage() { setReader(false); setExportRequest(true); }
  const exportTarget = () => paper.current?.closest<HTMLElement>('.paper-scroll') ?? null;
  function exportSnapshot() {
    const target = exportTarget();
    if (!target) throw new Error('请先打开画布视图再截图。');
    return freeExportSource(visible.map(([id, item]) => [id, { ...item, value: freeNote(item.value) ?? item.value }]), target, viewport.current.current);
  }

  async function share(enabled: boolean) {
    setShareOperation(enabled ? 'start' : 'stop');
    setShareRetry(null);
    setWorking(true);
    setDialogError('');
    try {
      await client.tick();
      setInfo(await window.desktop!.share(enabled, enabled ? selectedShareAddress : undefined));
    } catch (error) {
      setDialogError((error as Error).message);
      setShareRetry(enabled ? 'start' : 'stop');
    } finally {
      setWorking(false);
      setShareOperation(null);
    }
  }
  const selectedShareAddress = info?.sharing ? info.shareHost || '' : info?.networks.some(entry => entry.address === shareAddress) ? shareAddress : info?.networks[0]?.address || '';
  async function copy(text: string) {
    try {
      if (window.desktop)
        await window.desktop.copyText(text);
      else if (navigator.clipboard?.writeText)
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
      setToast("已复制", { tone: "success" });
    } catch {
      setToast("复制失败，请选中文字后按 Ctrl+C");
    }
  }
  function locateNote(id: string) {
    setSelected(id);
    setTool("select");
    requestAnimationFrame(() => {
      const note = document.querySelector<HTMLElement>(
        `[data-note-id="${id}"]`,
      );
      const value = freeNote(client.view()[id]?.value);
      if (value) viewport.show({ ...viewport.current.current, x: value.x + (value.width ?? NOTE_WIDTH) / 2, y: value.y + (value.height ?? NOTE_HEIGHT) / 2 });
      note
        ?.querySelector<HTMLTextAreaElement>("textarea")
        ?.focus({ preventScroll: true });
    });
  }
  const adaptive = useAdaptiveLayout(viewport.size, properties, inCanvas);
  const dock = useToolbarDock("free", inCanvas, adaptive.toolbar);
  const compactRecordNavigation = inRecords && (quickCapture || (adaptive.nav === "collapsed" && mobile));
  const sidebarMode = compactRecordNavigation && sidebar.mode === "full" && !showFullRecordNavigation ? "compact" : sidebar.mode;
  const navigationContext = `${workbenchPage}:${compactRecordNavigation}`;
  const [sidebarMotionContext, setSidebarMotionContext] = useState("");
  useLayoutEffect(() => { setSidebarMotionContext(""); }, [navigationContext]);
  function toggleSidebar() {
    setSidebarMotionContext(navigationContext);
    sidebar.toggle();
  }
  function toggleNavigationDensity() {
    setSidebarMotionContext(navigationContext);
    if (compactRecordNavigation && sidebar.mode === "full") {
      setShowFullRecordNavigation(sidebarMode === "compact");
    } else {
      if (compactRecordNavigation) setShowFullRecordNavigation(sidebar.mode === "compact");
      sidebar.toggleCompact();
    }
  }
  const navExpanded = sidebarMode === "full";
  const newNoteDisabled = !client.ready || records.composing || records.volatile || recordImporting;
  function newNote() {
    if (newNoteDisabled) return;
    if (inCanvas) addText();
    else {
      setWorkbenchPage("records");
      records.open("");
    }
  }
  const pageActions = (<div className="header-actions">
                {inCanvas && mobile && <Button className="button page-header-view" onClick={() => setReader(v => !v)}>{reader ? "画布总览" : "文字阅读"}</Button>}
                {false && <Button
                  className="icon-button"
                  aria-label="搜索与快捷操作"
                  title="搜索与快捷操作 · Ctrl+K"
                  onClick={() => setCommandOpen(true)}
                >
                  <Command size={17} />
                </Button>}
                {!inFiles && <Button
                  className="icon-button mobile-settings"
                  aria-label="设置与快捷键"
                  onClick={() => setDialog("settings")}
                >
                  <Settings2 size={19} />
                </Button>}
              </div>);
  const windowBar = <WindowNavigationBar context={pageActions} title={pageTitle} disabled={records.composing}
    inboxAction={lanCount ? <Button className="quick-incoming" aria-label={`待接收便签，${lanCount} 条`} disabled={records.composing} onClick={() => setLanRequest({})}>收件 {lanCount}</Button> : undefined}
    sidebar={toggleSidebar} sidebarMode={sidebarMode} toggleCompact={toggleNavigationDensity} hide={() => void hidePanel()}
    back={pageHistory.back} forward={pageHistory.forward} canBack={pageHistory.canBack} canForward={pageHistory.canForward}
    search={() => setRecordSearchOpen(true)} commands={() => setCommandOpen(true)} share={() => setDialog("devices")} />;
  return (
    <div ref={adaptive.shellRef} data-nav-mode={sidebarMode === "full" ? "full" : "collapsed"} data-sidebar-mode={sidebarMode} data-sidebar-motion={sidebarMotionContext === navigationContext || undefined} data-sidebar-dragging={sidebar.dragging || undefined} style={{ "--user-sidebar-width": `${sidebarMode === "hidden" ? 0 : sidebarMode === "compact" ? 64 : sidebar.width}px` } as React.CSSProperties} data-toolbar-mode={adaptive.toolbar} className={`app-shell${sidebarMode === "hidden" ? " sidebar-hidden" : ""}${window.desktop ? " adaptive-shell" : ""}${inTopology ? " relation-workbench" : ""}${window.desktop ? " xigra-desktop" : ""}`}>
      {window.desktop && windowBar}
          <aside id="workbench-sidebar" inert={sidebarMode === "hidden"} className="sidebar lagoon-rail" data-expanded={navExpanded || undefined} aria-label="侧边栏">

            <nav aria-label="工作台导航">
            <div className="sidebar-group sidebar-primary nav-active-surface" role="group" aria-label="主导航">
            <NavItem collapsed={sidebarMode === "compact"} selected={inCanvas && dialog !== "devices"} aria-label="我的随手页" disabled={records.composing} onClick={() => { setWorkbenchPage("canvas"); setReader(true); }} icon={<Layers3 size={21}/>}>工作页</NavItem>
            {window.desktop && <NavItem collapsed={sidebarMode === "compact"} className="topology-rail-entry" selected={inTopology && dialog !== "devices"} aria-label="打开关系画布" disabled={records.composing || !info || !client.ready} onClick={() => setWorkbenchPage("topology")} icon={<RelationCanvasIcon size={21} strokeWidth={1.65} aria-hidden="true"/>}>关系画布</NavItem>}
            <NavItem collapsed={sidebarMode === "compact"} selected={inRecords && dialog !== "devices"} aria-label="便笺列表" disabled={records.composing} onClick={() => { if (window.desktop) { setQuickCapture(false); setWorkbenchPage("records"); } else setIndexOpen(true); }} icon={<FileText size={21}/>}>便签</NavItem>
            {window.desktop && <NavItem collapsed={sidebarMode === "compact"} selected={inFiles && dialog !== "devices"} aria-label="文件" disabled={records.composing} onClick={openFilePage} icon={<Icon name="tray"/>}>文件</NavItem>}
            </div>
            <div className="sidebar-group sidebar-collaboration" role="group" aria-labelledby="sidebar-collaboration-title">
            <span className="sidebar-group-title" id="sidebar-collaboration-title">协作</span>
            {window.desktop ? <NavItem collapsed={sidebarMode === "compact"} selected={dialog === "devices"} aria-label="设备互传" aria-haspopup="dialog" aria-expanded={dialog === "devices"} onClick={() => setDialog("devices")} icon={<MonitorUp size={21} strokeWidth={1.65}/>} badge={lanCount > 0 && <small className="device-inbox-count" aria-label={`${lanCount} 条待接收`}>{lanCount}</small>}>设备互传</NavItem>
              : <NavItem collapsed={sidebarMode === "compact"} aria-label="白板共享" aria-haspopup="dialog" aria-expanded={dialog === "share"} onClick={() => setDialog("share")} icon={<Network size={21} strokeWidth={1.65}/>}>共享</NavItem>}
            </div></nav>
            <div className="sidebar-bottom"><ControlTooltip label="设置与快捷键" enabled={sidebarMode === "compact"}><button className="space" aria-label="设置与快捷键" title="设置与快捷键" aria-haspopup="dialog" aria-expanded={dialog === "settings"} onClick={() => setDialog("settings")}><Settings2 size={21}/><span>设置</span></button></ControlTooltip></div>
            {sidebarMode === "full" && <div className="sidebar-resizer" role="separator" aria-label="调整侧边栏宽度" aria-orientation="vertical" aria-valuemin={180} aria-valuemax={sidebar.max} aria-valuenow={sidebar.width} tabIndex={0} {...sidebar.resizeProps} />}
          </aside>
          <a className="skip-link" href="#workspace">
            跳到编辑区
          </a>
          <main>
            {info && !info.shortcutOk && (
              <div className="notice xigra-notice" data-tone="warning">
                部分全局触发器未能注册。可从托盘打开页面，在设置中查看详情。
              </div>
            )}
            {client.error && (
              <div className="notice xigra-notice" data-tone="error" role="status">
                {client.error}
                <SaveRecoveryActions client={client} copy={copy} text={inRecords ? records.text : selectedText?.text} />
                <button onClick={() => void client.tick()}>重试连接</button>
              </div>
            )}
            {window.desktop && <RecordWorkspace onCreate={newNote} createDisabled={newNoteDisabled} active={inRecords} quick={quickCapture} setQuick={setQuickCapture} importing={recordImporting} setImporting={setRecordImporting} session={records} client={client} query={recordQuery} setQuery={setRecordQuery} confirmDelete={setDeleteRecord} copy={copy} notify={setToast} sendNote={(id, title) => void sendNote(id, title)} onFiles={() => openFilePicker(records.id || "")} onFileCenter={openFilePage} onSendFiles={files => attachFiles(files, "canvas")}
              onAttach={(files, id, origin) => attachFiles(files, "record", id, origin)}
              onFreePage={id => {
                const value = client.view()[id]?.value;
                if ((value?.type === "node" || (value?.type === "text" && value.localOnly)) && !value.freePlacement) {
                  const { x, y } = viewport.current.current;
                  commit(id, { ...value, freePlacement: { ...notePosition(x - NOTE_WIDTH / 2, y - NOTE_HEIGHT / 2), width: NOTE_WIDTH, height: NOTE_HEIGHT } });
                }
                setWorkbenchPage("canvas"); locateNote(id);
              }}
              onCanvas={id => { setCanvasRequest({ id, token: Date.now() }); setWorkbenchPage("topology"); }} />}
            {window.desktop && inFiles && <section className="file-workspace" id="workspace" aria-label="文件工作区" tabIndex={-1}>
              <FileStation client={client} onAttach={files => attachFiles(files, "canvas")} onRecord={records.id ? files => attachFiles(files, "record", records.id) : undefined} onDevices={() => setDialog("devices")} />
            </section>}
            {window.desktop && <TopologyWorkspace active={inTopology} client={client} items={items}
              request={canvasRequest} onOpenRecord={id => { if (!records.composing && !recordImporting) { records.open(id); setQuickCapture(false); setWorkbenchPage("records"); } }} savedOptions={info?.canvasOptions} onOptions={next => void changeSettings({ canvasOptions: next }, true)} savedViewport={info?.topologyViewport} onViewport={queueViewport} notify={setToast} />}
            <section
              ref={adaptive.canvasRef}
              className="workspace xigra-workspace-view free-workspace" data-tool={tool} data-toolbar-mode={adaptive.toolbar} style={{ "--free-available-height": `${viewport.size.height}px` } as React.CSSProperties}
              id={inCanvas ? "workspace" : undefined}
              hidden={!inCanvas}
              aria-label="随手页编辑区"
              tabIndex={-1}
            >
              <div ref={dock.ref} className="toolbar" role="toolbar" aria-label="编辑工具" style={dock.style} data-dock-side={dock.side} data-dock-mode={dock.mode} data-dragging={dock.dragging || undefined}>
                <FreeToolbar createAction={<NewNoteButton onClick={newNote} disabled={newNoteDisabled}/>} mode={adaptive.toolbar} tool={tool} shape={shape} choose={id => { setProperties(false); setTool(id); if(id === 'pen') setShape('free'); }}
                  dockControls={<ToolbarDockControls dock={dock} />}
                  shapes={() => {setProperties(false);setTool('pen');setShape(lastShape);}}
                  properties={properties} toggleProperties={() => setProperties(v => !v)} closeProperties={() => setProperties(false)}
                  undo={() => undoLast()} redo={() => undoLast(true)} canUndo={!!history.current.past.length} canRedo={!!history.current.future.length}
                  canRemove={tool === 'select' && (boxSelection.length>0 || !!activeObject && ['stroke','text','free-file'].includes(activeObject.type))}
                  remove={()=>{if(tool==='select')removeFreeSelection();}}
                  attach={window.desktop ? () => openFilePicker() : undefined} importing={importing || !client.ready} exportCanvas={exportImage}
                  settings={<div className="free-properties" data-object={tool==='select'?activeObject?.type:undefined}><div className="free-properties-heading">{tool==='select'?'选择设置':tool==='hand'?'画布导航':tool==='erase'?'橡皮擦设置':tool==='text'?'文字设置':shape==='free'?'画笔设置':'图形设置'}<Button iconOnly aria-label="关闭工具设置" title="关闭工具设置 · Esc" onClick={() => setProperties(false)}><X size={18}/></Button></div>
                {tool==='erase' && <label className="eraser-size"><AppSelect<'stroke'|'partial'> label="擦除模式" value={tools.eraserMode} onValueChange={tools.setEraserMode} options={[{value:'stroke',label:'整条笔迹'},{value:'partial',label:'局部擦除'}]}/>橡皮擦范围 {tools.eraserSize}px<input aria-label="橡皮擦大小" type="range" min="12" max="96" value={tools.eraserSize} onChange={e=>tools.setEraserSize(Number(e.target.value))}/><small>{tools.eraserMode==='partial'?'只擦除经过的笔迹片段，保留其余部分':'划过删除整条笔迹'}，一次拖动可整组撤销</small></label>}
                {tool==='select'&&objectBox&&<fieldset className="object-properties"><legend>对象属性</legend>{(['x','y','width','height'] as const).map((key,index)=><label key={key}>{['横坐标','纵坐标','宽度','高度'][index]}<input aria-label={['对象横坐标','对象纵坐标','对象宽度','对象高度'][index]} type="number" value={Math.round(objectBox[key]*100)/100} onChange={e=>updateBox(key,e.target.valueAsNumber)}/></label>)}{activeObject?.type!=='stroke'&&<label>不透明度<input aria-label="对象不透明度" type="range" min="10" max="100" value={Math.round(((activeObject?.type==='text'||activeObject?.type==='free-file')?(activeObject.opacity??1):1)*100)} onChange={e=>{if(activeObject?.type==='text'||activeObject?.type==='free-file')commit(selected,{...activeObject,opacity:Number(e.target.value)/100},`opacity:${selected}`);}}/></label>}</fieldset>}
                {tool==='hand'&&<p className="property-hint">拖动画布移动视口；缩放与适配位于右下角。</p>}
                {tool==='select'&&<p className="property-hint">Shift 拖动框选，Shift 点击增减选区；拖动空白平移。选中对象后可编辑下方对象属性。</p>}
                {(tool==='pen'||tool==='text'||tool==='select'&&(activeObject?.type==='stroke'||activeObject?.type==='text'))&&<BrushProperties
                  color={tool==='text'?textColor:tool==='select'&&selectedText?selectedText.color:tool==='select'&&activeObject?.type==='stroke'?activeObject.color:drawingBrush.color}
                  width={tool==='select'&&activeObject?.type==='stroke'?activeObject.width:drawingBrush.width}
                  style={tool==='select'&&activeObject?.type==='stroke'?{opacity:activeObject.opacity??1,smoothing:activeObject.smoothing??0,lineCap:activeObject.lineCap??'round',brush:activeObject.brush??'ink'}:drawingBrush}
                  change={changeBrush} ink={tool==='pen'||tool==='select'&&activeObject?.type==='stroke'}
                  shape={tool==='pen'?shape:undefined} setShape={tool==='pen'&&shape!=='free'?s=>{setShape(s);setLastShape(s);}:undefined}
                  presets={brushPresets} save={saveBrushPresets}
                  text={tool==='text'?textStyle:tool==='select'&&selectedText?selectedText:undefined}
                  changeText={patch=>{if(tool==='select'&&selectedText)commit(selected,{...selectedText,...patch});else setTextStyle(v=>({...v,...patch}));}} />}
                </div>} />
              </div>
              <div id="free-tool-hint" className="free-tool-hint" role="status">{freeToolHint(tool)}</div>
              <div className="free-view-controls" role="toolbar" aria-label="视图控制">
                <Button iconOnly aria-label="缩小" onClick={() => viewport.zoom(1 / 1.2)}><Minus size={16}/></Button>
                <Button iconOnly className="free-zoom" aria-label="重置视图为100%" title="恢复100%缩放，保持中心位置" onClick={() => viewport.show({ ...viewport.current.current, zoom: 1 })}>{zoom}%</Button>
                <Button iconOnly aria-label="放大" onClick={() => viewport.zoom(1.2)}><Plus size={16}/></Button>
                <Button iconOnly aria-label="适配内容" title="适配全部便签与笔迹" onClick={fitContent}><Icon name="fit" size={18}/></Button>
              </div>
              {mobile && reader ? <div className="mobile-reader">{texts.map(([id,item]) => { const value=item.value as TextValue; return <article key={id} data-note-id={id} className="reader-note" onPointerDown={() => setSelected(id)} style={{"--note-ink":value.color} as React.CSSProperties}><header><FileText size={16}/><span>便笺</span><button aria-label="删除便笺" disabled={tool !== "select" || selected !== id} onClick={() => commit(id, removeFreeNoteValue(id))}><Trash2 size={16}/></button></header><textarea aria-label="便笺文字" value={value.text} placeholder="从一句话开始…" onChange={e => updateFreeNote(id,{text:e.target.value},`typing:${id}`)} style={{color:value.color,fontWeight:value.bold?700:400}}/></article>; })}{!texts.length && <p>点“新建便签”，写下第一句话。</p>}</div> : <div className="paper-scroll" ref={viewport.view} tabIndex={0} role="region" aria-label="自由画布" aria-describedby="free-tool-hint"
                onDragOver={e=>{if(window.desktop&&e.dataTransfer.types.includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy';}}}
                onDrop={e=>{if(!window.desktop)return;e.preventDefault();const files=Array.from(e.dataTransfer.files);const point=viewport.point(e.clientX,e.clientY);if(files.length)void importAttachments(()=>window.desktop!.files.drop(files),point);}}
                onPointerDownCapture={event => { if(event.button===0&&!event.shiftKey)setBoxSelection([]); if ((tool === "hand" || event.button === 1) && !(event.target as Element).closest("button,input,select")) { event.stopPropagation(); down(event); } }}
                onPointerDown={event => { if (event.target === event.currentTarget) down(event); }}
                onPointerLeave={()=>{if(tools.cursor.current)tools.cursor.current.style.visibility="hidden";}} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={event => { up(event); }}
                style={{ backgroundSize: `${28 * scale * (scale<.5?4:scale<.75?2:1)}px ${28 * scale * (scale<.5?4:scale<.75?2:1)}px`, backgroundPosition: `${viewport.size.width / 2 - viewport.camera.x * scale}px ${viewport.size.height / 2 - viewport.camera.y * scale}px` }}>
                {!texts.length && !strokes.length && !visible.some(([,i])=>i.value?.type==='free-file') && !tools.draft && (
                  <div className="empty-page">
                    <div className="empty-symbol">
                      <Pencil size={28} />
                      <span>+</span>
                    </div>
                    <h2>先记下来，再慢慢想。</h2>
                    <p>用平移工具移动视口，滚轮缩放。</p>
                    <span>选择文字或画笔开始记录，内容自动保存。</span>
                  </div>
                )}
                <div className="xigra-canvas-frame">
                  {importing&&<div role="status" className="canvas-import-status">{importProgress||"正在导入附件…"}</div>}
                  {tool==='erase' && <div ref={tools.cursor} className="eraser-cursor" style={{width:tools.eraserSize,height:tools.eraserSize}}/>}
                  <div
                    ref={paper}
                    data-testid="paper"
                    className={`paper tool-${tool}`}
                    style={{ transform: `translate(${viewport.size.width / 2 - viewport.camera.x * scale}px, ${viewport.size.height / 2 - viewport.camera.y * scale}px) scale(${scale})` }}
                    onPointerDown={down}
                  >
                    {freeMarquee&&<div className="free-marquee" style={{left:freeMarquee.x,top:freeMarquee.y,width:freeMarquee.width,height:freeMarquee.height,borderWidth:1/scale}}/>}
                    <svg className="ink" width="1" height="1" overflow="visible">
                      {strokes.flatMap(([id, item]) => {
                        if(tools.erased.has(id))return null;
                        const s = (tools.previewId===id ? tools.preview : item.value) as StrokeValue;
                        return (tools.fragments?.get(id)??[s]).map((s,index)=>(
                          <path
                            key={`${id}:${index}`}
                            data-box-selected={boxSelection.includes(id)||undefined}
                            data-testid="stroke"
                            d={brushPath(s)}
                            stroke={s.color}
                            strokeWidth={s.width}
                            opacity={s.opacity??1}
                            fill="none"
                            strokeLinecap={s.lineCap??"round"}
                            strokeDasharray={brushDash(s).join(" ")}
                            strokeLinejoin="round"
                          />
                        ));
                      })}
                      {tools.draft && (
                        <path
                          d={brushPath(tools.draft)}
                          stroke={tools.draft.color}
                          strokeWidth={tools.draft.width}
                          opacity={tools.draft.opacity??1}
                          fill="none"
                          strokeLinecap={tools.draft.lineCap??"round"}
                          strokeDasharray={brushDash(tools.draft).join(" ")}
                          strokeLinejoin="round"
                        />
                      )}
                      {tool==='select' && tools.bounds && <g className="stroke-selection">
                        <rect x={tools.bounds.x-6/scale} y={tools.bounds.y-6/scale} width={tools.bounds.width+12/scale} height={tools.bounds.height+12/scale} fill="none" stroke="var(--xigra-brand)" strokeWidth={1/scale} strokeDasharray={`${4/scale} ${3/scale}`}/>
                        <circle aria-label="调整图形尺寸" data-testid="stroke-resize" cx={tools.bounds.x+tools.bounds.width} cy={tools.bounds.y+tools.bounds.height} r={6/scale} fill="var(--surface)" stroke="var(--xigra-brand)" strokeWidth={2/scale} style={{pointerEvents:'all',cursor:'nwse-resize'}} onPointerDown={e=>{e.stopPropagation();tools.down(e,true);}}/>
                      </g>}
                    </svg>
                    {visible.map(([id,item])=>item.value?.type==='free-file'?<FreeFileCard key={id} interactive={tool === 'select'} value={item.value} selected={selected===id||boxSelection.includes(id)} select={()=>setSelected(id)} change={value=>commit(id,value)} remove={()=>commit(id,null)} point={viewport.point} notify={setToast}/>:null)}
                    {texts.map(([id, item]) => {
                      const value =
                        dragPreview?.id === id
                          ? dragPreview.value
                          : (item.value as TextValue);
                      const position = notePosition(value.x, value.y);
                      return (
                        <div
                          key={id}
                          className={`note spatial-note ${(selected === id||boxSelection.includes(id)) ? "focused" : ""}`}
                          inert={tool !== 'select' && tool !== 'text'}
                          data-note-id={id}
                          data-new={newCanvasNote.current === id ? "" : undefined}
                          style={{
                            left: position.x,
                            top: position.y,
                            width: value.width??NOTE_WIDTH,
                            height: value.height??NOTE_HEIGHT,
                            opacity:value.opacity??1,
                            color: value.color,
                            "--note-ink": value.color,
                            "--card-control-inset": `${24 / scale}px`,
                          } as React.CSSProperties}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelected(id);
                          }}
                        >
                          <div
                            className="note-handle"
                            aria-label="拖动便笺"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              e.preventDefault();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              drag.current = {
                                id,
                                value: { ...value, ...position },
                                x: e.clientX,
                                y: e.clientY,
                              };
                              setDragPreview({ id, value });
                            }}
                          >
                            <GripHorizontal size={15} aria-hidden="true" /><span className="spatial-note-label">便签</span>
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
                                disabled={tool !== 'select' || selected !== id}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={() => commit(id, removeFreeNoteValue(id))}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                          <CanvasNoteContent id={id} value={value} autoOpen={newCanvasNote.current === id} client={client} notify={setToast} onChange={text => {
                            updateFreeNote(id, { text }, `typing:${id}`);
                          }}/>
                          <CardResizeHandle width={value.width ?? NOTE_WIDTH} height={value.height ?? NOTE_HEIGHT} zoom={scale}
                            onPreview={size => setDragPreview({ id, value: { ...value, ...size } })}
                            onCancel={() => setDragPreview(null)} onCommit={size => {
                              setDragPreview(null);
                              updateFreeNote(id, size);
                            }}/>

                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              }{boxSelection.length>0&&<div className="free-selection-status" role="status">已框选 {boxSelection.length} 项 · Delete 删除 · 点击对象单独调整</div>}<footer className="canvas-footer">
                <div className="canvas-footer-state"><StatusPill tone={info?.sharing || !window.desktop ? "saved" : "neutral"}>
                  {info?.sharing
                    ? "局域网共享已开启"
                    : window.desktop
                      ? "本机工作空间"
                      : "已连接共享工作空间"}
                </StatusPill>
                <SaveStatus client={client} recordId={selectedText ? selected : undefined}/></div>
                <span>
                  {texts.length} 张便笺 · {strokes.length} 段笔迹{" "}
                  <span className="footer-separator">|</span>{" "}
                  {tool === "pen"
                    ? "按住鼠标绘图"
                    : tool === "text"
                      ? "点击空白处添加文字"
                      : tool === "erase"
                        ? (tools.eraserMode==='partial'?"局部擦除片段 · 可撤销":"划过删除整条笔迹 · 可撤销")
                        : "空白拖动平移 · Shift 拖动框选 · 滚轮缩放"}
                </span>
              </footer>
            </section>

          </main>
      {exportRequest&&<ExportDialog target={exportTarget} snapshot={exportSnapshot} close={()=>setExportRequest(false)} notify={setToast}/>}
      {window.desktop && <LanNotesDialog lan={window.desktop.lan} request={lanRequest} close={() => setLanRequest(null)} onIncoming={setLanCount} />}
      <Dialog.Root
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="desk-backdrop" />
          <Dialog.Popup
            className={dialogContent === "share" ? "modal xigra-share" : dialogContent === "devices" ? "modal device-hub" : "modal xigra-settings"}
            onKeyDownCapture={event => {
              if (dialogContent !== "share" || event.key !== "Escape" || event.nativeEvent.isComposing) return;
              if (event.currentTarget.querySelector(':is(.app-select, .network-help-trigger)[aria-expanded="true"]')) return;
              event.preventDefault();
              event.stopPropagation();
              setDialog(null);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={dialogContent === "share" ? "白板实时共享" : dialogContent === "devices" ? "设备互传" : "设置"}
          >
            <Dialog.Title className="sr-only">
              {dialogContent === "share" ? "白板实时共享" : dialogContent === "devices" ? "设备互传" : "设置"}
            </Dialog.Title>
            {dialogContent === "share" ? <Dialog.Close render={<Button iconOnly tooltip="关闭弹窗" />} className="modal-close icon-button" aria-label="关闭弹窗"><X size={18} /></Dialog.Close>
              : dialogContent === "devices" ? <PageHeader level={2} title="设备互传" titleAction={<HelpPopover topic="devices" />} className="device-page-header" actions={<Dialog.Close render={<Button iconOnly tooltip="关闭弹窗" />} className="icon-button" aria-label="关闭弹窗"><X size={18} /></Dialog.Close>} />
              : <header className="settings-header"><h2>设置</h2><Dialog.Close render={<Button iconOnly tooltip="关闭弹窗" />} className="icon-button" aria-label="关闭弹窗"><X size={18} /></Dialog.Close></header>}
            {dialogError && dialogContent !== 'share' && <p className="xigra-notice" data-tone="error" role="alert">{dialogError.replace(/^Error invoking remote method '[^']+': Error: /, '')}</p>}
            {dialogContent === "devices" ? <div className="device-hub-actions">
              <button className="device-hub-action" aria-label="打开便签互传" onClick={() => { setDialog(null); setLanRequest({}); }}>
                <MonitorUp size={22} aria-hidden="true"/><span><strong>设备连接与便签互传</strong>{lanCount > 0 && <small className="device-pending">{lanCount} 条便签待接收</small>}</span><ArrowUpRight size={17} aria-hidden="true"/>
              </button>
              <button className="device-hub-action" aria-label="打开白板共享" onClick={() => setDialog("share")}>
                <Network size={22} aria-hidden="true"/><span><strong>白板实时共享</strong><small>{info?.sharing ? "共享已开启" : "当前未共享"}</small></span><ArrowUpRight size={17} aria-hidden="true"/>
              </button>
            </div> : dialogContent === "share" ? (
              <WhiteboardShare info={info} desktop={Boolean(window.desktop)} address={selectedShareAddress}
                working={working} operation={shareOperation} error={dialogError}
                retry={shareRetry ? () => { if (shareRetry === 'refresh') void refreshInfo(true); else void share(shareRetry === 'start'); } : dialogError ? () => void refreshInfo(true) : undefined}
                onAddress={setShareAddress} onShare={enabled => void share(enabled)} onRefresh={() => void refreshInfo(true)}
                onCopy={value => void copy(value)} onBack={() => setDialog("devices")} />
            ) : (
              <SettingsLayout actions={{
                appearance: <AppearanceActions controller={appearance} />,
                backup: <Button className="button" onClick={() => download(
                  new Blob([JSON.stringify({ ...client.base, items: client.view(), conflicts: client.conflicts }, null, 2)], { type: "application/json" }),
                  "Arasn-完整备份.json",
                )}><Download size={16} /> 导出完整备份</Button>,
              }}>{{ appearance: <AppearancePanel controller={appearance} />,
                triggers: <>{window.desktop && info ? <TriggerSettings info={info} onApplied={setInfo} /> : <p>全局快捷键与触发器仅在桌面应用中可用。</p>}</>, preferences: <>
                <h3 className="settings-preferences-heading">应用偏好</h3>
                <label className="setting-toggle">
                  <span>
                    开机自启动<small>登录 Windows 后运行，保存后核验系统注册</small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="开机自启动"
                    checked={info?.openAtLogin || false}
                    disabled={!info?.autoStartSupported || working}
                    title={info?.autoStartReason || '仅桌面应用支持'}
                    onChange={(e) =>
                      changeSettings({ openAtLogin: e.target.checked })
                    }
                  />
                </label>
                <div className="startup-status">
                  <p className="setting-hint" role="status" data-startup-status={info?.startupStatus}>{info?.autoStartReason || '请在桌面应用管理系统自启。'}</p>
                  {window.desktop && <Button className="button" disabled={working} onClick={() => void refreshInfo()}>刷新系统状态</Button>}
                </div>
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
                    启动时隐藏窗口
                    <small>手动启动也常驻托盘，按快捷键呼出</small>
                  </span>
                  <input
                    type="checkbox"
                    aria-label="启动时隐藏窗口"
                    checked={info?.startHidden || false}
                    disabled={!window.desktop || working}
                    onChange={(e) =>
                      changeSettings({ startHidden: e.target.checked })
                    }
                  />
                </label>
                </>, backup: <>
                <h3>保存一份完整备份</h3>
                <p>
                  图片仅导出可见内容；完整备份保留全部文字、笔迹和未提交改动。
                </p>
                <div className="modal-tip">
                  关闭窗口会隐藏到托盘；完全退出请使用托盘菜单。网页参与者不支持全局快捷键。
                </div>
              </> }}</SettingsLayout>
            )}
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <FocusModality /><LagoonMotion/>
      {window.desktop && <FilePicker  open={filesOpen} onOpenChange={setFilesOpen} onChoose={files => attachFiles(files, attachmentRecord !== null ? "record" : "canvas", attachmentRecord === "" ? records.ensureRecord() : attachmentRecord)} />}
      <Dialog.Root  open={indexOpen} onOpenChange={setIndexOpen}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="modal lagoon-index"><Dialog.Title>此页便笺</Dialog.Title><Dialog.Description>选择便笺，继续记录。</Dialog.Description>{texts.map(([id,item]) => <button className="index-item" key={id} onClick={() => { setIndexOpen(false); locateNote(id); }}><FileText size={18}/><span>{(item.value as TextValue).text.split("\n")[0] || "未命名便笺"}</span></button>)}<Dialog.Close className="button">关闭</Dialog.Close></Dialog.Popup></Dialog.Portal></Dialog.Root>
      <GlobalRecordSearch  session={records} onSelect={() => { setQuickCapture(false); setWorkbenchPage("records"); }} blocked={recordImporting} open={recordSearchOpen} setOpen={open => { setRecordSearchOpen(open); if (!open) records.focus(); }} />
      <Dialog.Root  open={Boolean(deleteRecord)} onOpenChange={open => { if (!open) setDeleteRecord(""); }}>
        <Dialog.Portal><Dialog.Backdrop className="desk-backdrop" />
          <Dialog.Popup className="modal xigra-record-dialog">
            <Dialog.Title>删除便笺</Dialog.Title>
            <Dialog.Description>确认删除「{recordTitle(records.rows.find(row => row.id === deleteRecord)?.text ?? "")}」？</Dialog.Description>
            <div className="xigra-record-dialog-actions">
              <Dialog.Close className="button" autoFocus>取消</Dialog.Close>
              <button className="button xigra-delete-button" onClick={() => { records.remove(deleteRecord); setDeleteRecord(""); }}>确认删除</button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <CommandMenu

        open={commandOpen}
        onOpenChange={setCommandOpen}
        operationsOnly={Boolean(window.desktop)}
        actions={[
          ...(window.desktop ? [{label:"文件",hint:"本机文件",run:openFilePage}] : []),
          ...(!window.desktop ? [{
            label: "写一张便笺",
            hint: "新增",
            disabled: newNoteDisabled,
            run: newNote,
          }] : []),
          {
            label: "自由绘图",
            hint: "画笔",
            run: () => { setWorkbenchPage("canvas"); setTool("pen"); },
          },
          { label: window.desktop ? "设备互传" : "白板共享", hint: window.desktop ? "连接设备与白板共享" : "共享当前白板", run: () => setDialog(window.desktop ? "devices" : "share") },
          { label: "截图 / 导出", hint: "PNG", disabled: !inCanvas, run: exportImage },
          {
            label: "设置与快捷键",
            hint: "外观与偏好",
            run: () => setDialog("settings"),
          },
          ...(!window.desktop ? texts.map(([id, item], index) => ({
            label: `定位：${(item.value as TextValue).text.split("\n")[0] || `未命名便笺 ${index + 1}`}`,
            hint: "便笺",
            run: () => locateNote(id),
          })) : []),
        ]}
      />
      <Notification notice={notice} onDismiss={dismissNotice} />
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<NotificationProvider><App /></NotificationProvider>);
