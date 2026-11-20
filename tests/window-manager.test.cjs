const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { WindowManager } = require("../desktop/engines/window-manager.cjs");

const key = "workspace-window-state-v1";
function fixture(settings = {}) {
  const primary = { workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const secondary = { workArea: { x: -960, y: 40, width: 960, height: 600 } };
  const screen = Object.assign(new EventEmitter(), {
    connected: true,
    getCursorScreenPoint: () => ({ x: -500, y: 320 }),
    getDisplayNearestPoint: () => secondary,
    getDisplayMatching: ({ x }) => screen.connected && x < 0 ? secondary : primary,
  });
  const calls = [];
  const window = Object.assign(new EventEmitter(), {
    bounds: { x: 0, y: 0, width: 1160, height: 820 },
    minimized: false,
    maximized: false,
    getBounds() { return { ...this.bounds }; },
    getNormalBounds() { return { ...this.bounds }; },
    setBounds(bounds) { this.bounds = bounds; },
    setMinimumSize(width, height) { this.minimum = [width, height]; },
    isMinimized() { return this.minimized; },
    isMaximized() { return this.maximized; },
    show() { calls.push("show"); },
    showInactive() { calls.push("inactive"); },
    restore() { calls.push("restore"); this.minimized = false; },
    maximize() { calls.push("maximize"); this.maximized = true; },
  });
  const writes = [];
  const storage = {
    async call(action, { key, value }) {
      if (action === "getSetting") return settings[key];
      writes.push(key);
      settings[key] = value;
    },
  };
  return { manager: new WindowManager(window, storage, screen), window, screen, settings, calls, writes };
}

test("the workstation prefers saved bounds and restores minimized and maximized state", async () => {
  const bounds = { x: -900, y: 60, width: 600, height: 480 };
  const { manager, window, calls, settings } = fixture({
    [key]: { bounds, maximized: true },
    "quick-panel-bounds-v2": { x: 20, y: 20, width: 530, height: 430 },
  });
  await manager.restore();
  assert.deepEqual(window.bounds, bounds);
  assert.deepEqual(window.minimum, [520, 420]);
  window.minimized = true;
  manager.reveal({ focus: false });
  assert.deepEqual(calls.splice(0), ["inactive"]);
  manager.reveal();
  assert.deepEqual(calls, ["restore", "show", "maximize"]);
  assert.deepEqual(window.bounds, bounds);
  await manager.saveCurrentBounds();
  assert.deepEqual(settings[key], { bounds, maximized: true });
  window.emit("closed");
});

test("legacy bounds migrate by reading, and unplugged displays refit the workstation", async () => {
  const legacy = { x: -930, y: 80, width: 640, height: 520 };
  const { manager, window, screen, settings, writes } = fixture({ "quick-panel-bounds-v2": legacy });
  await manager.restore();
  assert.deepEqual(window.bounds, legacy);
  assert.deepEqual(writes, []);
  screen.connected = false;
  screen.emit("display-removed");
  await manager.saveCurrentBounds();
  await manager.saveCurrentBounds();
  assert.deepEqual(writes, [key]);
  assert.deepEqual(settings[key], { bounds: { ...legacy, x: 0 }, maximized: false });
  assert.deepEqual(settings["quick-panel-bounds-v2"], legacy);
  window.emit("closed");
  assert.equal(screen.listenerCount("display-removed"), 0);
});
