const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { WindowManager } = require("../desktop/engines/window-manager.cjs");

test("window levels are isolated by mode and passive reveals do not focus", () => {
  const calls = [];
  const window = {
    setAlwaysOnTop: value => calls.push(["top", value]),
    isMinimized: () => false,
    isVisible: () => true,
    show: () => calls.push(["show"]),
    showInactive: () => calls.push(["inactive"]),
    getBounds: () => ({ x: 0, y: 0, width: 620, height: 700 }),
    isMaximized: () => false,
  };
  const screen = { getDisplayMatching: () => ({ id: 1, workArea: {} }) };
  const manager = new WindowManager(window, {}, screen);
  manager.saveQuickBounds = () => {};
  manager.fit = bounds => bounds;
  manager.quickBounds = window.getBounds();
  assert.deepEqual(calls.pop(), ["top", true]);
  manager.setLayout(true);
  assert.deepEqual(calls.pop(), ["top", false]);
  manager.setQuickAlwaysOnTop(true);
  assert.deepEqual(calls.pop(), ["top", false]);
  manager.reveal();
  assert.deepEqual(calls.splice(0), [["top", false], ["show"]]);
  manager.setLayout(false);
  assert.deepEqual(calls.pop(), ["top", true]);
  manager.setQuickAlwaysOnTop(false);
  assert.deepEqual(calls.pop(), ["top", false]);
  manager.setLayout(true);
  manager.setLayout(false);
  assert.deepEqual(calls.splice(0), [["top", false], ["top", false]]);
  manager.reveal({ focus: false });
  assert.deepEqual(calls.splice(0), [["top", false], ["inactive"]]);
  window.isMinimized = () => true;
  window.restore = () => calls.push(["restore"]);
  manager.reflow = () => {};
  manager.reveal({ focus: false });
  assert.deepEqual(calls.splice(0), [["top", false], ["inactive"]]);
});

test("window bounds stay in DIP on a negative-coordinate display and fit after unplug", async () => {
  const primary = { id: 1, scaleFactor: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const secondary = { id: 2, scaleFactor: 1.5, workArea: { x: -960, y: 40, width: 960, height: 600 } };
  let plugged = true;
  const screen = Object.assign(new EventEmitter(), {
    getCursorScreenPoint: () => ({ x: -500, y: 320 }),
    getDisplayNearestPoint: point => plugged && point.x < 0 ? secondary : primary,
    getDisplayMatching: rect => plugged && rect.x < 0 ? secondary : primary,
  });
  const window = Object.assign(new EventEmitter(), {
    bounds: { x: 100, y: 100, width: 620, height: 700 },
    minimized: false,
    visible: false,
    getBounds() { return { ...this.bounds }; },
    setBounds(bounds) { this.bounds = bounds; },
    setMinimumSize() {},
    isMaximized: () => false,
    isMinimized() { return this.minimized; },
    restore() { this.minimized = false; },
    isVisible() { return this.visible; },
    show() { this.visible = true; this.emit("show"); },
  });
  const saved = new Map();
  const storage = {
    async call(action, { key, value }) {
      if (action === "getSetting") return saved.get(key);
      saved.set(key, value);
    },
  };
  const manager = new WindowManager(window, storage, screen);
  await manager.restore();
  manager.reveal();
  assert.deepEqual(window.bounds, { x: -790, y: 40, width: 620, height: 600 });
  const moved = { ...window.bounds, x: -940 };
  window.setBounds(moved);
  await manager.saveQuickBounds();
  manager.setLayout(true);
  assert.deepEqual(window.bounds, secondary.workArea);
  manager.setLayout(false);
  assert.deepEqual(window.bounds, moved);
  window.minimized = true;
  plugged = false;
  screen.emit("display-removed");
  manager.reveal();
  assert.equal(window.minimized, false);
  assert.deepEqual(window.bounds, { ...moved, x: 0 });
  window.emit("closed");
  assert.equal(screen.listenerCount("display-removed"), 0);
});
