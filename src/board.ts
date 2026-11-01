export type TextValue = {
  type: "text";
  text: string;
  x: number;
  y: number;
  color: string;
};
export type StrokeValue = {
  type: "stroke";
  color: string;
  width: number;
  points: number[][];
};
export type Value = TextValue | StrokeValue;
export type Item = { version: number; value: Value | null };
export type Snapshot = {
  roomId: string;
  revision: number;
  items: Record<string, Item>;
};
type Operation = {
  id: string;
  opId: string;
  expected: number;
  value: Value | null;
};
export type Recovery = {
  roomId: string;
  pending: Operation[];
  conflicts: Value[];
  base: Snapshot;
};
export type DesktopInfo = {
  shortcut: string;
  shortcutOk: boolean;
  sharing: boolean;
  links: string[];
  dataPath: string;
};
declare global {
  interface Window {
    desktop?: {
      info(): Promise<DesktopInfo>;
      share(enabled: boolean): Promise<DesktopInfo>;
      hide(): Promise<void>;
      shortcut(value: string): Promise<DesktopInfo>;
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

export class BoardClient {
  base: Snapshot = { roomId: "", revision: 0, items: {} };
  pending: Operation[] = [];
  conflicts: Value[] = [];
  status = "正在连接";
  error = "";
  ready = false;
  stopped = false;
  private busy = false;
  private inFlight = "";
  private token =
    location.hash.slice(1) || sessionStorage.getItem("arasn-token") || "";
  private timer = 0;
  private savedValue = "";
  private changed: () => void;
  constructor(changed: () => void) {
    this.changed = changed;
    if (this.token) sessionStorage.setItem("arasn-token", this.token);
    history.replaceState(null, "", location.pathname);
  }
  view() {
    const items = { ...this.base.items };
    for (const op of this.pending)
      items[op.id] = { version: op.expected + 1, value: op.value };
    return items;
  }
  private persist() {
    if (!this.ready) return;
    const value = JSON.stringify({
      roomId: this.base.roomId,
      base: this.base,
      pending: this.pending,
      conflicts: this.conflicts,
    });
    if (value === this.savedValue) return;
    try {
      localStorage.setItem("arasn-recovery", value);
      this.savedValue = value;
      if (window.desktop)
        void window.desktop.saveRecovery(value).catch(() => {
          this.savedValue = "";
          this.error = "恢复副本写入失败，请导出当前页面";
          this.changed();
        });
    } catch {
      this.error = "浏览器存储空间不足，请导出当前页面";
    }
  }
  async start() {
    let saved: Recovery | null = null;
    try {
      saved = window.desktop
        ? await window.desktop.recovery()
        : JSON.parse(localStorage.getItem("arasn-recovery") || "null");
      const snapshot = await this.request("/api/board");
      this.base = snapshot;
      if (saved?.roomId === snapshot.roomId) {
        this.pending = saved.pending;
        this.conflicts = saved.conflicts;
      }
      this.ready = true;
    } catch {
      if (saved?.base) {
        this.base = saved.base;
        this.pending = saved.pending;
        this.conflicts = saved.conflicts;
        this.ready = true;
      }
      this.status = "连接中断";
      this.error = "无法连接共享主机；本机改动会保留，请检查主机和链接";
    }
    if (this.stopped) return;
    this.changed();
    await this.tick();
    this.timer = window.setInterval(() => void this.tick(), 1000);
  }
  stop() {
    this.stopped = true;
    clearInterval(this.timer);
  }
  edit(id: string, value: Value | null) {
    if (!this.ready) return;
    const last = this.pending.at(-1);
    if (last?.id === id && last.opId !== this.inFlight) last.value = value;
    else
      this.pending.push({
        id,
        opId: uid(),
        expected: this.view()[id]?.version || 0,
        value,
      });
    this.status = "正在保存";
    this.persist();
    this.changed();
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
  async tick() {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      if (!this.ready) {
        this.base = await this.request("/api/board");
        this.ready = true;
      }
      while (this.pending.length && !this.stopped) {
        const op = this.pending[0];
        this.inFlight = op.opId;
        try {
          const snapshot = await this.request("/api/ops", op);
          if (snapshot.roomId !== this.base.roomId)
            throw new Error("共享页面已更换，请重新连接");
          this.base = snapshot;
          this.pending.shift();
        } catch (error) {
          const e = error as Error & { status?: number };
          if (e.status === 409 || e.status === 400 || e.status === 413) {
            const latest = this.pending
              .filter((p) => p.id === op.id)
              .at(-1)?.value;
            if (latest) this.conflicts.push(latest);
            this.pending = this.pending.filter((p) => p.id !== op.id);
            this.error = e.message;
          } else throw e;
        } finally {
          this.inFlight = "";
          this.persist();
        }
      }
      const snapshot = await this.request("/api/board");
      if (snapshot.roomId !== this.base.roomId)
        throw new Error("共享页面已更换，请导出本机改动后重新打开链接");
      this.base = snapshot;
      this.status = this.pending.length ? "正在保存" : "已保存";
      if (!this.conflicts.length) this.error = "";
      this.persist();
    } catch (error) {
      this.status = "离线 · 改动已暂存";
      this.error = (error as Error).message || "连接失败";
    } finally {
      this.busy = false;
      if (!this.stopped) this.changed();
    }
  }
  recover() {
    const values = [...this.conflicts];
    this.conflicts = [];
    this.error = "";
    for (const value of values)
      this.edit(
        uid(),
        value.type === "text"
          ? {
              ...value,
              x: Math.min(1320, value.x + 30),
              y: Math.min(860, value.y + 30),
            }
          : value,
      );
    this.persist();
    this.changed();
  }
}
