import type { LanBridge } from "./xigra/LanNotesDialog";
import type { TriggerAction, TriggerBridge, TriggerConfig } from "./xigra/TriggerSettings";
import type { TopologyLayout, TopologyViewport } from "./topology";
import { enclosingBounds, noteLayout, vacantLayout } from "./topology.ts";

export type ManagedFile = {
  id: string;
  name: string;
  category: string;
  size: number;
  sha256: string;
  deleted_at: string | null;
  status?: "ready" | "purged";
};
export type ImportResult = {
  ok: boolean;
  file?: ManagedFile;
  name?: string;
  error?: string;
};
export type TextValue = {
  type: "text";
  text: string;
  title?: string;
  x: number;
  y: number;
  color: string;
  fontSize?: number;
  bold?: boolean;
  width?: number; height?: number; opacity?: number;
  topology?: TopologyLayout;
  localOnly?: true;
};
export type NodeValue = { type: "node"; text: string; title?: string; topology: TopologyLayout };
export type ContentRef = { kind: "record" | "file"; id: string };
export type CanvasNodeValue = { type: "canvas-node"; roomId: string; canvasId: string; contentRef: ContentRef; layout: TopologyLayout };
export type CanvasEdgeValue = { type: "canvas-edge"; roomId: string; canvasId: string; fromNodeId: string; toNodeId: string; label: string; relationType?: "related" | "reference" | "dependency" | "resolves" | "source" | "attachment"; direction: "none" | "forward" | "both" };
export type ContentLinkValue = { type: "content-link"; roomId: string; recordId: string; targetRef: ContentRef };
export type StrokeValue = {
  type: "stroke";
  color: string;
  width: number;
  opacity?: number;
  points: number[][];
  smoothing?: number;
  lineCap?: 'round'|'butt'|'square';
  brush?: 'ink'|'marker'|'dash';
};
export type FreeFileValue = { type: "free-file"; roomId: string; contentRef: {kind:"file";id:string}; name: string; category: string; x:number; y:number; width:number; height:number; opacity?:number; localOnly:true };
export type Value = FreeFileValue | TextValue | StrokeValue | NodeValue | CanvasNodeValue | CanvasEdgeValue | ContentLinkValue;
export type Item = { version: number; value: Value | null };
export type Snapshot = {
  roomId: string;
  revision: number;
  items: Record<string, Item>;
};
export type CanvasMigrationResult = { roomId: string; revision: number; canvasId: string; added: number; migrated?: boolean; backup?: string };
type Operation = {
  id: string;
  opId: string;
  expected: number;
  value: Value | null;
};
type RejectedOperation = { operation: Operation; message: string };
export type Recovery = {
  roomId: string;
  pending: Operation[];
  conflicts: Value[];
  base: Snapshot;
  rejected?: RejectedOperation[];
  recentRecords?: string[];
  pinnedRecords?: string[];
};
export type DesktopInfo = {
  expanded: boolean;
  shortcut: string;
  shortcutOk: boolean;
  triggers: TriggerConfig;
  triggerActions: Record<TriggerAction, string>;
  triggerFailures: Record<string, string>;
  triggerWarning?: string;
  mouseTriggersSupported: boolean;
  edgeTriggersSupported: boolean;
  sharing: boolean;
  links: string[];
  networks: import('./xigra/NetworkPicker').NetworkInterface[];
  shareHost: string | null;
  shareAddressAvailable: boolean;
  dataPath: string;
  theme: "system" | "light" | "dark";
  alwaysOnTop: boolean;
  startMinimized: boolean;
  startHidden: boolean;
  openAtLogin: boolean;
  autoStartSupported: boolean;
  startupStatus: 'unsupported' | 'enabled' | 'disabled' | 'blocked' | 'error';
  autoStartReason: string;
  freeViewport?: TopologyViewport;
  topologyViewport?: TopologyViewport;
  canvasOptions?: import("./topology").CanvasOptions;
  brushPresets?: import('./brush').BrushPreset[];
};
declare global {
  interface Window {
    desktop?: {
      readonly initialTheme: DesktopInfo["theme"];
      canvas: {
        migrate(options?: { dryRun?: boolean; roomId?: string; revision?: number }): Promise<CanvasMigrationResult>;
        create(options: { roomId: string; recordId: string; nodeId: string; opId: string; layout: TopologyLayout; text?: string }): Promise<Snapshot>;
      };
      lan: LanBridge;
      files: {
        originalImage(id: string): Promise<string>;
        thumbnail(id: string): Promise<string | null>;
        list(
          options: Record<string, unknown>,
        ): Promise<{ rows: ManagedFile[]; total: number }>;
        choose(): Promise<ImportResult[]>;
        drop(files: File[]): Promise<ImportResult[]>;
        action(
          action: string,
          args?: Record<string, unknown>,
        ): Promise<unknown>;
        paste(): Promise<{
          kind: string;
          text?: string;
          results?: ImportResult[];
        }>;
        clearPanel(): Promise<Snapshot>;
        progress(
          callback: (progress: {
            name: string;
            bytes: number;
            total: number;
          }) => void,
        ): () => void;
      };
      onBoard(callback: () => void): () => void;
      info(): Promise<DesktopInfo>;
      layout(value: boolean): Promise<DesktopInfo>;
      onLayout(callback: (value: boolean) => void): () => void;
      onFocus(callback: () => void): () => void;
      share(enabled: boolean, host?: string): Promise<DesktopInfo>;
      hide(): Promise<void>;
      onWindowIntent(callback: (action: "hide" | "quit") => Promise<boolean>): () => void;
      shortcut(value: string): Promise<DesktopInfo>;
      triggers: TriggerBridge;
      copyText(text: string): Promise<void>;
      settings(value: Partial<DesktopInfo>): Promise<DesktopInfo>;
      recovery(): Promise<Recovery | null>;
      saveRecovery(value: string): Promise<void>;
    };
  }
}
// crypto.randomUUID is unavailable on plain HTTP LAN pages.
export function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}

const SAVE_DELAY = 150;
const MAX_SAVE_DELAY = 1000;
const RETRY_DELAY = 1500;
const isReferenceValue = (value: Value | null) => Boolean(value && ["canvas-node", "canvas-edge", "content-link"].includes(value.type));

function validRecovery(value: Recovery): boolean {
  const isValue = (item: Value) => ["text", "stroke", "node", "canvas-node", "canvas-edge", "content-link"].includes(item?.type);
  const isOperation = (op: Operation) => op && typeof op.id === "string" &&
    typeof op.opId === "string" && Number.isSafeInteger(op.expected) && op.expected >= 0 &&
    (op.value === null || isValue(op.value));
  return typeof value.roomId === "string" && value.base?.roomId === value.roomId &&
    Number.isSafeInteger(value.base.revision) && Boolean(value.base.items) &&
    Array.isArray(value.pending) && value.pending.every(isOperation) &&
    Array.isArray(value.conflicts) && value.conflicts.every(isValue) &&
    (value.rejected === undefined || (Array.isArray(value.rejected) &&
      value.rejected.every(item => item && isOperation(item.operation) && typeof item.message === "string")));
}

export class BoardClient {
  private canvasAdds = new Map<string, Promise<{ nodeId: string; existing: boolean }>>();
  private unsubscribe?: () => void;
  private editTimer = 0;
  private firstEditAt?: number;
  private refreshTimer = 0;
  base: Snapshot = { roomId: "", revision: 0, items: {} };
  pending: Operation[] = [];
  recentRecords: string[] = [];
  pinnedRecords: string[] = [];
  restoredRecordId = "";
  ready = false;
  stopped = false;
  private activeTick?: Promise<void>;
  private sent = new WeakSet<Operation>();
  private legacyConflicts: Value[] = [];
  private rejected: RejectedOperation[] = [];
  private connectionError = "";
  private roomChanged = false;
  private recoveryError = "";
  private preserveRecovery = "";
  detachedRecovery = "";
  private savedValue = "";
  private durableOps = new Set<Operation>();
  private recoveryRequested = false;
  private recoveryWrite?: Promise<void>;
  private pendingPins?: string[];
  private token = location.hash.slice(1) || sessionStorage.getItem("arasn-token") || "";
  private changed: () => void;

  constructor(changed: () => void) {
    this.changed = changed;
    if (this.token) sessionStorage.setItem("arasn-token", this.token);
    history.replaceState(null, "", location.pathname);
  }

  get conflicts() {
    return [...this.legacyConflicts, ...this.rejected.flatMap(({ operation }) => operation.value ? [operation.value] : [])];
  }

  get hasFailedDeletions() {
    return this.rejected.some(({ operation }) => operation.value === null);
  }

  recordDeletionState(id: string) {
    if (this.pending.some(op => op.id === id)) return "pending";
    if (this.rejected.some(({ operation }) => operation.id === id && operation.value === null)) return "failed";
    return this.base.items[id]?.value === null ? "deleted" : "failed";
  }

  get latestPendingRecordId() {
    const seen = new Set<string>();
    for (let index = this.pending.length - 1; index >= 0; index--) {
      const { id, value } = this.pending[index];
      if (seen.has(id)) continue;
      if (value?.type === "text" || value?.type === "node") return id;
      seen.add(id);
    }
    return "";
  }

  get error() {
    const rejection = this.rejected.at(-1);
    return this.preserveRecovery ||
      (rejection ? (rejection.operation.value === null ? "删除未保存：" : "保存未完成：") + rejection.message : "") ||
      (this.legacyConflicts.length ? "有本机改动需要恢复" : "") ||
      (this.pending.length ? this.recoveryError : "") || this.connectionError;
  }

  get canRetry() {
    return Boolean(this.connectionError || ((this.pending.length || this.rejected.length || this.legacyConflicts.length) && this.recoveryError));
  }

  saveState(id?: string, empty = false): { label: string; tone: "neutral" | "saved" | "pending" | "error" } {
    const relevant = id === undefined ? this.pending : this.pending.filter(op => op.id === id);
    if (this.rejected.some(({ operation }) => id === undefined || operation.id === id) || this.legacyConflicts.length)
      return { label: "保存需要处理", tone: "error" };
    if (relevant.length) {
      const durable = relevant.every(op => this.durableOps.has(op));
      if (!durable && (this.connectionError || this.recoveryError || this.preserveRecovery))
        return { label: "尚未落盘", tone: "error" };
      if (durable && this.connectionError)
        return { label: "已暂存 · 待同步", tone: "pending" };
      return { label: durable ? "正在保存" : "保存中 · 尚未落盘", tone: "pending" };
    }
    if (!this.ready) return { label: this.connectionError ? "连接中断" : "正在连接", tone: this.connectionError ? "error" : "neutral" };
    return empty ? { label: "等待输入", tone: "neutral" } : { label: "已保存", tone: "saved" };
  }

  view() {
    const items = { ...this.base.items };
    for (const op of this.pending)
      items[op.id] = { version: op.expected + 1, value: op.value };
    return items;
  }

  private recoverySnapshot() {
    return {
      roomId: this.base.roomId,
      base: this.base,
      pending: [...this.pending],
      conflicts: this.legacyConflicts,
      rejected: this.rejected,
      recentRecords: this.recentRecords,
      pinnedRecords: this.pendingPins ?? this.pinnedRecords,
    };
  }

  private persist() {
    if (!this.ready || this.stopped || this.preserveRecovery) return;
    this.recoveryRequested = true;
    this.recoveryWrite ??= this.writeRecovery().finally(() => {
      this.recoveryWrite = undefined;
      if (this.recoveryRequested) this.persist();
    });
  }

  private async writeRecovery() {
    while (this.recoveryRequested && !this.stopped) {
      this.recoveryRequested = false;
      const snapshot = this.recoverySnapshot();
      try {
        const value = JSON.stringify(snapshot);
        if (value !== this.savedValue) {
          if (window.desktop) await window.desktop.saveRecovery(value);
          else localStorage.setItem("arasn-recovery", value);
          this.savedValue = value;
        }
        // Coalescing replaces the operation object, so an old acknowledgement cannot cover new text.
        this.durableOps = new Set(snapshot.pending);
        this.pinnedRecords = snapshot.pinnedRecords;
        this.recoveryError = "";
      } catch {
        if (!this.recoveryRequested) this.recoveryError = "恢复副本写入失败，请重试或复制正文";
      }
      if (!this.stopped) this.changed();
    }
  }

  async ensureRecoverable() {
    const pendingIsDurable = () => this.pending.every(op => this.durableOps.has(op));
    const hasConflicts = () => Boolean(this.rejected.length || this.legacyConflicts.length);
    if (this.pendingPins) await this.recoveryWrite;
    if (pendingIsDurable() && !hasConflicts()) return true;
    this.persist();
    await this.recoveryWrite;
    return pendingIsDurable() && (!hasConflicts() || (!this.recoveryError && !this.preserveRecovery));
  }

  private loadRecovery(saved: Recovery) {
    this.pending = saved.pending;
    this.legacyConflicts = saved.conflicts;
    this.rejected = saved.rejected ?? [];
    this.recentRecords = Array.isArray(saved.recentRecords)
      ? [...new Set(saved.recentRecords.filter(id => typeof id === "string" && /^[a-f0-9-]{16,64}$/i.test(id)))].slice(0, 32)
      : [];
    this.pinnedRecords = Array.isArray(saved.pinnedRecords)
      ? [...new Set(saved.pinnedRecords.filter(id => typeof id === "string" && /^[a-f0-9-]{16,64}$/i.test(id)))]
      : [];
    this.restoredRecordId = this.latestPendingRecordId;
    // A recovered operation may already have reached the host before the old process exited.
    this.sent = new WeakSet(this.pending);
    this.durableOps = new Set(this.pending);
    this.savedValue = JSON.stringify(saved);
  }

  async start() {
    let saved: Recovery | null = null;
    try {
      const value = window.desktop
        ? await window.desktop.recovery()
        : JSON.parse(localStorage.getItem("arasn-recovery") || "null");
      if (value !== null) {
        if (typeof value !== "object" || !validRecovery(value)) {
          this.detachedRecovery = JSON.stringify(value);
          this.preserveRecovery = "旧恢复副本格式异常，已保留原内容";
        } else saved = value;
      }
    } catch {
      this.preserveRecovery = "无法读取旧恢复副本，已暂停覆盖，请重启后重试";
    }
    if (this.stopped) return;
    try {
      this.base = await this.request("/api/board");
      if (saved?.roomId === this.base.roomId) this.loadRecovery(saved);
      else if (saved && (saved.pending.length || saved.conflicts.length || saved.rejected?.length)) {
        this.detachedRecovery = JSON.stringify(saved);
        this.preserveRecovery = "旧草稿来自另一工作页，已保留原恢复副本";
      }
      this.ready = true;
    } catch {
      if (saved) {
        this.base = saved.base;
        this.loadRecovery(saved);
        this.ready = true;
      }
      this.connectionError = "无法连接工作页，请检查应用或共享链接";
    }
    if (this.stopped) return;
    this.changed();
    await this.tick();
    if (this.stopped) return;
    const refresh = () => { if (!document.hidden) void this.tick(); };
    if (window.desktop) {
      const a = window.desktop.onBoard(refresh), b = window.desktop.onFocus(() => void this.tick());
      this.unsubscribe = () => { a(); b(); };
    } else this.refreshTimer = window.setInterval(refresh, 2000);
  }

  stop() {
    this.stopped = true;
    clearInterval(this.refreshTimer);
    clearTimeout(this.editTimer);
    this.unsubscribe?.();
  }

  private schedule(delay: number) {
    clearTimeout(this.editTimer);
    this.editTimer = window.setTimeout(() => void this.tick(), delay);
  }

  private enqueue(id: string, value: Value | null) {
    const last = this.pending.at(-1);
    const ownedValue = structuredClone(value);
    if (last?.id === id && !this.sent.has(last))
      this.pending[this.pending.length - 1] = { ...last, value: ownedValue };
    else this.pending.push({ id, opId: uid(), expected: this.view()[id]?.version || 0, value: ownedValue });
  }

  edit(id: string, value: Value | null) {
    if (!this.ready || this.stopped) return;
    this.enqueue(id, value);
    this.persist();
    this.changed();
    if (this.roomChanged) return;
    const now = Date.now();
    this.firstEditAt ??= now;
    this.schedule(Math.max(0, Math.min(SAVE_DELAY, this.firstEditAt + MAX_SAVE_DELAY - now)));
  }

  rememberRecord(id: string) {
    if (!this.ready || this.recentRecords[0] === id) return;
    this.recentRecords = [id, ...this.recentRecords.filter(previous => previous !== id)].slice(0, 32);
    this.persist();
    this.changed();
  }

  async toggleRecordPin(id: string) {
    if (!this.ready || this.stopped || this.preserveRecovery || this.roomChanged ||
        this.pendingPins || !["text", "node"].includes(this.view()[id]?.value?.type ?? "")) return false;
    const retained = this.pinnedRecords.filter(key => key !== id && this.base.items[key]?.value !== null);
    const next = this.pinnedRecords.includes(id) ? retained : [id, ...retained];
    this.pendingPins = next;
    this.persist();
    await this.recoveryWrite;
    this.pendingPins = undefined;
    return this.pinnedRecords === next;
  }

  retry() {
    this.persist();
    void this.tick();
  }

  async flush() {
    await this.tick();
    if (this.pending.length && !this.connectionError) await this.tick();
    if (!this.ready || this.pending.length || this.rejected.length || this.legacyConflicts.length || this.roomChanged)
      throw new Error("有改动尚未保存，请先处理保存提示");
  }

  async clearPanel() {
    await this.flush();
    this.base = await window.desktop!.files.clearPanel();
    this.persist();
    this.changed();
  }

  async migrateCanvas(dryRun = true) {
    if (!window.desktop || this.preserveRecovery) throw new Error("请先处理恢复副本，再迁移关系画布");
    await this.flush();
    await this.recoveryWrite;
    const result = await window.desktop.canvas.migrate({ dryRun, roomId: this.base.roomId, revision: this.base.revision });
    if (!dryRun) await this.tick();
    return result;
  }

  async createCanvasRecord(layout: TopologyLayout, text = "") {
    const roomId = this.base.roomId;
    const recordId = uid(), nodeId = uid(), opId = uid();
    await this.flush();
    if (this.base.roomId !== roomId) throw new Error("工作页已更换，请重试");
    this.base = await window.desktop!.canvas.create({ roomId, recordId, nodeId, opId, layout, text });
    this.persist();
    this.changed();
    return nodeId;
  }

  addRecordToCanvas(recordId: string, viewport?: TopologyViewport) {
    const roomId = this.base.roomId, key = `${roomId}:${recordId}`;
    const active = this.canvasAdds.get(key);
    if (active) return active;
    const add = async () => {
      await this.flush();
      if (this.base.roomId !== roomId) throw new Error("工作页已更换，请重试");
      const status = await window.desktop!.canvas.migrate({ dryRun: true, roomId, revision: this.base.revision });
      if (!status.migrated) throw new Error("请先在工作站备份并启用关系画布，再加入记录");
      if (this.base.roomId !== roomId) throw new Error("工作页已更换，请重试");
      const items = this.view(), source = items[recordId]?.value;
      if ((source?.type !== "text" && source?.type !== "node") || !source.text.trim()) throw new Error("请先保存一条有效记录");
      const found = Object.entries(items).find(([, item]) => item.value?.type === "canvas-node" && item.value.roomId === roomId &&
        item.value.canvasId === roomId && item.value.contentRef.kind === "record" && item.value.contentRef.id === recordId);
      const nodeId = found?.[0] ?? uid();
      const bounds = enclosingBounds(Object.values(items).flatMap(item => item.value?.type === "canvas-node" &&
        item.value.canvasId === roomId && !item.value.layout.hidden ? [item.value.layout] : []));
      const center = viewport?.roomId === roomId ? viewport : { x: bounds ? bounds.x + bounds.width / 2 : 0, y: bounds ? bounds.y + bounds.height / 2 : 0 };
      const value: CanvasNodeValue = found ? found[1].value as CanvasNodeValue : { type: "canvas-node", roomId, canvasId: roomId,
        contentRef: { kind: "record", id: recordId }, layout: vacantLayout(noteLayout(center.x - 140, center.y - 70), items, roomId) };
      if (!found || value.layout.hidden) this.edit(nodeId, { ...value, layout: { ...value.layout, hidden: false } });
      await this.flush();
      const saved = this.base.items[nodeId]?.value;
      const savedSource = this.base.items[recordId]?.value;
      if (savedSource?.type !== "text" && savedSource?.type !== "node") throw new Error("原记录已删除，无法确认加入");
      if (this.base.roomId !== roomId || saved?.type !== "canvas-node" || saved.layout.hidden || saved.contentRef.kind !== "record" || saved.contentRef.id !== recordId) throw new Error("节点尚未保存，请重试");
      return { nodeId, existing: Boolean(found) };
    };
    const promise = add();
    this.canvasAdds.set(key, promise);
    void promise.then(() => this.canvasAdds.delete(key), () => this.canvasAdds.delete(key));
    return promise;
  }

  async request(endpoint: string, operation?: Operation): Promise<Snapshot> {
    if (!operation && this.ready)
      endpoint += `?revision=${this.base.revision}&roomId=${this.base.roomId}`;
    const response = await fetch(endpoint, {
      method: operation ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(operation ? { "Content-Type": "application/json" } : {}),
      },
      body: operation ? JSON.stringify(operation) : undefined,
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 204) return this.base;
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error), { status: response.status });
    return result;
  }

  private acceptSnapshot(snapshot: Snapshot) {
    if (this.ready && snapshot.roomId !== this.base.roomId) {
      this.roomChanged = true;
      throw new Error("工作页已更换，本机改动保留在原工作页，请复制内容后重新打开");
    }
    this.base = snapshot;
    this.ready = true;
    this.roomChanged = false;
  }

  tick(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.activeTick) return this.activeTick;
    clearTimeout(this.editTimer);
    this.firstEditAt = undefined;
    this.activeTick = this.drain().finally(() => {
      this.activeTick = undefined;
      if (this.stopped) return;
      if (this.pending.length && !this.roomChanged && (!this.connectionError || window.desktop))
        this.schedule(this.connectionError ? RETRY_DELAY : 0);
      this.changed();
    });
    return this.activeTick;
  }

  private async drain() {
    try {
      if (!this.ready || this.connectionError) {
        this.acceptSnapshot(await this.request("/api/board"));
        this.connectionError = "";
      }
      while (this.pending.length && !this.stopped) {
        const operation = this.pending[0];
        this.sent.add(operation);
        try {
          this.acceptSnapshot(await this.request("/api/ops", operation));
          this.pending.shift();
          if (operation.value === null) {
            this.recentRecords = this.recentRecords.filter(id => id !== operation.id);
            this.rejected = this.rejected.filter(({ operation: failed }) => failed.id !== operation.id || failed.value !== null);
          }
        } catch (error) {
          const { status, message } = error as Error & { status?: number };
          if (status !== 409 && status !== 400 && status !== 413) throw error;
          const latest = this.pending.filter(op => op.id === operation.id).at(-1)!;
          this.rejected.push({ operation: latest, message });
          this.pending = this.pending.filter(op => op.id !== operation.id);
        }
        this.persist();
        this.changed();
      }
      if (!this.stopped) this.acceptSnapshot(await this.request("/api/board"));
      this.connectionError = "";
      this.persist();
    } catch (error) {
      this.connectionError = (error as Error).message || "连接失败";
      this.persist();
    }
  }

  recover() {
    if (!this.ready || this.stopped) return;
    const values = this.conflicts.filter(value => !isReferenceValue(value));
    this.legacyConflicts = this.legacyConflicts.filter(isReferenceValue);
    this.rejected = this.rejected.filter(({ operation }) => operation.value === null || isReferenceValue(operation.value));
    for (const value of values)
      this.enqueue(uid(), value.type === "text"
        ? { ...value, x: Math.min(1320, value.x + 30), y: Math.min(860, value.y + 30) }
        : value);
    this.persist();
    this.changed();
    if (values.length && !this.roomChanged) this.schedule(0);
  }

  keepFailedDeletes() {
    this.rejected = this.rejected.filter(({ operation }) => operation.value !== null);
    this.persist();
    this.changed();
  }
}
