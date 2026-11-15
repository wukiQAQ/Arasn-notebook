const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TriggerRegistry, defaultConfig } = require("../desktop/engines/trigger-registry.cjs");
const { MouseGestures } = require("../desktop/engines/windows-mouse.cjs");

const binding = (id, accelerator, action = "toggle", enabled = true) =>
  ({ id, action, enabled, input: { device: "keyboard", accelerator } });
const config = (...bindings) => ({ version: 1, bindings });
const mouseBinding = (id, modifiers = [], gesture = "press") =>
  ({ id, action: "toggle", enabled: true, input: { device: "mouse", button: "Middle", modifiers, gesture } });

function fixture(blocked = []) {
  const registered = new Map(), actions = [], recorded = [];
  const registry = new TriggerRegistry({
    register(key, callback) {
      if (blocked.includes(key) || registered.has(key)) return false;
      registered.set(key, callback);
      return true;
    },
    unregister(key) { registered.delete(key); },
  }, action => actions.push(action), input => recorded.push(input));
  return { registry, registered, actions, recorded };
}

test("migrates one legacy binding and commits several actions without reregistering retained keys", () => {
  const { registry, registered, actions, recorded } = fixture();
  registry.load(undefined, "Alt+Control+F14");
  assert.deepEqual(registry.config, defaultConfig("Control+Alt+F14"));
  const old = registered.get("Control+Alt+F14");
  const next = config(binding("one", "Control+Alt+F14", "files"),
    binding("two", "Control+Alt+F15", "files"), binding("three", "F18", "workbench", false));
  const staged = registry.stage(next);
  registered.get("Control+Alt+F15")();
  assert.deepEqual(actions, []);
  old();
  assert.deepEqual(actions, ["toggle"]);
  staged.commit();
  assert.equal(registered.get("Control+Alt+F14"), old);
  old();
  registered.get("Control+Alt+F15")();
  assert.deepEqual(actions, ["toggle", "files", "files"]);
  registry.capturing = true;
  old();
  assert.deepEqual(recorded, [{ device: "keyboard", accelerator: "Control+Alt+F14" }]);
  assert.equal(actions.length, 3);
  registry.dispose();
  assert.equal(registered.size, 0);
});

test("OS conflict, app collision and persistence rollback keep the old registration", () => {
  const { registry, registered, actions } = fixture(["Control+Alt+F16"]);
  registry.load(undefined, "Control+Alt+F14");
  assert.throws(() => registry.stage(config(binding("x", "Control+Alt+F15"), binding("y", "Control+Alt+F16"))), /已被占用/);
  assert.throws(() => registry.stage(config(binding("x", "Control+Alt+F15"), binding("y", "Alt+Control+F15", "files"))), /已绑定/);
  registry.stage(config(binding("x", "Control+Alt+F15"))).rollback();
  assert.deepEqual([...registered.keys()], ["Control+Alt+F14"]);
  registered.get("Control+Alt+F14")();
  assert.deepEqual(actions, ["toggle"]);
  assert.deepEqual(registry.config, defaultConfig("Control+Alt+F14"));
});

test("an unavailable binding at startup leaves other bindings active", () => {
  const { registry, registered } = fixture(["Control+Alt+F14"]);
  registry.load(config(binding("x", "Control+Alt+F14"), binding("y", "Control+Alt+F15")));
  assert.match(registry.failures.x, /已被占用/);
  assert.deepEqual([...registered.keys()], ["Control+Alt+F15"]);
});

test("mouse listening is opt-in, released on rollback and last disable, and failures isolate keyboard", () => {
  const { registry, registered } = fixture();
  let listener = false, fail = false, watched = [];
  registry.mouse = {
    start() { if (fail) throw new Error("鼠标监听失败"); listener = true; },
    watch(rows) { watched = rows; },
    stop() { listener = false; watched = []; },
  };
  const key = binding("one", "Control+Alt+F14");
  const mouse = mouseBinding("middle", ["Control"]);
  registry.load(config(key));
  registry.stage(config(key, mouse), { probe: true }).rollback();
  assert.equal(listener, false);
  registry.stage(config(key, mouse)).rollback();
  assert.equal(listener, false);
  registry.stage(config(key, mouse)).commit();
  assert.deepEqual(watched, [mouse]);
  registry.stage(config(key, { ...mouse, enabled: false })).commit();
  assert.equal(listener, false);
  fail = true;
  assert.throws(() => registry.stage(config(binding("two", "Control+Alt+F15"), mouse)), /鼠标监听失败/);
  assert.deepEqual([...registered.keys()], ["Control+Alt+F14"]);
  const restarted = fixture();
  restarted.registry.mouse = registry.mouse;
  restarted.registry.load(config(key, mouse));
  assert.match(restarted.registry.failures.middle, /鼠标监听失败/);
  restarted.registry.stage(config(binding("two", "Control+Alt+F15"), mouse)).commit();
  assert.deepEqual([...restarted.registered.keys()], ["Control+Alt+F15"]);
  assert.throws(() => registry.stage(config(mouse, mouseBinding("double", ["Control"], "double"))), /已绑定/);
});

test("mouse press matches modifiers on down, dispatches on release and de-duplicates rapid toggles", () => {
  const fired = [];
  const match = new MouseGestures(row => fired.push(row.id));
  const click = (time, x = 0) => () => ({ time, x, y: 0, interval: 500, width: 8, height: 8 });
  match.watch([mouseBinding("middle", ["Control"])]);
  match.down("Middle", []);
  match.up("Middle", click(0));
  match.down("Middle", ["Control"]);
  match.down("Middle", ["Control"]);
  assert.deepEqual(fired, []);
  match.up("Middle", click(50));
  match.up("Middle", click(60));
  match.down("Middle", ["Control"]);
  match.up("Middle", click(150));
  assert.deepEqual(fired, ["middle"]);
  match.watch([mouseBinding("double", [], "double")]);
  for (const [time, x] of [[200, 0], [250, 20], [300, 20]]) {
    match.down("Middle", []);
    match.up("Middle", click(time, x));
  }
  assert.deepEqual(fired, ["middle", "double"]);
});
