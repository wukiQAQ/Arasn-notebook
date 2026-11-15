const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { BoardClient } = require("../src/board.ts");
const { createStore } = require("../desktop/server.cjs");

const id = "a".repeat(32);
const note = (text) => ({ type: "text", text, x: 100, y: 100, color: "#263449" });
let timer;
let delay;
beforeEach(() => {
  global.location = { hash: "#test", pathname: "/" };
  global.sessionStorage = { setItem() {} };
  global.history = { replaceState() {} };
  global.localStorage = { setItem() {} };
  global.window = { setTimeout(callback, ms) { timer = callback; delay = ms; return 0; }, setInterval() { return 0; } };
  timer = undefined;
});

function connected(store) {
  const client = new BoardClient(() => {});
  client.base = store.snapshot();
  client.ready = true;
  return client;
}

test("canvas add waits for body and reference acknowledgement, deduplicates and restores without copying", async () => {
  const store = createStore(), client = connected(store), order = [];
  window.desktop = { saveRecovery: async () => {}, canvas: { migrate: async () => ({ migrated: true }) } };
  client.request = async (_url, operation) => {
    if (!operation) return store.snapshot();
    order.push(operation.value?.type);
    return store.apply(operation);
  };
  client.edit(id, note("正文仍待保存"));
  const a = client.addRecordToCanvas(id), b = client.addRecordToCanvas(id);
  assert.equal(a, b);
  const result = await a;
  assert.deepEqual(order, ["text", "canvas-node"]);
  assert.equal(store.snapshot().items[result.nodeId].value.contentRef.id, id);
  assert.equal((await client.addRecordToCanvas(id)).nodeId, result.nodeId);
  const ref = client.view()[result.nodeId].value;
  client.edit(result.nodeId, { ...ref, layout: { ...ref.layout, hidden: true } });
  await client.flush();
  await client.addRecordToCanvas(id);
  assert.equal(client.base.items[result.nodeId].value.layout.hidden, undefined);
  assert.equal(Object.values(store.snapshot().items).filter(item => item.value?.type === "text").length, 1);
  client.edit(id, null); await client.flush();
  await assert.rejects(client.addRecordToCanvas(id), /有效记录/);
  assert.equal(client.base.items[result.nodeId].value.contentRef.id, id);
});

test("failed body or reference saves never acknowledge a canvas add and retry keeps one reference", async () => {
  const store = createStore(), client = connected(store);
  let rejectBody = true, rejectReference = true, checked = false;
  window.desktop = { saveRecovery: async () => {}, canvas: { migrate: async () => { checked = true; return { migrated: true }; } } };
  client.request = async (_url, operation) => {
    if (!operation) return store.snapshot();
    if ((operation.value?.type === "text" && rejectBody) || (operation.value?.type === "canvas-node" && rejectReference)) throw new Error("disk unavailable");
    return store.apply(operation);
  };
  client.edit(id, note("保存失败时也保留正文"));
  await assert.rejects(client.addRecordToCanvas(id));
  assert.equal(checked, false);
  assert.equal(client.view()[id].value.text, "保存失败时也保留正文");
  rejectBody = false;
  await assert.rejects(client.addRecordToCanvas(id));
  assert.equal(Object.values(store.snapshot().items).filter(item => item.value?.type === "canvas-node").length, 0);
  assert.equal(client.pending.filter(op => op.value?.type === "canvas-node").length, 1);
  rejectReference = false;
  const result = await client.addRecordToCanvas(id);
  assert.equal(result.existing, true);
  assert.equal(Object.values(store.snapshot().items).filter(item => item.value?.type === "canvas-node").length, 1);
});

test("pin order changes only after the recovery writer acknowledges it", async () => {
  const store = createStore();
  const client = connected(store);
  client.base = store.apply({ id, opId: "b".repeat(32), expected: 0, value: note("本机置顶") });
  let complete;
  window.desktop = { saveRecovery: () => new Promise(resolve => { complete = resolve; }) };
  const change = client.toggleRecordPin(id);
  assert.deepEqual(client.pinnedRecords, []);
  assert.equal(await client.toggleRecordPin(id), false);
  let canExit = false;
  const closing = client.ensureRecoverable().then(result => { canExit = result; });
  await Promise.resolve();
  assert.equal(canExit, false);
  complete();
  assert.equal(await change, true);
  await closing;
  assert.equal(canExit, true);
  assert.deepEqual(client.pinnedRecords, [id]);

  window.desktop.saveRecovery = async () => { throw new Error("disk unavailable"); };
  assert.equal(await client.toggleRecordPin(id), false);
  assert.deepEqual(client.pinnedRecords, [id]);
});

test("a confirmed retry clears an earlier failure for the same deletion", async () => {
  const store = createStore();
  const client = connected(store);
  client.base = store.apply({ id, opId: "b".repeat(32), expected: 0, value: note("待删除") });
  let rejectDelete = true;
  client.request = async (_endpoint, op) => {
    if (!op) return store.snapshot();
    if (rejectDelete) throw Object.assign(new Error("conflict"), { status: 409 });
    return store.apply(op);
  };
  client.edit(id, null);
  await client.tick();
  assert.equal(client.recordDeletionState(id), "failed");
  assert.equal(client.hasFailedDeletions, true);
  rejectDelete = false;
  client.edit(id, null);
  await client.tick();
  assert.equal(client.recordDeletionState(id), "deleted");
  assert.equal(client.hasFailedDeletions, false);
});

test("a committed operation with a lost acknowledgement keeps its original payload on retry", async () => {
  const store = createStore();
  const client = connected(store);
  let drop = true;
  client.request = async (endpoint, op) => {
    if (endpoint === "/api/board") return store.snapshot();
    const result = store.apply(op);
    if (drop) {
      drop = false;
      throw new Error("lost acknowledgement after commit");
    }
    return result;
  };
  client.edit(id, note("第一稿"));
  await client.tick();
  client.edit(id, note("最新稿"));
  await client.tick();
  assert.equal(store.snapshot().items[id].value.text, "最新稿");
  assert.equal(client.conflicts.length, 0);
  assert.equal(client.pending.length, 0);
});

test("an edit timer that fires while a refresh is busy gets another drain", async () => {
  const store = createStore();
  const client = connected(store);
  let finish;
  client.request = () => new Promise(resolve => { finish = resolve; });
  const refresh = client.tick();
  client.edit(id, note("等候中的修改"));
  const busyTimer = timer;
  busyTimer();
  finish(store.snapshot());
  await refresh;
  assert.notEqual(timer, busyTimer, "the pending operation needs a new wake-up");
  client.request = async (endpoint, op) => endpoint === "/api/board" ? store.snapshot() : store.apply(op);
  timer();
  await client.tick();
  assert.equal(store.snapshot().items[id].value.text, "等候中的修改");
});

test("only the latest acknowledged recovery payload makes the draft durable", async () => {
  const store = createStore();
  const client = connected(store);
  const writes = [];
  window.desktop = { saveRecovery: (payload) => new Promise((resolve, reject) => writes.push({ payload, resolve, reject })) };
  client.request = async () => { throw new Error("offline"); };
  client.edit(id, note("较旧的输入"));
  client.edit(id, note("最新输入"));
  const canClose = client.ensureRecoverable();
  await client.tick();
  assert.equal(writes.length, 1, "only one recovery write may be in flight");
  assert.equal(client.saveState(id).label, "尚未落盘");
  writes[0].resolve();
  await new Promise(setImmediate);
  assert.equal(writes.length, 2);
  assert.equal(JSON.parse(writes[1].payload).pending[0].value.text, "最新输入");
  assert.equal(client.saveState(id).label, "尚未落盘");
  writes[1].reject(new Error("storage refused the checkpoint"));
  assert.equal(await canClose, false, "an older checkpoint cannot permit exit with the latest input missing");
  await new Promise(setImmediate);
  assert.match(client.error, /恢复副本写入失败/);
  assert.equal(client.saveState(id).label, "尚未落盘");
  client.retry();
  assert.equal(writes.length, 3);
  writes[2].resolve();
  await new Promise(setImmediate);
  assert.equal(await client.ensureRecoverable(), true);
  assert.equal(client.saveState(id).label, "已暂存 · 待同步");
  assert.equal(client.view()[id].value.text, "最新输入");
  client.stop();
});

test("a conflicted deletion is retained after the queue drains and blocks destructive flush", async () => {
  const store = createStore();
  store.apply({ id, opId: "c".repeat(32), expected: 0, value: note("原便笺") });
  const client = connected(store);
  store.apply({ id, opId: "d".repeat(32), expected: 1, value: note("另一端已修改") });
  let recovery;
  global.localStorage.setItem = (_key, value) => { recovery = JSON.parse(value); };
  client.request = async (endpoint, op) => endpoint === "/api/board" ? store.snapshot() : store.apply(op);
  client.edit(id, null);
  await client.tick();
  assert.equal(client.pending.length, 0);
  assert.equal(client.view()[id].value.text, "另一端已修改");
  assert.equal(client.saveState(id).tone, "error");
  assert.match(client.error, /删除未保存/);
  assert.equal(recovery.rejected[0].operation.value, null);
  await assert.rejects(client.flush(), /尚未保存/);
  client.keepFailedDeletes();
  assert.equal(client.saveState(id).label, "已保存");
});

test("pending recovery from a different work page is neither replayed nor overwritten", async () => {
  const old = createStore().snapshot();
  const incoming = { roomId: old.roomId, base: old, conflicts: [], pending: [{ id, opId: "e".repeat(32), expected: 0, value: note("旧草稿") }] };
  const store = createStore();
  let writes = 0;
  window.desktop = { recovery: async () => incoming, saveRecovery: async () => { writes++; }, onBoard: () => () => {}, onFocus: () => () => {} };
  const client = new BoardClient(() => {});
  client.request = async (endpoint) => {
    assert.equal(endpoint, "/api/board");
    return store.snapshot();
  };
  await client.start();
  assert.equal(client.pending.length, 0);
  assert.equal(writes, 0);
  assert.match(client.detachedRecovery, /旧草稿/);
  client.stop();
});

test("restored topology edits use the original operation ID and are safe to replay", async () => {
  const store = createStore();
  const base = store.snapshot();
  const operation = { id, opId: "f".repeat(32), expected: 0, value: {
    type: "node", text: "恢复空间草稿", topology: { x: -350, y: 2600, width: 280, height: 140, kind: "task", status: "active" },
  } };
  store.apply(operation);
  window.desktop = {
    recovery: async () => ({ roomId: base.roomId, base, conflicts: [], pending: [operation] }),
    saveRecovery: async () => {}, onBoard: () => () => {}, onFocus: () => () => {},
  };
  const client = new BoardClient(() => {});
  const sent = [];
  client.request = async (_endpoint, pending) => {
    if (!pending) return store.snapshot();
    sent.push(pending.opId);
    return store.apply(pending);
  };
  await client.start();
  assert.deepEqual(sent, [operation.opId]);
  assert.deepEqual(store.snapshot().items[id], { version: 1, value: operation.value });
  assert.equal(client.pending.length, 0);
  client.stop();
});

test("continuous edits cannot postpone the first save indefinitely", (t) => {
  let now = 100;
  t.mock.method(Date, "now", () => now);
  const client = connected(createStore());
  for (; now <= 1100; now += 100) client.edit(id, note(String(now)));
  assert.equal(delay, 0);
  assert.equal(client.pending.length, 1);
});

test("reference recovery retries its original operation and migration flushes first", async () => {
  const store = createStore(), roomId = store.snapshot().roomId;
  const value = { type: "canvas-node", roomId, canvasId: roomId,
    contentRef: { kind: "record", id: "c".repeat(32) },
    layout: { x: 0, y: 0, width: 280, height: 140, kind: "note", status: "open" } };
  const operation = { id, opId: "b".repeat(32), expected: 0, value };
  const recovery = { roomId, base: store.snapshot(), pending: [operation], conflicts: [] };
  const client = connected(store);
  window.desktop = { recovery: async () => recovery, saveRecovery: async () => {}, onBoard: () => () => {}, onFocus: () => () => {},
    canvas: { migrate: async options => {
      assert.equal(client.pending.length, 0);
      assert.equal(options.revision, store.snapshot().revision);
      return { roomId, revision: options.revision, canvasId: roomId, added: 0 };
    } } };
  const sent = [];
  client.request = async (_endpoint, operation) => {
    if (!operation) return store.snapshot();
    sent.push(operation.opId); return store.apply(operation);
  };
  await client.start();
  assert.deepEqual(sent, [operation.opId]);
  assert.equal(client.detachedRecovery, "");
  await client.migrateCanvas();
  client.stop();
});

test("generic recover never duplicates conflicted references", async () => {
  const store = createStore(), roomId = store.snapshot().roomId;
  const client = connected(store);
  const value = { type: "canvas-node", roomId, canvasId: roomId, contentRef: { kind: "record", id },
    layout: { x: 0, y: 0, width: 280, height: 140, kind: "note", status: "open" } };
  client.request = async (_endpoint, operation) => {
    if (operation) throw Object.assign(new Error("conflict"), { status: 409 });
    return store.snapshot();
  };
  client.edit(id, value); await client.tick();
  client.recover();
  assert.equal(client.pending.length, 0);
  assert.equal(client.conflicts.length, 1);
});
