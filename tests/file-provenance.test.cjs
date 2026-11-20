const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { ClipboardService } = require('../desktop/engines/clipboard-service.cjs');
test('local/paste provenance and note context survive restart without changing file lifecycle', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-provenance-'));
  const file = path.join(root, '真实资料.txt'); await fs.writeFile(file, '原文件保持不变');
  let engine = new StorageEngine(path.join(root, 'data'));
  try {
    await engine.call('init');
    const local = (await engine.call('import', { paths: [file] }))[0].file;
    assert.equal(local.importOrigin, 'local');
    const clip = new ClipboardService({ read: async () => [{ types: ['text/uri-list'], getType: async () => new Blob([pathToFileURL(file).href]) }] }, engine, root);
    const pasted = (await clip.paste()).results[0].file;
    assert.equal(pasted.importOrigin, 'paste');
    const unknown = (await engine.call('import', { paths: [file], origin: 'unknown' }))[0].file;
    assert.equal(unknown.importOrigin, 'unknown');
    const recordId = randomUUID();
    await engine.call('attachmentOrigin', { id: local.id, recordId, origin: '文件中心引用' });
    await engine.call('reference', { id: local.id });
    await engine.close(); engine = new StorageEngine(path.join(root, 'data')); await engine.call('init');
    const meta = await engine.call('metadata', { id: local.id, recordId });
    assert.equal(meta.importOrigin, 'local'); assert.equal(meta.attachmentOrigin, '文件中心引用');
    assert.equal(meta.source, undefined); assert.equal(meta.path, undefined);
    assert.equal((await engine.call('metadata', { id: pasted.id })).importOrigin, 'paste');
    assert.equal((await engine.call('list', { panel: true })).total, 1);
    await engine.call('trash', { id: local.id }); await engine.call('trash', { id: local.id, restore: true });
    assert.equal((await engine.call('metadata', { id: local.id, recordId })).attachmentOrigin, '文件中心引用');
    assert.equal(await fs.readFile(file, 'utf8'), '原文件保持不变');
  } finally { await engine.close(); await fs.rm(root, { recursive: true, force: true }); }
});
