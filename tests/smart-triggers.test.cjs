const { test } = require("node:test");
const assert = require("node:assert/strict");
const { GesturePath } = require("../desktop/engines/gesture-path.mjs");
const { TriggerRegistry, defaultConfig } = require("../desktop/engines/trigger-registry.cjs");
const { findEdge, EdgeTrigger } = require("../desktop/engines/edge-trigger.cjs");

test("gesture recognition handles cardinal, diagonal, corner, distance and timeout", () => {
  function recognize(points, config = {}) {
    const path = new GesturePath({ x: 0, y: 0 }, { minDistance: 40, tolerance: 18, timeoutMs: 500, ...config }, 0);
    for (const [x, y, t] of points.slice(0, -1)) path.move({ x, y }, t);
    const [x, y, t] = points.at(-1);
    return path.finish({ x, y }, t);
  }
  assert.deepEqual(recognize([[55, 0, 25], [55, 55, 60]]), ["E", "S"]);
  assert.deepEqual(recognize([[24, 0, 10], [48, 0, 20], [73, 17, 30], [73, 60, 50]]), ["E", "S"]);
  assert.deepEqual(recognize([[-40, -40, 100]]), ["NW"]);
  assert.deepEqual(recognize([[10, 10, 100]]), []);
  assert.deepEqual(recognize([[55, 0, 900]]), []);
  assert.deepEqual(recognize([[55, 22, 100]], { tolerance: 10 }), []);
});

test("paused registration, non-dispatching test and conflicts share one registry", () => {
  const keys = new Map(), actions = [], detections = [];
  const registry = new TriggerRegistry({
    register(key, fire) { keys.set(key, fire); return true; },
    unregister(key) { keys.delete(key); },
  }, action => actions.push(action), () => {}, row => detections.push(row.id));
  registry.load(defaultConfig());
  registry.testing = true;
  keys.get("Control+Alt+N")();
  assert.deepEqual(actions, []);
  assert.deepEqual(detections, ["default-toggle"]);
  registry.stage({ ...defaultConfig(), paused: true }).commit();
  assert.equal(keys.size, 0);
  registry.stage(defaultConfig()).commit();
  assert.equal(keys.size, 1);
  const input = { device: "gesture", button: "Right", modifiers: [], path: ["N"], minDistance: 48,
    timeoutMs: 900, tolerance: 20, global: true };
  assert.throws(() => registry.stage({ version: 1, bindings: [{ id: "drag", action: "toggle", enabled: true, input }] }), /确认启用无修饰键/);
});

test("physical seams, taskbar, mixed scale and corner priority", () => {
  const primary = { bounds: { left: 0, top: 0, right: 1920, bottom: 1080 },
    work: { left: 0, top: 0, right: 1920, bottom: 1040 }, scale: 1 };
  const left = { bounds: { left: -1200, top: 300, right: 0, bottom: 1300 },
    work: { left: -1200, top: 300, right: 0, bottom: 1300 }, scale: 1.5 };
  const bindings = ["left", "top", "top-left", "bottom"].map(region => ({ id: region, input: { region, width: 8 } }));
  const hits = (x, y) => findEdge({ x, y }, [left, primary], bindings).map(hit => hit.binding.id);
  assert.deepEqual(hits(1, 500), []);
  assert.deepEqual(hits(1, 1), ["top-left", "left", "top"]);
  assert.deepEqual(hits(960, 1060), []);
  assert.deepEqual(hits(960, 1038), ["bottom"]);
  assert.deepEqual(hits(-1190, 600), ["left"]);
  assert.deepEqual(hits(-1187, 600), []);
});

test("dwell cancels on leave, latches on arrival and rechecks foreground at the deadline", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const binding = { id: "one", input: { dwellMs: 350, cooldownMs: 1000, region: "top" } };
  const hit = { binding, key: "one" };
  let near = false, allowed = true, fired = 0;
  const edge = new EdgeTrigger(() => near ? [hit] : [], () => allowed, () => {}, () => { fired++; });
  edge.watch([binding]);
  near = true;
  edge.move();
  t.mock.timers.tick(200);
  near = false;
  edge.move();
  t.mock.timers.tick(300);
  assert.equal(fired, 0);
  near = true;
  edge.move();
  allowed = false;
  t.mock.timers.tick(350);
  assert.equal(fired, 0);
  allowed = true;
  edge.move();
  t.mock.timers.tick(350);
  edge.move();
  t.mock.timers.tick(2000);
  assert.equal(fired, 1);
  edge.watch([]);
});
