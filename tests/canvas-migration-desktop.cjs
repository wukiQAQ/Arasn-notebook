const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-canvas-desktop-'));
  const record = randomUUID(), legacy = randomUUID();
  const seed = createStore(path.join(data, 'board.json'));
  seed.apply({ id: record, opId: randomUUID(), expected: 0, value: { type: 'text', text: '迁移前正文', x: 120, y: 140, color: '#263449' } });
  seed.apply({ id: legacy, opId: randomUUID(), expected: 0, value: { type: 'node', text: '旧灵感', topology: {
    x: -100, y: 40, width: 280, height: 140, kind: 'idea', status: 'active', hidden: true,
  } } });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const board = () => page.evaluate(async () => (await fetch('/api/board', {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` },
  })).json());
  const open = async () => {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    const expand = page.getByRole('button', { name: '打开工作区', exact: true });
    if (await expand.isVisible()) await expand.click();
    await expect(page.getByRole('button', { name: '打开关系画布', exact: true })).toBeEnabled();
  };
  const close = async () => { if (app) { await app.close(); app = undefined; } };
  try {
    await open();
    const before = await board();
    const preview = await page.evaluate(() => window.desktop.canvas.migrate());
    assert.equal(preview.added, 2);
    assert.deepEqual(await board(), before);
    const result = await page.evaluate(preview => window.desktop.canvas.migrate({
      dryRun: false, roomId: preview.roomId, revision: preview.revision,
    }), preview);
    assert(result.backup);
    const after = await board();
    assert.deepEqual(after.items[record], before.items[record]);
    assert.deepEqual(after.items[legacy], before.items[legacy]);
    const refs = Object.entries(after.items).filter(([, item]) => item.value?.type === 'canvas-node');
    assert.equal(refs.length, 2);
    const [refId, refItem] = refs.find(([, item]) => item.value.contentRef.id === record);
    const update = { id: refId, opId: randomUUID(), expected: refItem.version,
      value: { ...refItem.value, layout: { ...refItem.value.layout, x: 360 } } };
    assert.equal(await page.evaluate(async operation => (await fetch('/api/ops', {
      method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(operation),
    })).status, update), 200);
    assert.deepEqual((await board()).items[record], before.items[record]);
    await close(); await open();
    const restarted = await board();
    assert.equal(restarted.items[refId].value.layout.x, 360);
    assert.equal(Object.values(restarted.items).filter(item => item.value?.type === 'canvas-node').length, 2);
    const again = await page.evaluate(snapshot => window.desktop.canvas.migrate({ dryRun: false,
      roomId: snapshot.roomId, revision: snapshot.revision }), restarted);
    assert.equal(again.added, 0);
    await page.getByRole('button', { name: '打开关系画布', exact: true }).click();
    await expect(page.locator(`[data-topology-node="${refId}"]`)).toBeVisible();
    console.log('PASS preview, secured IPC, full backup, original IDs/bodies, independent layout, restart and idempotent migration');
  } finally {
    await close();
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert(path.basename(resolved).startsWith('arasn-canvas-desktop-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
