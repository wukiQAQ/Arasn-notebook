const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');

async function fixture(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-file-area-'));
  const data = path.join(dir, 'data');
  let engine = new StorageEngine(data), db;
  try {
    const initial = (await engine.call('init')).state;
    await engine.call('canvasMigration', { dryRun: false, roomId: initial.roomId, revision: initial.revision });
    const source = path.join(dir, 'payload.txt');
    await fs.writeFile(source, 'original file bytes');
    const imported = await engine.call('import', { paths: [source] });
    assert.equal(imported[0].ok, true, imported[0].error);
    const id = imported[0].file.id;
    await engine.call('reference', { id });
    const nodeIds = [randomUUID(), randomUUID()];
    for (const nodeId of nodeIds) await engine.call('board', { operation: {
      id: nodeId, opId: randomUUID(), expected: 0, value: {
        type: 'canvas-node', roomId: initial.roomId, canvasId: initial.roomId,
        contentRef: { kind: 'file', id },
        layout: { x: 0, y: 0, width: 280, height: 140, kind: 'note', status: 'open', hidden: false },
      },
    } });
    await engine.call('board', { operation: { id: randomUUID(), opId: randomUUID(), expected: 0,
      value: { type: 'canvas-edge', roomId: initial.roomId, canvasId: initial.roomId,
        fromNodeId: nodeIds[0], toNodeId: nodeIds[1], relationType: 'dependency', label: 'keep edge', direction: 'forward' },
    } });
    db = new DatabaseSync(path.join(data, 'workspace.sqlite'));
    const rows = table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map(row => ({ ...row }));
    const protectedRows = () => Object.fromEntries(['panels', 'elements', 'canvas_file_refs', 'files'].map(table => [table, rows(table)]));
    await run({ get engine() { return engine; }, db, id, data, rows, protectedRows,
      restart: async () => { await engine.close(); engine = new StorageEngine(data); await engine.call('init'); } });
  } finally {
    db?.close();
    await engine.close();
    assert.equal(path.dirname(dir), os.tmpdir());
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('file area preview and clear preserve board, canvas owners, files and other panels; undo survives restart', async () => fixture(async f => {
  // Duplicate references and trashed files are part of the scope; count is distinct files.
  await f.engine.call('reference', { id: f.id });
  await f.engine.call('trash', { id: f.id });
  f.db.prepare('INSERT INTO panels VALUES(?,?)').run('other', '{}');
  f.db.prepare('INSERT INTO file_refs VALUES(?,?,?)').run(randomUUID(), 'other', f.id);
  const before = (await f.engine.call('init')).state, protectedBefore = f.protectedRows();
  const refsBefore = f.rows('file_refs');
  const preview = await f.engine.call('fileAreaPreview');
  assert.equal(preview.count, 1);
  assert.equal(preview.refs.length, 2);
  assert.equal(preview.canUndo, false);
  // Cancel means preview only, with no settings or rows changed.
  assert.deepEqual(f.rows('file_refs'), refsBefore);
  assert.equal(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), null);
  await f.engine.call('clearFileArea', { refs: preview.refs });
  assert.deepEqual((await f.engine.call('init')).state, before);
  assert.deepEqual(f.protectedRows(), protectedBefore);
  assert.deepEqual(f.rows('file_refs'), refsBefore.filter(ref => ref.panel_id === 'other'));
  assert.equal((await f.engine.call('fileAreaPreview')).canUndo, true);
  assert.equal(await fs.readFile(path.join(f.data, 'objects', f.id + '.bin'), 'utf8'), 'original file bytes');
  await assert.rejects(f.engine.call('purge'), /引用/);
  await f.restart();
  assert.deepEqual((await f.engine.call('init')).state, before);
  assert.equal((await f.engine.call('fileAreaPreview')).canUndo, true);
  // Add a fresh ref for the same file and another file before undo: neither may be lost or duplicated.
  f.db.prepare('INSERT INTO file_refs VALUES(?,?,?)').run(randomUUID(), 'default', f.id);
  const addedId = randomUUID(), addedRef = randomUUID();
  f.db.prepare('INSERT INTO files VALUES(?,?,?,?,?,?,?,?)').run(addedId, 'new.txt', '文档', 0, null, 'ready', new Date().toISOString(), null);
  f.db.prepare('INSERT INTO file_refs VALUES(?,?,?)').run(addedRef, 'default', addedId);
  const newlyAdded = f.rows('file_refs');
  await f.engine.call('undoFileAreaClear');
  assert.deepEqual(f.rows('file_refs'), newlyAdded);
  assert.equal((await f.engine.call('fileAreaPreview')).canUndo, false);
  assert.equal(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), null);
  await f.engine.call('undoFileAreaClear');
  assert.deepEqual(f.rows('file_refs'), newlyAdded);
}));

test('stale or malformed clear scopes and SQLite failures retain references and prior undo atomically', async () => fixture(async f => {
  const original = await f.engine.call('fileAreaPreview');
  await f.engine.call('clearFileArea', { refs: original.refs });
  const backupBefore = await f.engine.call('getSetting', { key: 'file-area-before-clear' });
  await f.engine.call('reference', { id: f.id });
  const protectedBefore = f.protectedRows(), refsBefore = f.rows('file_refs');
  for (const args of [{}, { refs: [] }, { refs: original.refs }, { refs: [null] }, { refs: [refsBefore[0].id, refsBefore[0].id] }]) {
    await assert.rejects(f.engine.call('clearFileArea', args), /重新预览/);
    assert.deepEqual(f.rows('file_refs'), refsBefore);
    assert.deepEqual(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), backupBefore);
  }
  f.db.exec("CREATE TRIGGER fail_file_area BEFORE DELETE ON file_refs BEGIN SELECT RAISE(ABORT,'injected clear failure'); END;");
  await assert.rejects(f.engine.call('clearFileArea', { refs: (await f.engine.call('fileAreaPreview')).refs }), /injected clear failure/);
  assert.deepEqual(f.rows('file_refs'), refsBefore);
  assert.deepEqual(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), backupBefore);
  assert.deepEqual(f.protectedRows(), protectedBefore);
  f.db.exec('DROP TRIGGER fail_file_area');
  await f.engine.call('unreference', { id: f.id });
  await f.restart();
  f.db.exec("CREATE TRIGGER fail_file_area_undo BEFORE INSERT ON file_refs BEGIN SELECT RAISE(ABORT,'injected undo failure'); END;");
  await assert.rejects(f.engine.call('undoFileAreaClear'), /injected undo failure/);
  assert.deepEqual(f.rows('file_refs'), []);
  assert.deepEqual(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), backupBefore);
  f.db.exec('DROP TRIGGER fail_file_area_undo');
  await f.engine.call('undoFileAreaClear');
  assert.deepEqual(f.rows('file_refs'), backupBefore.refs);
  assert.deepEqual(f.protectedRows(), protectedBefore);
}));

test('undo rejects purged or missing saved files without consuming backup or restoring partial refs', async () => fixture(async f => {
  const source = path.join(path.dirname(f.data), 'unowned.txt');
  await fs.writeFile(source, 'unowned payload');
  const imported = await f.engine.call('import', { paths: [source] });
  assert.equal(imported[0].ok, true, imported[0].error);
  const id = imported[0].file.id;
  await f.engine.call('reference', { id });
  await f.engine.call('clearFileArea', { refs: (await f.engine.call('fileAreaPreview')).refs });
  const saved = await f.engine.call('getSetting', { key: 'file-area-before-clear' });
  await f.engine.call('trash', { id });
  await f.engine.call('purge');
  assert.equal(f.db.prepare('SELECT status FROM files WHERE id=?').get(id).status, 'purged');
  const protectedBefore = f.protectedRows();
  await assert.rejects(f.engine.call('undoFileAreaClear'), /恢复备份/);
  assert.deepEqual(f.rows('file_refs'), []);
  assert.deepEqual(f.protectedRows(), protectedBefore);
  assert.deepEqual(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), saved);
  assert.equal((await f.engine.call('fileAreaPreview')).canUndo, true);
  // A missing row must give the same actionable error, without a partial restore.
  f.db.prepare('DELETE FROM files WHERE id=?').run(id);
  await assert.rejects(f.engine.call('undoFileAreaClear'), /恢复备份/);
  assert.deepEqual(f.rows('file_refs'), []);
  assert.deepEqual(await f.engine.call('getSetting', { key: 'file-area-before-clear' }), saved);
}));

test('legacy clearPanel clears file refs only and returns unchanged board snapshot', async () => fixture(async f => {
  const before = (await f.engine.call('init')).state, protectedBefore = f.protectedRows();
  const result = await f.engine.call('clearPanel');
  assert.deepEqual(result, { roomId: before.roomId, revision: before.revision, items: before.items });
  assert.deepEqual((await f.engine.call('init')).state, before);
  assert.deepEqual(f.protectedRows(), protectedBefore);
  assert.equal((await f.engine.call('fileAreaPreview')).count, 0);
  await f.engine.call('clearPanel');
  assert.equal((await f.engine.call('fileAreaPreview')).canUndo, true);
  await f.engine.call('trash', { id: f.id });
  await assert.rejects(f.engine.call('purge'), /引用/);
  await f.restart();
  await f.engine.call('undoFileAreaClear');
  assert.equal((await f.engine.call('fileAreaPreview')).count, 1);
  assert.deepEqual((await f.engine.call('init')).state, before);
}));
