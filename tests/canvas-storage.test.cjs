const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const layout = { x: -20, y: 80, width: 280, height: 140, kind: 'note', status: 'open', hidden: true };
const op = (id, value, expected = 0) => ({ id, opId: randomUUID(), value, expected });

async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-canvas-'));
  let engine = new StorageEngine(path.join(dir, 'data'));
  const restart = async () => { await engine.close(); engine = new StorageEngine(path.join(dir, 'data')); await engine.call('init'); return engine; };
  try { await run({ dir, get engine() { return engine; }, restart }); }
  finally { await engine.close(); assert.equal(path.dirname(dir), os.tmpdir()); await fs.rm(dir, { recursive: true, force: true }); }
}

test('record file attachments work before canvas migration, protect copies and retain source records', async () => fixture(async f => {
  const initial = (await f.engine.call('init')).state;
  const record = randomUUID(), link = randomUUID();
  const source = path.join(f.dir, 'attachment.txt');
  await fs.writeFile(source, 'source bytes');
  const imported = await f.engine.call('import', { paths: [source] });
  const fileId = imported[0].file.id;
  const value = { type: 'text', text: 'unchanged record', color: '#263449', x: 0, y: 0 };
  await f.engine.call('board', { operation: op(record, value) });
  const attachment = { type: 'content-link', roomId: initial.roomId, recordId: record, targetRef: { kind: 'file', id: fileId } };
  await assert.rejects(f.engine.call('board', { operation: op(randomUUID(), { ...attachment, recordId: randomUUID() }) }), /便签不存在/);
  await assert.rejects(f.engine.call('board', { operation: op(randomUUID(), attachment), legacyOnly: true }), /本机拓扑/);
  await f.engine.call('board', { operation: op(link, attachment) });
  const metadata = await f.engine.call('metadata', { id: fileId });
  assert.deepEqual(Object.keys(metadata).sort(), ['category', 'deleted_at', 'id', 'name', 'sha256', 'size', 'status']);
  assert.equal((await f.engine.call('fileOwners', { id: fileId }))[0].id, link);
  await assert.rejects(f.engine.call('metadata', { id: '../invalid' }));
  assert.equal(await f.engine.call('getSetting', { key: 'canvas-migration' }), null);
  await f.restart();
  const state = (await f.engine.call('init')).state;
  assert.deepEqual(state.items[record].value, value);
  assert.deepEqual(state.items[link].value, attachment);
  await f.engine.call('board', { operation: op(link, null, 1) });
  assert.equal((await f.engine.call('fileOwners', { id: fileId })).length, 0);
  assert.equal((await f.engine.call('metadata', { id: fileId })).status, 'ready');
  assert.equal(await fs.readFile(source, 'utf8'), 'source bytes');
}));

test('canvas record creation is atomic, idempotent, private and persists with edges', async () => fixture(async f => {
  const before = (await f.engine.call('init')).state;
  await f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision });
  const args = { roomId: before.roomId, recordId: randomUUID(), nodeId: randomUUID(), opId: randomUUID(), layout: { ...layout, hidden: false } };
  const initial = (await f.engine.call('init')).state;
  await assert.rejects(f.engine.call('canvasCreate', { ...args, layout: { ...layout, width: -1 } }));
  assert.deepEqual((await f.engine.call('init')).state, initial, 'invalid node cannot leave a record behind');
  const db = new DatabaseSync(path.join(f.dir, 'data/workspace.sqlite'));
  db.exec(`CREATE TRIGGER fail_canvas_create BEFORE INSERT ON elements WHEN NEW.id='${args.nodeId}' BEGIN SELECT RAISE(ABORT,'injected create failure'); END;`);
  await assert.rejects(f.engine.call('canvasCreate', args), /injected create failure/);
  assert.deepEqual((await f.engine.call('init')).state, initial);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM elements WHERE id=?').get(args.recordId).n, 0);
  db.exec('DROP TRIGGER fail_canvas_create'); db.close();
  const created = await f.engine.call('canvasCreate', args);
  assert.equal(created.items[args.recordId].value.localOnly, true);
  assert.equal(created.items[args.nodeId].value.contentRef.id, args.recordId);
  assert.deepEqual(await f.engine.call('canvasCreate', args), created);
  const second = { ...args, recordId: randomUUID(), nodeId: randomUUID(), opId: randomUUID() };
  await f.engine.call('canvasCreate', second);
  const edgeId = randomUUID();
  const edge = { type: 'canvas-edge', roomId: args.roomId, canvasId: args.roomId, fromNodeId: args.nodeId, toNodeId: second.nodeId, relationType: 'dependency', label: '先确认需求', direction: 'forward' };
  await f.engine.call('board', { operation: op(edgeId, edge) });
  await f.engine.call('board', { operation: op(args.nodeId, { ...created.items[args.nodeId].value, layout: { ...layout, x: 500, hidden: true } }, 1) });
  await f.restart();
  const restored = (await f.engine.call('init')).state;
  assert.deepEqual(restored.items[edgeId].value, edge);
  assert.equal(restored.items[args.nodeId].value.layout.x, 500);
  assert.deepEqual(restored.items[args.recordId], created.items[args.recordId]);
  await f.engine.call('board', { operation: op(edgeId, null, 1) });
  assert.deepEqual((await f.engine.call('init')).state.items[second.recordId].value.text, '');
}));

test('canvas creation copies initial text atomically and rejects invalid bodies without blank entities', async () => fixture(async f => {
  const before = (await f.engine.call('init')).state;
  await f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision });
  const db = new DatabaseSync(path.join(f.dir, 'data/workspace.sqlite'), { readOnly: true });
  try {
    const initial = (await f.engine.call('init')).state;
    for (const text of [null, 123, {}, 'x'.repeat(10001)]) {
      const args = { roomId: before.roomId, recordId: randomUUID(), nodeId: randomUUID(), opId: randomUUID(), layout, text };
      await assert.rejects(f.engine.call('canvasCreate', args));
      assert.deepEqual((await f.engine.call('init')).state, initial);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM elements WHERE id IN (?,?)').get(args.recordId, args.nodeId).n, 0);
    }
    const text = '复制的正文\n第二行与空格  保留';
    const args = { roomId: before.roomId, recordId: randomUUID(), nodeId: randomUUID(), opId: randomUUID(), layout, text };
    const created = await f.engine.call('canvasCreate', args);
    assert.equal(created.items[args.recordId].value.text, text);
    assert.equal(created.items[args.nodeId].value.contentRef.id, args.recordId);
    assert.equal(JSON.parse(db.prepare('SELECT value FROM elements WHERE id=?').get(args.recordId).value).text, text);
    await f.restart();
    assert.deepEqual((await f.engine.call('init')).state, created);
  } finally { db.close(); }
}));

test('migration previews, gates drafts, backs up, preserves originals and restarts idempotently', async () => fixture(async f => {
  const record = randomUUID(), legacy = randomUUID();
  await f.engine.call('init');
  await f.engine.call('board', { operation: op(record, { type: 'text', text: '原正文', x: 30, y: 50, color: '#263449' }) });
  await f.engine.call('board', { operation: op(legacy, { type: 'node', text: '旧节点正文', topology: layout }) });
  const before = (await f.engine.call('init')).state;
  const preview = await f.engine.call('canvasMigration');
  assert.equal(preview.added, 2);
  assert.deepEqual((await f.engine.call('init')).state, before);
  for (const recovery of [{ pending: [{}] }, { conflicts: [{}] }, { rejected: [{}] },
    { pending: [], conflicts: [] }, { roomId: randomUUID(), base: before, pending: [], conflicts: [] }, 'invalid']) {
    await f.engine.call('setSetting', { key: 'recovery', value: recovery });
    await assert.rejects(f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision }), /恢复|草稿/);
  }
  await f.engine.call('setSetting', { key: 'recovery', value: null });
  await assert.rejects(f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision - 1 }), /更改|过期/);
  const result = await f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision });
  assert.equal(result.added, 2);
  const saved = new DatabaseSync(path.join(result.backup, 'workspace.sqlite'), { readOnly: true });
  assert.equal(saved.prepare('PRAGMA user_version').get().user_version, 1);
  assert.deepEqual(JSON.parse(saved.prepare("SELECT state FROM panels WHERE id='default'").get().state), before);
  saved.close();
  await f.restart();
  const after = (await f.engine.call('init')).state;
  assert.deepEqual(after.items[record], before.items[record]);
  assert.deepEqual(after.items[legacy], before.items[legacy]);
  assert.deepEqual(after.receipts, before.receipts);
  assert.equal(Object.values(after.items).filter(i => i.value?.type === 'canvas-node').length, 2);
  const again = await f.engine.call('canvasMigration', { dryRun: false, roomId: after.roomId, revision: after.revision });
  assert.equal(again.added, 0);
  assert.equal(again.backup, result.backup);
  assert.deepEqual((await f.engine.call('init')).state, after);
  await f.engine.call('restoreBackup', { source: result.backup });
  assert.deepEqual((await f.engine.call('init')).state, before);
  assert.equal(await f.engine.call('getSetting', { key: 'canvas-migration' }), null);
}));

test('file ownership is precise, blocks purge, rolls back invalid refs and survives backup restore', async () => fixture(async f => {
  const before = (await f.engine.call('init')).state;
  await f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision });
  const source = path.join(f.dir, 'file.txt'); await fs.writeFile(source, 'file payload');
  const imported = await f.engine.call('import', { paths: [source] }); assert.equal(imported[0].ok, true);
  const fileId = imported[0].file.id, a = randomUUID(), b = randomUUID(), roomId = before.roomId;
  const value = { type: 'canvas-node', roomId, canvasId: roomId, contentRef: { kind: 'file', id: fileId }, layout };
  for (const id of [a, b]) await f.engine.call('board', { operation: op(id, value) });
  assert.equal((await f.engine.call('fileOwners', { id: fileId })).length, 2);
  const snapshot = (await f.engine.call('init')).state;
  await assert.rejects(f.engine.call('board', { operation: op(randomUUID(), { ...value, contentRef: { kind: 'file', id: randomUUID() } }) }), /文件不存在/);
  assert.deepEqual((await f.engine.call('init')).state, snapshot);
  const backup = path.join(f.dir, 'backup'); await f.engine.call('backup', { target: backup });
  await f.engine.call('trash', { id: fileId });
  await assert.rejects(f.engine.call('purge'), /引用/);
  await f.engine.call('board', { operation: op(a, null, 1) });
  assert.equal((await f.engine.call('fileOwners', { id: fileId })).length, 1);
  await assert.rejects(f.engine.call('purge'), /引用/);
  await f.engine.call('board', { operation: op(b, null, 1) });
  await f.engine.call('purge');
  await f.engine.call('restoreBackup', { source: backup });
  assert.equal((await f.engine.call('fileOwners', { id: fileId })).length, 2);
  assert.equal((await f.engine.call('list', {})).total, 1);
  const beforeClear = (await f.engine.call('init')).state;
  await f.engine.call('clearPanel');
  assert.equal((await f.engine.call('fileOwners', { id: fileId })).length, 2);
  assert.deepEqual((await f.engine.call('init')).state, beforeClear);
  await f.restart();
  assert.deepEqual((await f.engine.call('init')).state, beforeClear);
  assert.equal((await f.engine.call('list', {})).total, 1);
}));

test('failure during migration leaves no partial nodes, marker or schema bump', async () => fixture(async f => {
  await f.engine.call('init');
  await f.engine.call('board', { operation: op(randomUUID(), { type: 'node', text: '保留', topology: layout }) });
  const before = (await f.engine.call('init')).state;
  await f.engine.close();
  const db = new DatabaseSync(path.join(f.dir, 'data/workspace.sqlite'));
  db.exec("CREATE TRIGGER migration_failure BEFORE INSERT ON elements WHEN json_extract(NEW.value,'$.type')='canvas-node' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  db.close();
  await f.restart();
  await assert.rejects(f.engine.call('canvasMigration', { dryRun: false, roomId: before.roomId, revision: before.revision }), /injected failure/);
  assert.deepEqual((await f.engine.call('init')).state, before);
  assert.equal(await f.engine.call('getSetting', { key: 'canvas-migration' }), null);
  const check = new DatabaseSync(path.join(f.dir, 'data/workspace.sqlite'), { readOnly: true });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 1); check.close();
}));
