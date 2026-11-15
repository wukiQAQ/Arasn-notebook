const QUICK_WINDOW = { width: 620, height: 700, minWidth: 500, minHeight: 540 };
const WORKBENCH_WINDOW = { width: 1160, height: 820, minWidth: 720, minHeight: 520 };
const BOUNDS_KEY = "quick-panel-bounds-v2";
const validPosition = (bounds) => bounds && Number.isInteger(bounds.x) && Number.isInteger(bounds.y);

class WindowManager {
  constructor(window, storage, screen, quickAlwaysOnTop = true) {
    this.window = window;
    this.storage = storage;
    this.screen = screen;
    this.expanded = false;
    this.quickAlwaysOnTop = quickAlwaysOnTop;
    this.applyWindowPolicy();
  }

  applyWindowPolicy() {
    this.window.setAlwaysOnTop?.(!this.expanded && this.quickAlwaysOnTop);
  }

  setQuickAlwaysOnTop(value) {
    this.quickAlwaysOnTop = value;
    this.applyWindowPolicy();
  }

  fit(bounds, options, area = this.screen.getDisplayMatching(bounds).workArea) {
    const minWidth = Math.min(options.minWidth, area.width);
    const minHeight = Math.min(options.minHeight, area.height);
    const width = Math.max(minWidth, Math.min(bounds.width, area.width));
    const height = Math.max(minHeight, Math.min(bounds.height, area.height));
    const fitted = {
      x: Math.max(area.x, Math.min(bounds.x ?? Math.round(area.x + (area.width - width) / 2), area.x + area.width - width)),
      y: Math.max(area.y, Math.min(bounds.y ?? Math.round(area.y + (area.height - height) / 2), area.y + area.height - height)),
      width,
      height,
    };
    this.window.setMinimumSize(minWidth, minHeight);
    const current = this.window.getBounds();
    if (Object.keys(fitted).some(key => fitted[key] !== current[key])) this.window.setBounds(fitted);
    return this.window.getBounds();
  }

  get layout() {
    return this.expanded ? WORKBENCH_WINDOW : QUICK_WINDOW;
  }

  reflow() {
    if (this.window.isMinimized() || this.window.isMaximized()) return;
    const bounds = this.window.getBounds();
    const position = !this.expanded && this.placeOnFirstShow
      ? this.fit({ width: bounds.width, height: bounds.height }, this.layout, this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint()).workArea)
      : this.fit(bounds, this.layout);
    if (!this.expanded) this.quickBounds = position;
  }

  reveal({ focus = true } = {}) {
    const minimized = this.window.isMinimized();
    if (minimized && focus) this.window.restore();
    if (minimized || !this.window.isVisible() || this.placeOnFirstShow) this.reflow();
    this.placeOnFirstShow = false;
    this.applyWindowPolicy();
    if (focus) this.window.show();
    else this.window.showInactive();
  }

  async restore() {
    const saved = await this.storage.call("getSetting", { key: BOUNDS_KEY });
    const legacy = saved ? null : await this.storage.call("getSetting", { key: "window-bounds" });
    const position = validPosition(saved) ? saved : validPosition(legacy) ? legacy : null;
    this.placeOnFirstShow = !position;
    const width = Number.isInteger(saved?.width) && saved.width > 0 ? saved.width : QUICK_WINDOW.width;
    const height = Number.isInteger(saved?.height) && saved.height > 0 ? saved.height : QUICK_WINDOW.height;
    this.quickBounds = position
      ? this.fit({ x: position.x, y: position.y, width, height }, QUICK_WINDOW)
      : this.fit({ width, height }, QUICK_WINDOW, this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint()).workArea);
    const schedule = () => {
      if (this.expanded || this.window.isMaximized() || this.window.isMinimized()) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.saveQuickBounds(), 250);
    };
    this.window.on("move", schedule);
    this.window.on("resize", schedule);
    this.window.on("hide", () => this.saveQuickBounds());
    this.window.on("show", () => { this.placeOnFirstShow = false; });
    const onDisplayChanged = () => {
      this.saveQuickBounds();
      this.reflow();
    };
    const displayEvents = ["display-added", "display-removed", "display-metrics-changed"];
    for (const event of displayEvents) this.screen.on(event, onDisplayChanged);
    this.window.on("closed", () => {
      clearTimeout(this.timer);
      for (const event of displayEvents) this.screen.removeListener(event, onDisplayChanged);
    });
  }

  saveQuickBounds() {
    clearTimeout(this.timer);
    if (this.expanded || this.window.isMaximized() || this.window.isMinimized()) return this.boundsSave;
    const bounds = this.window.getBounds();
    if (this.quickBounds && Object.keys(bounds).every(key => bounds[key] === this.quickBounds[key])) return this.boundsSave;
    this.quickBounds = bounds;
    this.placeOnFirstShow = false;
    this.boundsSave = this.storage.call("setSetting", { key: BOUNDS_KEY, value: this.quickBounds }).catch(() => {});
    return this.boundsSave;
  }

  setLayout(expanded) {
    if (expanded === this.expanded) {
      this.applyWindowPolicy();
      return;
    }
    this.saveQuickBounds();
    if (this.window.isMaximized()) this.window.unmaximize();
    const bounds = this.window.getBounds();
    const display = this.screen.getDisplayMatching(bounds);
    this.expanded = expanded;
    this.applyWindowPolicy();
    if (expanded) {
      this.fit({ x: bounds.x, y: bounds.y, width: this.layout.width, height: this.layout.height }, this.layout, display.workArea);
    } else {
      const quick = this.quickBounds;
      const sameDisplay = this.screen.getDisplayMatching(quick).id === display.id;
      this.quickBounds = this.fit({ x: sameDisplay ? quick.x : bounds.x, y: sameDisplay ? quick.y : bounds.y, width: quick.width, height: quick.height }, this.layout, display.workArea);
    }
  }
}

module.exports = { WindowManager, QUICK_WINDOW };
