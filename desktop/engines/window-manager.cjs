const WORKBENCH_WINDOW = { width: 1160, height: 820, minWidth: 520, minHeight: 420 };
const WORKSPACE_KEY = "workspace-window-state-v1";
const validPosition = bounds => Number.isInteger(bounds?.x) && Number.isInteger(bounds?.y);
const validBounds = bounds => validPosition(bounds) && Number.isInteger(bounds.width) && bounds.width > 0 &&
  Number.isInteger(bounds.height) && bounds.height > 0;

class WindowManager {
  constructor(window, storage, screen) {
    this.window = window;
    this.storage = storage;
    this.screen = screen;
  }

  fit(bounds, area) {
    const minWidth = Math.min(WORKBENCH_WINDOW.minWidth, area.width);
    const minHeight = Math.min(WORKBENCH_WINDOW.minHeight, area.height);
    const width = Math.max(minWidth, Math.min(bounds.width, area.width));
    const height = Math.max(minHeight, Math.min(bounds.height, area.height));
    const target = {
      x: Math.max(area.x, Math.min(bounds.x ?? Math.round(area.x + (area.width - width) / 2), area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y ?? Math.round(area.y + (area.height - height) / 2), area.y + area.height - height)),
      width, height,
    };
    this.window.setMinimumSize(minWidth, minHeight);
    const current = this.window.getBounds();
    if (Object.keys(target).some(key => target[key] !== current[key])) this.window.setBounds(target);
  }

  reveal({ focus = true } = {}) {
    if (focus && this.window.isMinimized()) this.window.restore();
    if (focus) this.window.show();
    else this.window.showInactive();
    if (this.restoreMaximized && !this.window.isMinimized()) {
      this.restoreMaximized = false;
      this.window.maximize();
    }
  }

  async restore() {
    const read = key => this.storage.call("getSetting", { key }).catch(() => null);
    const saved = await read(WORKSPACE_KEY);
    const legacy = validBounds(saved?.bounds) ? null : (await read("quick-panel-bounds-v2")) ?? await read("window-bounds");
    const bounds = validBounds(saved?.bounds) ? saved.bounds : validBounds(legacy) ? legacy : {
      width: WORKBENCH_WINDOW.width, height: WORKBENCH_WINDOW.height,
      ...(validPosition(legacy) ? { x: legacy.x, y: legacy.y } : {}),
    };
    const area = validPosition(bounds) ? this.screen.getDisplayMatching(bounds).workArea
      : this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint()).workArea;
    this.fit(bounds, area);
    this.restoreMaximized = (saved?.maximized ?? legacy?.maximized) === true;
    const schedule = () => {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.saveCurrentBounds(), 250);
    };
    for (const event of ["move", "resize", "maximize", "unmaximize", "hide"]) this.window.on(event, schedule);
    const displayEvents = ["display-added", "display-removed", "display-metrics-changed"];
    const reflow = () => {
      if (this.window.isMinimized() || this.window.isMaximized()) return;
      const bounds = this.window.getBounds();
      this.fit(bounds, this.screen.getDisplayMatching(bounds).workArea);
      schedule();
    };
    for (const event of displayEvents) this.screen.on(event, reflow);
    this.window.on("closed", () => {
      clearTimeout(this.timer);
      for (const event of displayEvents) this.screen.removeListener(event, reflow);
    });
  }

  saveCurrentBounds() {
    clearTimeout(this.timer);
    if (this.window.isMinimized()) return this.pending;
    const maximized = this.window.isMaximized() || this.restoreMaximized;
    const bounds = this.window.isMaximized() ? this.window.getNormalBounds() : this.window.getBounds();
    if (!validBounds(bounds)) return this.pending;
    const snapshot = JSON.stringify({ bounds, maximized });
    this.pending = Promise.resolve(this.pending).then(async () => {
      if (snapshot === this.lastSaved) return;
      await this.storage.call("setSetting", { key: WORKSPACE_KEY, value: JSON.parse(snapshot) });
      this.lastSaved = snapshot;
    }).catch(() => {});
    return this.pending;
  }
}

module.exports = { WindowManager, WORKBENCH_WINDOW };
