const ACTIONS = Object.freeze({
  toggle: "显示或隐藏主面板",
  "quick-note": "呼出快速便签",
  files: "打开文件中转站",
  workbench: "展开工作站",
  commands: "打开快捷命令面板",
});
const MODIFIERS = ["Control", "Alt", "Shift", "Super"];
const SPECIAL_KEYS = {
  Backspace: 0x08, Tab: 0x09, Enter: 0x0d, Pause: 0x13, Escape: 0x1b,
  Space: 0x20, PageUp: 0x21, PageDown: 0x22, End: 0x23, Home: 0x24,
  Left: 0x25, Up: 0x26, Right: 0x27, Down: 0x28, PrintScreen: 0x2c,
  Insert: 0x2d, Delete: 0x2e,
};
const FUNCTION_KEY = /^F(?:[1-9]|1[0-9]|2[0-4])$/;
const DEFAULT_KEY = "Control+Alt+N";
const MOUSE_BUTTONS = ["Middle", "Mouse4", "Mouse5"];
const { directions } = require("./gesture-path.mjs");
const { REGIONS } = require("./edge-trigger.cjs");
const inRange = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
const validModifiers = mods => Array.isArray(mods) && mods.every(mod => MODIFIERS.includes(mod)) &&
  new Set(mods).size === mods.length;
const modifiersInOrder = mods => MODIFIERS.filter(mod => mods.includes(mod));

function normalizeAccelerator(accelerator) {
  if (typeof accelerator !== "string" || accelerator.length > 64) throw new Error("快捷键格式无效");
  const parts = accelerator.split("+");
  const key = parts.pop();
  if (!key || !(/^[A-Z0-9]$/.test(key) || FUNCTION_KEY.test(key) || Object.hasOwn(SPECIAL_KEYS, key)))
    throw new Error("请选择字母、数字、功能键或受支持的特殊键");
  if (new Set(parts).size !== parts.length || parts.some(part => !MODIFIERS.includes(part)))
    throw new Error("修饰键无效或重复");
  if (!parts.length && !FUNCTION_KEY.test(key) && key !== "PrintScreen")
    throw new Error("字母、数字及常用特殊键须搭配修饰键，以免截走普通输入");
  return [...MODIFIERS.filter(modifier => parts.includes(modifier)), key].join("+");
}

function defaultConfig(accelerator = DEFAULT_KEY) {
  return { version: 1, bindings: [{ id: "default-toggle", action: "toggle", enabled: true,
    input: { device: "keyboard", accelerator } }] };
}

function normalizeInput(input) {
  if (input?.device === "keyboard") return { device: "keyboard", accelerator: normalizeAccelerator(input.accelerator) };
  if (input?.device === "edge") {
    const { region, width, dwellMs, cooldownMs, modifier, desktopOnly, pauseFullscreen } = input;
    if (!REGIONS.includes(region) || !inRange(width, 4, 24) || !inRange(dwellMs, 200, 3000) ||
        !inRange(cooldownMs, 400, 5000) || ![null, "Control", "Alt", "Shift"].includes(modifier) ||
        typeof desktopOnly !== "boolean" || typeof pauseFullscreen !== "boolean")
      throw new Error("屏幕热区配置无效");
    return { device: "edge", region, width, dwellMs, cooldownMs, modifier, desktopOnly, pauseFullscreen };
  }
  if (input?.device === "gesture") {
    const { button, modifiers, path, minDistance, timeoutMs, tolerance, global, allowUnmodified } = input;
    if (![...MOUSE_BUTTONS, "Right"].includes(button) || !validModifiers(modifiers) ||
        !Array.isArray(path) || !path.length || path.length > 4 ||
        path.some((direction, index) => !directions.includes(direction) || direction === path[index - 1]) ||
        !inRange(minDistance, 20, 200) || !inRange(timeoutMs, 300, 3000) ||
        !inRange(tolerance, 8, 22.5) || typeof global !== "boolean" ||
        (allowUnmodified !== undefined && typeof allowUnmodified !== "boolean"))
      throw new Error("手势设置无效，请重新录制或检查识别参数");
    const bare = global && ["Right", "Middle"].includes(button) && !modifiers.length;
    if (bare && !allowUnmodified) throw new Error("请配合修饰键，或确认启用无修饰键全局拖动");
    return { device: "gesture", button, modifiers: modifiersInOrder(modifiers),
      path: [...path], minDistance, timeoutMs, tolerance, global, ...(bare ? { allowUnmodified: true } : {}) };
  }
  if (input?.device !== "mouse" || !MOUSE_BUTTONS.includes(input.button) ||
      !validModifiers(input.modifiers) ||
      !(input.gesture === "press" || (input.button === "Middle" && input.gesture === "double")))
    throw new Error("鼠标触发器格式无效");
  return { device: "mouse", button: input.button,
    modifiers: modifiersInOrder(input.modifiers), gesture: input.gesture };
}

function chord(input) {
  if (input.device === "keyboard") return input.accelerator;
  if (input.device === "edge") return `热区 ${input.region}`;
  const buttons = [...input.modifiers, input.button].join("+");
  return input.device === "gesture" ? `${buttons} 拖动 ${input.path.join("→")} ${input.global ? "全局" : "窗口工具区"}` : buttons;
}
const usesRawInput = input => ["mouse", "edge"].includes(input.device) || (input.device === "gesture" && input.global);

function normalizeConfig(config) {
  if (config?.version !== 1 || !Array.isArray(config.bindings) || config.bindings.length > 48)
    throw new Error("触发器配置无效，最多可设置 48 项");
  if (config.paused !== undefined && typeof config.paused !== "boolean") throw new Error("暂停设置无效");
  if (config.feedback !== undefined && typeof config.feedback !== "boolean") throw new Error("反馈设置无效");
  const ids = new Set(), chords = new Set();
  const bindings = config.bindings.map(binding => {
    const { id, action, enabled, name } = binding ?? {};
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(id) || ids.has(id) ||
        !Object.hasOwn(ACTIONS, action) || typeof enabled !== "boolean" ||
        (name !== undefined && (typeof name !== "string" || name.length > 40)))
      throw new Error("触发器格式无效");
    ids.add(id);
    const input = normalizeInput(binding.input);
    const key = chord(input);
    if (enabled && chords.has(key)) throw new Error(`${key} 已绑定到本应用的触发器`);
    if (enabled) chords.add(key);
    return { id, action, enabled, input, ...(name?.trim() ? { name: name.trim() } : {}) };
  });
  return { version: 1, bindings, ...(config.paused ? { paused: true } : {}),
    ...(config.feedback === false ? { feedback: false } : {}) };
}

class TriggerRegistry {
  constructor(keyboard, dispatch, captured, detected = () => {}) {
    this.keyboard = keyboard;
    this.dispatch = dispatch;
    this.captured = captured;
    this.detected = detected;
    this.active = new Map();
    this.mouseActive = [];
    this.failures = Object.create(null);
    this.config = defaultConfig();
    this.capturing = false;
    this.testing = false;
    this.closed = false;
  }

  register(input) {
    const { accelerator } = input;
    if (!this.keyboard.register(accelerator, () => {
      const binding = this.active.get(accelerator);
      if (!binding || this.closed) return;
      if (this.capturing) this.captured(binding.input);
      else this.fire(binding);
    })) throw new Error(`快捷键已被占用或受系统限制：${accelerator}`);
  }

  fire(binding, feedback) {
    if (this.closed || this.capturing || this.config.paused) return;
    if (this.testing) this.detected(binding);
    else this.dispatch(binding.action, feedback);
  }

  localGesture(id) {
    const binding = this.config.bindings.find(row => row.id === id && row.enabled &&
      row.input.device === "gesture" && !row.input.global);
    if (binding) this.fire(binding);
  }

  setCapturing(value) {
    this.capturing = value;
    this.mouse?.reset();
  }

  startMouse() {
    if (!this.mouse) throw new Error("当前系统不支持全局鼠标触发");
    this.mouse.start();
  }

  load(config, legacy) {
    try {
      this.config = normalizeConfig(config ?? defaultConfig(legacy));
    } catch (error) {
      this.warning = `已使用默认触发器。保存的配置无法读取（${error.message}）。`;
    }
    if (this.config.paused) return;
    const mouse = [];
    for (const binding of this.config.bindings) {
      if (!binding.enabled) continue;
      if (usesRawInput(binding.input)) { mouse.push(binding); continue; }
      if (binding.input.device !== "keyboard") continue;
      try {
        this.register(binding.input);
        this.active.set(binding.input.accelerator, binding);
      } catch (error) {
        this.failures[binding.id] = error.message;
      }
    }
    if (mouse.length) {
      let available = mouse;
      try { this.mouse?.prepare?.(mouse); }
      catch (error) {
        for (const binding of mouse.filter(row => row.input.device === "edge")) this.failures[binding.id] = error.message;
        available = mouse.filter(row => row.input.device !== "edge");
      }
      if (!available.length) return;
      try {
        this.startMouse();
        this.mouse.watch(available);
        this.mouseActive = available;
      } catch (error) {
        for (const binding of available) this.failures[binding.id] = error.message;
      }
    }
  }

  // Prepare new registrations first. Existing registrations remain live through persistence.
  stage(config, { probe = false } = {}) {
    if (this.closed) throw new Error("应用正在退出");
    const next = normalizeConfig(config);
    const enabled = next.paused && !probe ? [] : next.bindings.filter(binding => binding.enabled);
    const active = new Map(enabled.filter(binding => binding.input.device === "keyboard")
      .map(binding => [binding.input.accelerator, binding]));
    const mouse = enabled.filter(binding => usesRawInput(binding.input));
    const old = new Map(this.config.bindings.map(binding => [binding.id, binding]));
    const failures = Object.create(null);
    const rememberFailure = (binding, error) => {
      if (!this.failures[binding.id] || JSON.stringify(old.get(binding.id)) !== JSON.stringify(binding)) throw error;
      failures[binding.id] = error.message;
    };
    const added = [];
    let startedMouse = false;
    let nextMouse = mouse;
    const rollback = () => {
      added.forEach(key => this.keyboard.unregister(key));
      if (startedMouse) this.mouse.stop();
    };
    try {
      for (const [key, binding] of active) {
        if (this.active.has(key)) continue;
        try {
          this.register(binding.input);
          added.push(key);
        } catch (error) {
          rememberFailure(binding, error);
          active.delete(key);
        }
      }
      try { this.mouse?.prepare?.(mouse); }
      catch (error) {
        mouse.filter(row => row.input.device === "edge").forEach(binding => rememberFailure(binding, error));
        nextMouse = mouse.filter(row => row.input.device !== "edge");
      }
      if (nextMouse.length && !this.mouseActive.length) {
        try {
          if (!this.mouse) throw new Error("当前系统不支持全局鼠标触发");
          if (!probe) {
            this.startMouse();
            startedMouse = true;
          }
        } catch (error) {
          nextMouse.forEach(binding => rememberFailure(binding, error));
          nextMouse = [];
        }
      }
    } catch (error) {
      rollback();
      throw error;
    }
    return {
      config: next,
      failures,
      rollback,
      commit: () => {
        if (this.closed) { rollback(); return; }
        for (const key of this.active.keys()) if (!active.has(key)) this.keyboard.unregister(key);
        this.active = active;
        if (nextMouse.length) this.mouse.watch(nextMouse);
        else if (this.mouseActive.length) this.mouse.stop();
        this.mouseActive = nextMouse;
        this.config = next;
        this.failures = failures;
        this.warning = undefined;
      },
    };
  }

  dispose() {
    this.closed = true;
    for (const key of this.active.keys()) this.keyboard.unregister(key);
    this.active.clear();
    this.mouse?.stop();
    this.mouseActive = [];
  }
}

module.exports = { ACTIONS, DEFAULT_KEY, SPECIAL_KEYS, defaultConfig, TriggerRegistry };
