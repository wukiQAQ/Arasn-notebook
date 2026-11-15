const SIDES = ["top", "bottom", "left", "right"];
const CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
const REGIONS = [...SIDES, ...CORNERS];
const inside = (point, box) => point.x >= box.left && point.x < box.right &&
  point.y >= box.top && point.y < box.bottom;

function sharedSide(side, point, display, displays) {
  const bounds = display.bounds;
  return displays.some(other => {
    if (other === display) return false;
    const neighbor = other.bounds;
    switch (side) {
      case "left": return neighbor.right === bounds.left && point.y >= neighbor.top && point.y < neighbor.bottom;
      case "right": return neighbor.left === bounds.right && point.y >= neighbor.top && point.y < neighbor.bottom;
      case "top": return neighbor.bottom === bounds.top && point.x >= neighbor.left && point.x < neighbor.right;
      case "bottom": return neighbor.top === bounds.bottom && point.x >= neighbor.left && point.x < neighbor.right;
    }
  });
}

function findEdge(point, displays, bindings, scale) {
  const display = displays.find(monitor => inside(point, monitor.bounds));
  if (!display || !inside(point, display.work)) return [];
  const { left, top, right, bottom } = display.work;
  const distances = { left: point.x - left, right: right - 1 - point.x,
    top: point.y - top, bottom: bottom - 1 - point.y };
  const blocked = new Set(SIDES.filter(side => sharedSide(side, point, display, displays)));
  return bindings.flatMap(binding => {
    const sides = binding.input.region.split("-");
    const effectiveScale = scale ?? display.scale ?? 1;
    const width = Math.ceil(binding.input.width * effectiveScale);
    if (!sides.every(side => !blocked.has(side) && distances[side] < width)) return [];
    return [{ binding, display, key: `${binding.id}@${display.bounds.left},${display.bounds.top}`,
      distance: Math.max(...sides.map(side => distances[side])), point, scale: effectiveScale }];
  }).sort((a, b) => b.binding.input.region.split("-").length - a.binding.input.region.split("-").length ||
    a.distance - b.distance);
}

class EdgeTrigger {
  constructor(sample, allowed, feedback, activate) {
    this.sample = sample;
    this.allowed = allowed;
    this.feedback = feedback;
    this.activate = activate;
    this.bindings = [];
    this.last = new Map();
  }
  watch(bindings) {
    this.reset();
    this.bindings = bindings;
    this.last.clear();
  }
  get active() { return this.bindings.length > 0; }
  cancel() {
    if (!this.pending) return;
    clearTimeout(this.pending.timer);
    this.pending = undefined;
    this.feedback(null);
  }
  reset() {
    this.cancel();
    this.latched = undefined;
  }
  move() {
    if (!this.active) return;
    const candidates = this.sample(this.bindings);
    if (this.latched && candidates.some(hit => hit.key === this.latched)) return;
    this.latched = undefined;
    const hit = candidates.find(this.allowed);
    if (this.pending && hit?.key === this.pending.hit.key) return;
    this.cancel();
    if (!hit) return;
    const { dwellMs, cooldownMs } = hit.binding.input;
    const last = this.last.get(hit.binding.id) ?? -Infinity;
    const duration = Math.max(dwellMs, last + cooldownMs - performance.now());
    this.pending = { hit, timer: setTimeout(() => {
      this.cancel();
      const candidate = this.sample(this.bindings).find(this.allowed);
      if (!candidate || candidate.key !== hit.key) return;
      this.latched = hit.key;
      this.last.set(hit.binding.id, performance.now());
      this.activate(hit.binding, hit.binding.input.region);
    }, duration) };
    this.feedback({ ...hit, duration });
  }
}

function windowsEdges(screen, activate, suspended, feedback = () => {}) {
  const koffi = require("koffi");
  const user32 = koffi.load("user32.dll");
  const shell = koffi.load("shell32.dll");
  const callback = koffi.proto("int __stdcall ArasnMonitor(intptr_t monitor, intptr_t dc, void *rect, intptr_t data)");
  const enumerate = user32.func("__stdcall", "EnumDisplayMonitors", "int", ["intptr_t", "void *", koffi.pointer(callback), "intptr_t"]);
  const monitorInfo = user32.func("int __stdcall GetMonitorInfoW(intptr_t monitor, void *info)");
  const cursor = user32.func("int __stdcall GetCursorPos(void *point)");
  const keyState = user32.func("short __stdcall GetAsyncKeyState(int key)");
  const foreground = user32.func("intptr_t __stdcall GetForegroundWindow()");
  const shellWindow = user32.func("intptr_t __stdcall GetShellWindow()");
  const className = user32.func("int __stdcall GetClassNameW(intptr_t window, void *name, int count)");
  const rect = user32.func("int __stdcall GetWindowRect(intptr_t window, void *rect)");
  const notification = shell.func("int __stdcall SHQueryUserNotificationState(void *state)");
  const monitor = Buffer.alloc(40), point = Buffer.alloc(8), state = Buffer.alloc(4);
  const name = Buffer.alloc(256), frame = Buffer.alloc(16);
  const modifiers = { Control: 0x11, Alt: 0x12, Shift: 0x10 };
  const down = key => !!(keyState(key) & 0x8000);
  const readRect = (buffer, offset = 0) => ({
    left: buffer.readInt32LE(offset), top: buffer.readInt32LE(offset + 4),
    right: buffer.readInt32LE(offset + 8), bottom: buffer.readInt32LE(offset + 12),
  });
  let displays = [];
  function updateDisplays() {
    const next = [];
    enumerate(0, null, hwnd => {
      monitor.writeUInt32LE(monitor.length);
      if (monitorInfo(hwnd, monitor)) next.push({ bounds: readRect(monitor, 4), work: readRect(monitor, 20) });
      return 1;
    }, 0);
    displays = next.map(display => {
      const { left, right, top, bottom } = display.bounds;
      const center = { x: Math.round((left + right) / 2), y: Math.round((top + bottom) / 2) };
      return { ...display, scale: screen.getDisplayNearestPoint(screen.screenToDipPoint(center)).scaleFactor };
    });
    detector.reset();
  }
  const detector = new EdgeTrigger(bindings => {
    if (suspended() || !cursor(point)) return [];
    const physical = { x: point.readInt32LE(0), y: point.readInt32LE(4) };
    return findEdge(physical, displays, bindings);
  }, ({ binding }) => {
    if ([1, 2, 4, 5, 6].some(down)) return false;
    const input = binding.input;
    if (input.modifier && !down(modifiers[input.modifier])) return false;
    if (!input.desktopOnly && !input.pauseFullscreen) return true;
    const active = foreground();
    if (!active) return false;
    const length = className(active, name, name.length / 2);
    const desktop = active === shellWindow() || ["Progman", "WorkerW"].includes(name.toString("utf16le", 0, length * 2));
    if (input.desktopOnly && !desktop) return false;
    if (!input.pauseFullscreen || desktop) return true;
    if (notification(state) === 0 && [3, 4].includes(state.readInt32LE())) return false;
    if (!rect(active, frame)) return false;
    const outer = readRect(frame);
    return !displays.some(({ bounds }) => outer.left <= bounds.left && outer.top <= bounds.top &&
      outer.right >= bounds.right && outer.bottom >= bounds.bottom);
  }, feedback, activate);
  let watching = false;
  const events = ["display-added", "display-removed", "display-metrics-changed"];
  return {
    get active() { return detector.active; },
    prepare() {
      if (!watching) updateDisplays();
      if (!displays.length) throw new Error("无法读取屏幕热区所需的显示器信息");
    },
    watch(bindings) {
      if (bindings.length && !watching) {
        for (const event of events) screen.on(event, updateDisplays);
        watching = true;
      } else if (!bindings.length && watching) {
        for (const event of events) screen.removeListener(event, updateDisplays);
        displays = [];
        watching = false;
        feedback(null, true);
      }
      detector.watch(bindings);
    },
    move: () => detector.move(),
    cancel: () => detector.cancel(),
    reset: () => detector.reset(),
  };
}

module.exports = { REGIONS, findEdge, EdgeTrigger, windowsEdges };
