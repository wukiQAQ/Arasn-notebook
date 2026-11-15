const HOTKEY_MESSAGE = 0x0312;
const MOD_NOREPEAT = 0x4000;
const modifiers = { Alt: 1, Control: 2, Shift: 4, Super: 8 };
const { SPECIAL_KEYS } = require("./trigger-registry.cjs");

function windowsShortcuts(window) {
  const user32 = require("koffi").load("user32.dll");
  const register = user32.func("int __stdcall RegisterHotKey(intptr_t hwnd, int id, uint flags, uint key)");
  const unregister = user32.func("int __stdcall UnregisterHotKey(intptr_t hwnd, int id)");
  const handle = window.getNativeWindowHandle();
  const hwnd = handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE();
  const bindings = new Map();
  const callbacks = new Map();
  let id = 0;
  window.hookWindowMessage(HOTKEY_MESSAGE, wParam => {
    callbacks.get(wParam.readUInt32LE())?.();
  });
  return {
    register(value, callback) {
      const parts = value.split("+");
      const key = parts.pop();
      if (key === "F12") return false; // Reserved by Windows for the debugger.
      const flags = parts.reduce((flags, part) => flags | modifiers[part], MOD_NOREPEAT);
      const vk = SPECIAL_KEYS[key] ?? (key.length === 1 ? key.charCodeAt(0) : 0x6f + Number(key.slice(1)));
      do { id = id % 0xbfff + 1; } while (callbacks.has(id));
      if (!register(hwnd, id, flags, vk)) return false;
      bindings.set(value, id);
      callbacks.set(id, callback);
      return true;
    },
    unregister(value) {
      const id = bindings.get(value);
      if (!id) return;
      unregister(hwnd, id);
      callbacks.delete(id);
      bindings.delete(value);
    },
  };
}

module.exports = { windowsShortcuts };
