const WM_INPUT = 0xff;
const RID_INPUT = 0x10000003;
const RIDEV_INPUTSINK = 0x100;
const RIDEV_REMOVE = 1;
const ERROR = 0xffffffff;
const { gestureCandidates, finishGesture } = require("./gesture-path.mjs");
const BUTTONS = [
  { button: "Right", down: 0x04, up: 0x08 },
  { button: "Middle", down: 0x10, up: 0x20 },
  { button: "Mouse4", down: 0x40, up: 0x80 },
  { button: "Mouse5", down: 0x100, up: 0x200 },
];
const MODIFIERS = [["Control", 0x11], ["Alt", 0x12], ["Shift", 0x10], ["Super", 0x5b, 0x5c]];

class MouseGestures {
  constructor(activate) {
    this.activate = activate;
    this.buttons = new Map();
    this.held = new Map();
    this.lastClick = new Map();
  }
  watch(bindings) {
    this.buttons.clear();
    this.reset();
    for (const binding of bindings) {
      const { button, modifiers } = binding.input;
      if (!this.buttons.has(button)) this.buttons.set(button, new Map());
      this.buttons.get(button).set(modifiers.join("+"), binding);
    }
  }
  reset() {
    this.held.clear();
    this.lastClick.clear();
  }
  cancel(button) {
    this.held.delete(button);
    this.lastClick.delete(button);
  }
  down(button, modifiers) {
    if (this.held.has(button)) return;
    const binding = this.buttons.get(button)?.get(modifiers.join("+"));
    if (this.lastClick.get(button)?.binding !== binding) this.lastClick.delete(button);
    if (binding) this.held.set(button, binding);
  }
  up(button, doubleClick) {
    const binding = this.held.get(button);
    this.held.delete(button);
    if (!binding) return;
    const double = binding.input.gesture === "double";
    if (!double && binding.action !== "toggle") {
      this.activate(binding);
      return;
    }
    const point = doubleClick();
    const last = this.lastClick.get(button);
    const near = last?.binding === binding && point.time - last.time <= point.interval &&
        Math.abs(point.x - last.x) <= point.width / 2 && Math.abs(point.y - last.y) <= point.height / 2;
    if (near) {
      if (!double) return;
      this.lastClick.delete(button);
      this.activate(binding);
    } else {
      this.lastClick.set(button, { binding, ...point });
      if (!double) this.activate(binding);
    }
  }
}

function windowsMouse(window, activate, suspended, locate, edges) {
  const user32 = require("koffi").load("user32.dll");
  const register = user32.func("int __stdcall RegisterRawInputDevices(void *devices, uint count, uint size)");
  const registrations = user32.func("uint __stdcall GetRegisteredRawInputDevices(void *devices, void *count, uint size)");
  const read = user32.func("uint __stdcall GetRawInputData(uintptr_t input, uint command, void *data, void *size, uint header)");
  const keyState = user32.func("short __stdcall GetAsyncKeyState(int key)");
  const cursor = user32.func("int __stdcall GetCursorPos(void *point)");
  const doubleTime = user32.func("uint __stdcall GetDoubleClickTime()");
  const metrics = user32.func("int __stdcall GetSystemMetrics(int index)");
  const handle = window.getNativeWindowHandle();
  const x64 = handle.length === 8;
  const pointer = (buffer, offset = 0) => x64 ? buffer.readBigUInt64LE(offset) : buffer.readUInt32LE(offset);
  const hwnd = pointer(handle);
  const device = Buffer.alloc(8 + handle.length);
  const count = Buffer.alloc(4);
  const point = Buffer.alloc(8);
  const headerSize = x64 ? 24 : 16;
  const raw = Buffer.alloc(headerSize + 24);
  const size = Buffer.alloc(4);
  let pointerBindings = [];
  const holds = new Map();
  let pendingMove;
  const currentModifiers = () => MODIFIERS.filter(([, ...keys]) =>
    keys.some(key => keyState(key) & 0x8000)).map(([name]) => name);
  const gestures = new MouseGestures(binding => setImmediate(() => {
    if (listening && !suspended() && gestures.buttons.get(binding.input.button)
      ?.get(binding.input.modifiers.join("+")) === binding) activate(binding);
  }));
  let listening = false;
  let ownsRegistration = false;
  device.writeUInt16LE(1, 0); // Generic Desktop
  device.writeUInt16LE(2, 2); // Mouse

  function registeredMouse() {
    count.writeUInt32LE(0);
    if (registrations(null, count, device.length) === ERROR) throw new Error("无法查询 Windows 鼠标监听");
    const total = count.readUInt32LE();
    if (!total) return;
    const devices = Buffer.alloc(total * device.length);
    const received = registrations(devices, count, device.length);
    if (received === ERROR) throw new Error("无法查询 Windows 鼠标监听");
    for (let index = 0; index < received; index++) {
      const offset = index * device.length;
      if (devices.readUInt16LE(offset) === 1 && devices.readUInt16LE(offset + 2) === 2)
        return { flags: devices.readUInt32LE(offset + 4), target: pointer(devices, offset + 8) };
    }
  }

  function doubleClick() {
    cursor(point);
    return { time: performance.now(), x: point.readInt32LE(0), y: point.readInt32LE(4),
      interval: doubleTime(), width: metrics(36), height: metrics(37) };
  }
  function clearHold(button) {
    const hold = holds.get(button);
    clearTimeout(hold?.expire);
    holds.delete(button);
    return hold;
  }
  function reset() {
    clearTimeout(pendingMove);
    pendingMove = undefined;
    for (const button of holds.keys()) clearHold(button);
    gestures.reset();
    edges?.reset();
  }
  function sampleMove() {
    pendingMove = undefined;
    if (suspended()) return;
    edges?.move();
    if (!holds.size) return;
    const point = locate(), now = performance.now();
    for (const hold of holds.values()) {
      if (Math.hypot(point.x - hold.origin.x, point.y - hold.origin.y) >= 8) hold.dragged = true;
      for (const candidate of hold.candidates) candidate.path.move(point, now);
    }
  }
  function onInput(_wParam, lParam) {
    if (!listening || suspended()) return;
    size.writeUInt32LE(raw.length);
    if (read(pointer(lParam), RID_INPUT, raw, size, headerSize) !== raw.length || raw.readUInt32LE(0) !== 0) return;
    const flags = raw.readUInt16LE(headerSize + 4);
    if (edges?.active && (flags & 0x155)) edges.cancel();
    if ((holds.size || edges?.active) && !pendingMove &&
        ((flags & 0x3ff) || raw.readInt32LE(headerSize + 12) || raw.readInt32LE(headerSize + 16)))
      pendingMove = setTimeout(sampleMove, 16);
    if (!(flags & 0x3fc)) return;
    for (const { button, down, up } of BUTTONS) {
      if ((flags & down) && !holds.has(button)) {
        const click = gestures.buttons.has(button);
        const bindings = window.isFocused() ? [] : pointerBindings.filter(binding => binding.input.button === button);
        if (click || bindings.length) {
          const mods = currentModifiers(), origin = locate();
          const candidates = gestureCandidates(bindings, button, mods, origin, performance.now());
          gestures.down(button, mods);
          const hold = { origin, candidates, dragged: false };
          if (candidates.length) hold.expire = setTimeout(() => { hold.candidates = []; },
            Math.max(...candidates.map(({ binding }) => binding.input.timeoutMs)) + 1);
          holds.set(button, hold);
        }
      }
      if (flags & up) {
        const hold = clearHold(button);
        if (!hold) continue;
        const point = locate();
        const match = !window.isFocused() && finishGesture(hold.candidates, point, performance.now());
        if (match || hold.dragged || Math.hypot(point.x - hold.origin.x, point.y - hold.origin.y) >= 8)
          gestures.cancel(button);
        else gestures.up(button, doubleClick);
        if (match) setImmediate(() => {
          if (listening && !suspended() && pointerBindings.includes(match)) activate(match);
        });
      }
    }
  }
  return {
    supportsEdges: Boolean(edges),
    prepare(bindings) {
      if (!bindings.some(binding => binding.input.device === "edge")) return;
      if (!edges) throw new Error("当前环境无法启用屏幕热区");
      edges.prepare();
    },
    start() {
      if (listening) return;
      const owner = registeredMouse();
      if (owner && !(ownsRegistration && owner.target === hwnd && owner.flags === RIDEV_INPUTSINK))
        throw new Error("当前进程已有鼠标 Raw Input 使用者，无法安全启用全局鼠标触发");
      device.writeUInt32LE(RIDEV_INPUTSINK, 4);
      handle.copy(device, 8);
      window.hookWindowMessage(WM_INPUT, onInput);
      if (!owner && !register(device, 1, device.length)) {
        window.unhookWindowMessage(WM_INPUT);
        throw new Error("Windows 无法注册全局鼠标监听");
      }
      listening = true;
      ownsRegistration = true;
    },
    watch(bindings) {
      reset();
      pointerBindings = bindings.filter(binding => binding.input.device === "gesture");
      gestures.watch(bindings.filter(binding => binding.input.device === "mouse"));
      edges?.watch(bindings.filter(binding => binding.input.device === "edge"));
    },
    reset,
    stop() {
      if (!ownsRegistration) return;
      reset();
      pointerBindings = [];
      gestures.watch([]);
      edges?.watch([]);
      if (listening && !window.isDestroyed()) window.unhookWindowMessage(WM_INPUT);
      listening = false;
      try {
        const owner = registeredMouse();
        if (owner?.target === hwnd && owner.flags === RIDEV_INPUTSINK) {
          device.writeUInt32LE(RIDEV_REMOVE, 4);
          device.fill(0, 8);
          if (!register(device, 1, device.length)) throw new Error("Windows 无法释放鼠标监听");
        }
        ownsRegistration = false;
      } catch (error) {
        // No bindings or callbacks remain. Retry releasing the registration on shutdown.
        console.warn(error.message);
      }
    },
  };
}

module.exports = { MouseGestures, windowsMouse };
