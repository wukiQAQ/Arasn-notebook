const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");
const { PanelEngine } = require("../desktop/engines/panel-engine.cjs");
const { DatabaseSync } = require("node:sqlite");
const { startCanvasShare } = require("../desktop/engines/canvas-share.cjs");

const layout = { x: 24, y: -80, width: 280, height: 120, kind: "note", status: "open" };
const note = text => ({ type: "text", text, x: 100, y: 200, width: 280, height: 150, color: "#263449", topology: layout });
const operation = (id, value, expected = 0) => ({ id, value, expected, opId: randomUUID() });
async function fixture(run) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-scoped-"));
  const directory = path.join(base, "data");
  let engine = new StorageEngine(directory);
  try {
    await engine.call("init");
    await run({ base, directory, get engine() { return engine; }, async restart() {
      await engine.close();
      engine = new StorageEngine(directory);
      return (await engine.call("init")).state;
    } });
  } finally {
    await engine.close();
    assert.equal(path.dirname(base), os.tmpdir());
    await fs.rm(base, { recursive: true, force: true });
  }
}
const catalog = (f, action, args = {}) => f.engine.call("canvasCatalog", { action, ...args });
const values = (state, canvasId) => Object.entries(state.items).filter(([, item]) => item.value?.canvasId === canvasId);
const save = (f, id, value, expected) => f.engine.call("board", { operation: operation(id, value, expected) });

test("historical records, nodes, edge, ink and viewport migrate once and survive restart", async () => fixture(async f => {
  const a = randomUUID(), b = randomUUID(), ink = randomUUID();
  const before = await save(f, a, note("historical A"));
  await save(f, b, note("historical B"));
  let snapshot = await save(f, ink, { type: "stroke", color: "#263449", width: 2, points: [[0, 0], [20, 30]] });
  await f.engine.call("setSetting", { key: "settings", value: { freeViewport: { roomId: before.roomId, x: 85, y: 135, zoom: 1.4 } } });
  await f.engine.call("canvasMigration", { dryRun: false, roomId: snapshot.roomId, revision: snapshot.revision });
  snapshot = (await f.engine.call("init")).state;
  const [fromNodeId, toNodeId] = values(snapshot, before.roomId).map(([id]) => id);
  const edge = randomUUID();
  await save(f, edge, { type: "canvas-edge", canvasId: before.roomId, roomId: before.roomId, fromNodeId, toNodeId, label: "关联", direction: "forward" });
  const first = await catalog(f, "list");
  const [workspace, relation] = first.catalog.boards;
  assert.equal(workspace.viewport.zoom, 1.4);
  assert.equal(values(first.state, workspace.id).length, 3);
  assert.equal(values(first.state, relation.id).length, 3);
  assert.equal(first.state.items[edge].value.fromNodeId, fromNodeId);
  assert.equal(first.state.items[ink].value.canvasId, workspace.id);
  assert.deepEqual(first.state.items[a], before.items[a]);
  await fs.access(path.join(first.catalog.backup, "workspace.sqlite"));
  assert.deepEqual((await catalog(f, "list")).catalog, first.catalog);
  assert.deepEqual(await f.restart(), first.state);
  assert.deepEqual((await catalog(f, "list")).catalog, first.catalog);
}));

test("a failed migration rolls back catalog and account data", async () => fixture(async f => {
  const initial = await save(f, randomUUID(), note("keep"));
  const db = new DatabaseSync(path.join(f.directory, "workspace.sqlite"));
  db.exec("CREATE TRIGGER fail_canvas_upgrade BEFORE INSERT ON elements BEGIN SELECT RAISE(ABORT, 'migration fault'); END");
  await assert.rejects(catalog(f, "list"), /migration fault/);
  assert.equal(await f.engine.call("getSetting", { key: "canvas-catalog" }), null);
  assert.deepEqual((await f.engine.call("init")).state.items, initial.items);
  db.exec("DROP TRIGGER fail_canvas_upgrade"); db.close();
  assert.equal((await catalog(f, "list")).catalog.boards.length, 2);
}));

test("parallel saves, duplicate references, trash, restore, purge and package import stay scoped", async () => fixture(async f => {
  const a = randomUUID();
  await save(f, a, note("Shared source"));
  const original = (await catalog(f, "list")).catalog.boards[0];
  const second = (await catalog(f, "create", { type: "workspace", name: "Another" })).catalog.boards.at(-1);
  const filePath = path.join(f.base, "sample.txt");
  await fs.writeFile(filePath, "preserve bytes");
  const [{ file }] = await f.engine.call("import", { paths: [filePath] });
  const stroke = { type: "stroke", color: "#263449", width: 2, points: [[1, 2], [3, 4]] };
  const firstStroke = randomUUID(), secondStroke = randomUUID();
  await Promise.all([save(f, firstStroke, { ...stroke, canvasId: original.id }), save(f, secondStroke, { ...stroke, canvasId: second.id })]);
  const attached = randomUUID();
  const fileValue = { type: "free-file", canvasId: original.id, roomId: (await catalog(f, "list")).catalog.roomId,
    x: 100, y: 350, width: 320, height: 140, localOnly: true, name: file.name, category: file.category, contentRef: { kind: "file", id: file.id } };
  await save(f, attached, fileValue);
  await assert.rejects(save(f, firstStroke, { ...stroke, canvasId: second.id }, 1), /其他画布/);
  const copy = await catalog(f, "duplicate", { id: original.id });
  const copied = copy.catalog.boards.at(-1);
  assert.equal(values(copy.state, copied.id).find(([, item]) => item.value.type === "free-note")[1].value.recordId, a);
  assert.equal(values(copy.state, copied.id).find(([, item]) => item.value.type === "free-file")[1].value.contentRef.id, file.id);
  assert.equal(values(copy.state, copied.id).length, 3);
  const copyFileId = values(copy.state, copied.id).find(([, item]) => item.value.type === "free-file")[0];
  await save(f, copyFileId, { ...fileValue, canvasId: copied.id, x: 500 }, 1);
  assert.equal((await f.engine.call("init")).state.items[attached].value.x, 100);
  await catalog(f, "trash", { id: original.id });
  await assert.rejects(save(f, attached, null, 1), /回收站/);
  await catalog(f, "restore", { id: original.id });
  const { pack } = await catalog(f, "export", { id: original.id, includeFiles: true, includeNotes: true });
  assert.equal(pack.files.length, 1);
  assert.equal(pack.records[0].text, "Shared source");
  const restoredPack = await catalog(f, "import", { pack });
  assert.equal(values(restoredPack.state, restoredPack.catalog.boards.at(-1).id).length, 3);
  assert.equal(restoredPack.state.items[a].value.text, "Shared source");
  assert.equal((await f.engine.call("list")).total, 1);
  const broken = structuredClone(pack);
  broken.files[0].sha256 = "0".repeat(64);
  await assert.rejects(catalog(f, "import", { pack: broken }), /校验失败/);
  assert.deepEqual((await catalog(f, "list")).catalog, restoredPack.catalog);
  await catalog(f, "trash", { id: original.id });
  const purged = await catalog(f, "purge", { id: original.id });
  assert.equal(values(purged.state, original.id).length, 0);
  assert.equal(purged.state.items[a].value.text, "Shared source");
  assert.equal((await f.engine.call("metadata", { id: file.id })).status, "ready");
  assert.equal(await fs.readFile(filePath, "utf8"), "preserve bytes");
}));

test("existing LAN server protects canvas scope, permissions, stale writes, attachments and revocation", async () => fixture(async f => {
  const a = randomUUID(), b = randomUUID();
  await save(f, a, note("shared source"));
  const first = await catalog(f, "list");
  const workspace = first.catalog.boards[0];
  const second = (await catalog(f, "create", { type: "workspace", name: "private canvas" })).catalog.boards.at(-1);
  await save(f, b, note("secret elsewhere"));
  await save(f, randomUUID(), { type: "free-note", canvasId: second.id, recordId: b, x: 10, y: 10, color: "#263449" });
  const filename = path.join(f.base, "approved.txt");
  await fs.writeFile(filename, "approved attachment");
  const [{ file }] = await f.engine.call("import", { paths: [filename] });
  const attached = randomUUID();
  await save(f, attached, { type: "free-file", canvasId: workspace.id, roomId: first.catalog.roomId, x: 50, y: 50, width: 280, height: 140,
    localOnly: true, name: file.name, category: file.category, contentRef: { kind: "file", id: file.id } });
  const panel = await new PanelEngine(f.engine, () => {}).init();
  const config = { id: workspace.id, roomId: panel.snapshot().roomId, host: "127.0.0.1" };
  const viewer = await startCanvasShare(panel, { ...config, mode: "view" });
  const address = new URL(viewer.status().link);
  const headers = { Authorization: "Bearer " + address.hash.slice(1), "Content-Type": "application/json" };
  const api = route => new URL("/api/" + route, address);
  try {
    assert.equal((await fetch(api("board"))).status, 401);
    const view = await (await fetch(api("board?canvasId=" + second.id), { headers })).json();
    assert.equal(view.roomId, workspace.id);
    assert.equal(view.objects.length, 2);
    assert.doesNotMatch(JSON.stringify(view), /shared source|secret elsewhere|approved.txt|path/);
    assert.equal((await fetch(api("attachment/" + attached), { headers })).status, 404);
    const write = { id: view.objects[0].id, expected: view.objects[0].version, x: 55, y: 60, opId: randomUUID() };
    assert.equal((await fetch(api("ops"), { method: "POST", headers, body: JSON.stringify(write) })).status, 403);
  } finally { await viewer.close(); }
  await assert.rejects(fetch(api("board"), { headers }));
  const editor = await startCanvasShare(panel, { ...config, mode: "edit", includeNotes: true, includeFiles: true });
  const url = new URL(editor.status().link);
  const allowed = { ...headers, Authorization: "Bearer " + url.hash.slice(1) };
  try {
    assert.equal((await fetch(new URL("/api/board", url), { headers })).status, 401);
    const view = await (await fetch(new URL("/api/board", url), { headers: allowed })).json();
    assert.match(JSON.stringify(view), /shared source/);
    assert.doesNotMatch(JSON.stringify(view), /secret elsewhere|path/);
    const served = await fetch(new URL("/api/attachment/" + attached, url), { headers: allowed });
    assert.equal(await served.text(), "approved attachment");
    const write = { id: view.objects[0].id, expected: view.objects[0].version, x: 55, y: 60, opId: randomUUID() };
    const post = body => fetch(new URL("/api/ops", url), { headers: allowed, method: "POST", body: JSON.stringify(body) });
    assert.equal((await post(write)).status, 200);
    assert.equal((await post({ ...write, opId: randomUUID() })).status, 409);
    assert.equal((await post({ ...write, id: b, opId: randomUUID() })).status, 404);
    assert.equal(panel.snapshot().items[a].value.text, "shared source");
  } finally { await editor.close(); }
}));
