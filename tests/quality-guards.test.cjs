const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function nativeFixture(onWait = () => {}) {
  const state = { foreground: 10, held: false, events: [] };
  const api = {
    SetCursorPos: () => 1, GetCursorPos: () => 1, ClientToScreen: () => 1,
    GetClientRect: (_h, b) => { b.writeInt32LE(1440, 8); b.writeInt32LE(900, 12); return 1; },
    mouse_event: flags => { state.events.push({ flags, foreground: state.foreground }); state.held = flags === 2; },
    GetAsyncKeyState: () => state.held ? 0x8000 : 0,
    GetForegroundWindow: () => state.foreground, GetAncestor: h => h,
    SetForegroundWindow: h => { state.foreground = h; return 1; }, keybd_event: () => {},
  };
  const lib = { func: signature => api[Object.keys(api).find(n => signature.includes(n + '('))] };
  const w = { id: 1, show() {}, focus() {}, getNativeWindowHandle() { const b = Buffer.alloc(8); b.writeBigUInt64LE(10n); return b; } };
  const file = path.resolve(__dirname, 'helpers/native-pointer.cjs');
  const context = vm.createContext({
    require, Buffer, module: { exports: {} }, __filename: file,
    process: { getBuiltinModule: () => ({ createRequire: () => () => ({ load: () => lib }) }) },
    setTimeout: (fn, ms) => { onWait(state, ms); queueMicrotask(fn); },
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  const app = { browserWindow: async () => ({ evaluate: async fn => fn(w) }), evaluate: async (fn, args) => fn({ BrowserWindow: { fromId: () => w } }, args) };
  const pointer = await context.module.exports.nativePointer(app, { evaluate: async () => ({ width: 1440, height: 900 }) });
  return { state, drag: () => pointer.drag(200, 200, 50, 25) };
}

test('native drag injects and releases only its own press in a stable foreground', async () => {
  const f = await nativeFixture(); await f.drag();
  assert.deepEqual(f.state.events, [{ flags: 2, foreground: 10 }, { flags: 4, foreground: 10 }]);
});

test('native drag refuses a press if foreground changes during its initial wait', async () => {
  const f = await nativeFixture((s, ms) => { if (ms === 20) s.foreground = 99; });
  await assert.rejects(f.drag(), /focus changed/);
  assert.deepEqual(f.state.events, []);
});

test('native drag does not press or release a button held during its initial wait', async () => {
  const f = await nativeFixture((s, ms) => { if (ms === 20) s.held = true; });
  await assert.rejects(f.drag(), /left mouse already held/);
  assert.deepEqual(f.state.events, []); assert.equal(f.state.held, true);
});

test('native drag still releases its own button if foreground is lost mid-drag', async () => {
  const f = await nativeFixture((s, ms) => { if (ms === 8) s.foreground = 99; });
  await assert.rejects(f.drag(), /focus changed/);
  assert.deepEqual(f.state.events.map(e => e.flags), [2, 4]);
  assert.equal(f.state.held, false);
});

function panFixture(zoom = 1) {
  return {
    before: { x: 800, y: 500, zoom }, after: { x: 800 + 420 / zoom, y: 500 - 120 / zoom, zoom },
    request: { x: 1000, y: 300, dx: -420, dy: 120 },
    events: [
      { type: 'pointerdown', id: 1, x: 1000, y: 300, buttons: 1 },
      { type: 'gotpointercapture', id: 1 },
      { type: 'pointerup', id: 1, x: 580, y: 420, buttons: 0 },
      { type: 'lostpointercapture', id: 1 },
    ],
  };
}

test('pan sample requires a complete gesture and matching camera at each zoom', () => {
  const { assertPanGesture } = require('./helpers/pan-gesture.cjs');
  for (const zoom of [.25, 1, 4]) assertPanGesture(panFixture(zoom));
  const still = panFixture(); still.after = { ...still.before };
  assert.throws(() => assertPanGesture(still), /camera/);
  const partial = panFixture(); partial.after.x -= 50;
  assert.throws(() => assertPanGesture(partial), /camera/);
  const wrongY = panFixture(); wrongY.after.y = wrongY.before.y;
  assert.throws(() => assertPanGesture(wrongY), /camera/);
});

test('pan sample rejects cancellation, early capture loss, blur and incomplete input', () => {
  const { assertPanGesture } = require('./helpers/pan-gesture.cjs');
  for (const type of ['pointercancel', 'lostpointercapture', 'blur']) {
    const f = panFixture(); f.events.splice(2, 0, { type, id: 1 });
    assert.throws(() => assertPanGesture(f), /interrupted/);
  }
  const absent = panFixture(); absent.events = [];
  assert.throws(() => assertPanGesture(absent), /pointerdown/);
  const noUp = panFixture(); noUp.events.splice(2);
  assert.throws(() => assertPanGesture(noUp), /pointerup/);
  const short = panFixture(); short.events[2].x += 80;
  assert.throws(() => assertPanGesture(short), /endpoint/);
  const other = panFixture(); other.events[2].id = 2;
  assert.throws(() => assertPanGesture(other), /pointer/);
});
