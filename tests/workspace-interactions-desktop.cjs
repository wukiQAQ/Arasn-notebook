// Isolated, real Electron UI regression. `--safety` runs only file-area safeguards.
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { createStore } = require('../desktop/server.cjs');
const { assertPanGesture } = require('./helpers/pan-gesture.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-workspace-safety-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || path.join(root, 'docs/screenshots/workspace-safety'));
  await fs.mkdir(shots, { recursive: true });
  const recordA = randomUUID(), recordB = randomUUID();
  const store = createStore(path.join(data, 'board.json'));
  for (const [id, text, x, y] of [[recordA, '范围确认\n先确认，再准备材料。', -340, -120], [recordB, '准备材料\n保留原记录和关系。', 160, 80]]) {
    store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text, color: '#263449', x: x + 500, y: 140,
      topology: { x, y, width: 280, height: 140, kind: 'note', status: 'open' } } });
  }
  const source = path.join(data, '安全验证材料.txt');
  await fs.writeFile(source, 'File area clear must preserve this source and the managed copy.');
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page, a, b, edgeId, migrated = false;
  const button = name => page.getByRole('button', { name, exact: true });
  const card = id => page.locator(`[data-topology-node="${id}"]`);
  const board = () => page.evaluate(async () => {
    const response = await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  });
  const action = (name, args) => page.evaluate(([name, args]) => window.desktop.files.action(name, args), [name, args]);
  const fileOwners = id => {
    const db = new DatabaseSync(path.join(data, 'workspace.sqlite'), { readOnly: true });
    try { return [...db.prepare("SELECT owner_id AS id, 'canvas' AS kind FROM canvas_file_refs WHERE file_id=? ORDER BY owner_id").all(id),
      ...db.prepare("SELECT id, 'panel' AS kind FROM file_refs WHERE file_id=? ORDER BY id").all(id)].map(row => ({ ...row })); }
    finally { db.close(); }
  };
  const camera = () => page.evaluate(async () => (await window.desktop.info()).topologyViewport);
  const center = box => { assert(box, 'target must have a rendered box'); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; };
  const drag = async (from, to, mouseButton = 'left') => {
    await page.mouse.move(from.x, from.y); await page.mouse.down({ button: mouseButton });
    await page.mouse.move(to.x, to.y, { steps: 12 }); await page.mouse.up({ button: mouseButton });
  };
  const shot = name => page.screenshot({ path: path.join(shots, `${name}.png`), animations: 'disabled', scale: 'css' });
  const size = async width => {
    const win = await app.browserWindow(page);
    await win.evaluate((w, width) => { if (w.isMaximized()) w.unmaximize(); w.setResizable(true); w.setMinimumSize(320, 500); w.setContentSize(width, 900); w.show(); w.focus(); }, width);
    await expect.poll(() => page.evaluate(() => window.innerWidth)).toBe(width);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  const open = async () => {
    app = await electron.launch({ args: ['.'], cwd: root, env }); page = await app.firstWindow();
    await size(1440);
    if (await button('打开工作区').isVisible()) await button('打开工作区').click();
    await button('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    if (!migrated && await upgrade.isVisible()) { await expect(upgrade).toBeEnabled(); await upgrade.click(); }
    await expect(button('新建节点')).toBeEnabled();
    migrated = true;
    await size(1440);
  };
  const close = async () => { if (app) { await app.close(); app = undefined; } };
  const openFiles = async () => {
    await button('返回工作页').click(); await button('文件').click();
    await page.getByText('恢复与数据检查', { exact: true }).click();
  };
  const backToCanvas = async () => { await button('返回工作区').click(); await button('打开关系画布').click(); };
  try {
    await open();
    let state = await board();
    a = Object.entries(state.items).find(([, item]) => item.value?.type === 'canvas-node' && item.value.contentRef.id === recordA)[0];
    b = Object.entries(state.items).find(([, item]) => item.value?.type === 'canvas-node' && item.value.contentRef.id === recordB)[0];
    await card(a).locator('.relation-anchor-out').hover();
    await card(b).locator('.relation-anchor-in').hover();
    await card(a).locator('.relation-anchor-out').dragTo(card(b).locator('.relation-anchor-in'));
    await expect(page.getByLabel('关系类型', { exact: true })).toBeVisible();
    await require('./helpers/select-option.cjs').selectOption(page, '关系类型', 'dependency');
    await page.getByLabel('连接说明', { exact: true }).fill('清空文件区也保留此连接');
    await expect.poll(async () => Object.values((await board()).items).filter(i => i.value?.type === 'canvas-edge' && i.value.label === '清空文件区也保留此连接').length).toBe(1);
    edgeId = Object.entries((await board()).items).find(([, item]) => item.value?.type === 'canvas-edge')[0];
    await button('关闭关系详情').click();
    await openFiles();
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }); }, source);
    await button('导入文件').click();
    await expect(page.locator('.file-row')).toHaveCount(1);
    const listed = await page.evaluate(() => window.desktop.files.list({}));
    assert.equal(listed.total, 1);
    const fileId = listed.rows[0].id;
    await button('放入面板').click();
    const fileNode = randomUUID(), contentLink = randomUUID();
    state = await board();
    for (const operation of [
      { id: fileNode, opId: randomUUID(), expected: 0, value: { type: 'canvas-node', roomId: state.roomId, canvasId: state.roomId,
        contentRef: { kind: 'file', id: fileId }, layout: { x: 500, y: -120, width: 280, height: 140, kind: 'note', status: 'open', hidden: false } } },
      { id: contentLink, opId: randomUUID(), expected: 0, value: { type: 'content-link', roomId: state.roomId,
        recordId: recordA, targetRef: { kind: 'file', id: fileId } } },
    ]) {
      await page.evaluate(async operation => {
        const response = await fetch('/api/ops', { method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
        if (!response.ok) throw new Error(await response.text());
      }, operation);
    }
    const before = await board();
    const ownersBefore = fileOwners(fileId);
    const scopeBefore = await action('fileAreaPreview');
    assert.equal(scopeBefore.count, 1);
    assert(ownersBefore.some(owner => owner.id === fileNode));
    assert(ownersBefore.some(owner => owner.id === contentLink));
    await button('清空文件区').click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('文件区中的 1 个条目');
    await expect(confirm).toContainText('不会删除关系画布中的节点和连接');
    await shot('clear-confirm-desktop');
    await size(390); await shot('clear-confirm-390'); await size(1440);
    await confirm.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await board(), before, 'cancel preserves the complete board snapshot');
    assert.deepEqual(await action('fileAreaPreview'), scopeBefore, 'cancel preserves exact file references');
    assert.deepEqual(fileOwners(fileId), ownersBefore);
    await button('清空文件区').click();
    await confirm.getByRole('button', { name: '确认清空', exact: true }).click();
    await expect(page.locator('.file-row')).toHaveCount(0);
    assert.equal((await action('fileAreaPreview')).count, 0);
    assert.deepEqual(await board(), before, 'clear preserves all record/node/edge/link values and versions');
    const ownersAfter = fileOwners(fileId);
    assert.deepEqual(ownersAfter, ownersBefore.filter(owner => owner.kind !== 'panel'));
    await button('中转站').click();
    await expect(page.locator('.file-row')).toHaveCount(1);
    assert.equal((await page.evaluate(() => window.desktop.files.list({}))).total, 1);
    assert.equal(await fs.readFile(source, 'utf8'), 'File area clear must preserve this source and the managed copy.');
    assert.deepEqual(await fs.readFile(path.join(data, 'objects', `${fileId}.bin`)), await fs.readFile(source), 'managed copy bytes survive clear');
    await shot('clear-library-retained');
    await backToCanvas();
    await expect(card(a)).toBeVisible(); await expect(card(b)).toBeVisible();
    await expect(page.locator(`[data-edge="${edgeId}"]`)).toBeVisible();
    await shot('clear-canvas-retained');
    await close(); await open();
    assert.deepEqual(await board(), before, 'restart preserves board exactly after clear');
    assert.equal((await action('fileAreaPreview')).canUndo, true, 'undo remains available after restart');
    await openFiles();
    await expect(button('撤销清空文件区')).toBeEnabled(); await button('撤销清空文件区').click();
    await expect(page.locator('.file-row')).toHaveCount(1);
    assert.deepEqual((await action('fileAreaPreview')).refs, scopeBefore.refs, 'undo restores exact reference IDs');
    assert.deepEqual(fileOwners(fileId), ownersBefore);
    assert.deepEqual(await board(), before);
    await shot('clear-undone-after-restart');
    await backToCanvas();
    await close(); await open();
    assert.deepEqual(await board(), before, 'restart after undo preserves the entire board');
    assert.deepEqual((await action('fileAreaPreview')).refs, scopeBefore.refs);
    console.log('PASS P0 real Electron: exact count, cancel, scoped clear, source/library/owner/link/topology retention, persisted undo, two restarts');
    if (!process.argv.includes('--safety')) await canvasInteractions();
    await fs.rm(path.join(shots, 'failure.png'), { force: true });
  } catch (error) {
    if (page && !page.isClosed()) await shot('failure').catch(() => {});
    throw error;
  } finally {
    await close();
    const target = await fs.realpath(data);
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    await fs.rm(target, { recursive: true, force: true });
  }

  async function canvasInteractions() {
    const surface = page.getByRole('region', { name: '节点画布' });
    const panEvidence = [];
    const settledCamera = async (expected) => {
      // Read the rendered camera as well as the debounced persisted setting.
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect.poll(async () => {
        const rendered = await surface.evaluate(element => {
          const matrix = new DOMMatrix(getComputedStyle(element.querySelector('.topology-world')).transform);
          return { x: (element.clientWidth / 2 - matrix.e) / matrix.a, y: (element.clientHeight / 2 - matrix.f) / matrix.a, zoom: matrix.a };
        });
        const saved = await camera();
        return saved && Math.abs(saved.x - rendered.x) < .01 && Math.abs(saved.y - rendered.y) < .01 && Math.abs(saved.zoom - rendered.zoom) < .00001 &&
          (!expected || Math.abs(saved.x - expected.x) < .01 && Math.abs(saved.y - expected.y) < .01 && Math.abs(saved.zoom - expected.zoom) < .00001);
      }).toBe(true);
      return camera();
    };
    const panBlank = async (from, dx, dy) => {
      const before = await settledCamera(), state = await board();
      await surface.evaluate(element => {
        window.__workspacePanEvents = [];
        window.__workspacePanRecord = event => window.__workspacePanEvents.push({ type: event.type, id: event.pointerId, x: event.clientX, y: event.clientY, buttons: event.buttons });
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) element.addEventListener(type, window.__workspacePanRecord, true);
        window.addEventListener('blur', window.__workspacePanRecord);
      });
      await drag(from, { x: from.x + dx, y: from.y + dy });
      const events = await surface.evaluate(element => {
        for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']) element.removeEventListener(type, window.__workspacePanRecord, true);
        window.removeEventListener('blur', window.__workspacePanRecord);
        return window.__workspacePanEvents;
      });
      const after = await settledCamera({ x: before.x - dx / before.zoom, y: before.y - dy / before.zoom, zoom: before.zoom }), request = { ...from, dx, dy };
      panEvidence.push({ ...assertPanGesture({ before, after, events, request }), events, request });
      assert.deepEqual(await board(), state, 'blank pan preserves every board object');
      await fs.writeFile(path.join(shots, 'pan-gestures.json'), JSON.stringify(panEvidence, null, 2));
    };
    const blankPoint = () => surface.evaluate(element => {
      const box = element.getBoundingClientRect();
      for (let y = box.top + 70; y < box.bottom - 110; y += 50) for (let x = box.left + 40; x < box.right - 110; x += 50) {
        const target = document.elementFromPoint(x, y);
        if (target && element.contains(target) && !target.closest('[data-topology-node], [data-edge], button, .topology-minimap')) return { x, y };
      }
      throw new Error('No empty rendered canvas point');
    });
    await button('适配节点').click();
    const original = (await board()).items[a].value.layout;
    const body = center(await card(a).boundingBox());
    const curve = page.locator(`[data-edge="${edgeId}"] .relation-line`);
    const curveBefore = await curve.getAttribute('d');
    await page.mouse.move(body.x, body.y); await page.mouse.down();
    await page.mouse.move(body.x + 70, body.y + 45, { steps: 12 });
    await expect(curve).not.toHaveAttribute('d', curveBefore);
    assert.deepEqual((await board()).items[a].value.layout, original, 'drag preview does not save before release');
    await page.mouse.up();
    await expect.poll(async () => (await board()).items[a].value.layout.x).not.toBe(original.x);
    const moved = (await board()).items[a].value.layout;
    const emptyPan = await blankPoint();
    await panBlank(emptyPan, 60, 35);
    assert.deepEqual((await board()).items[a].value.layout, moved, 'blank left drag pans without moving nodes');
    const beforeSpacePan = await camera();
    await surface.focus();
    await page.keyboard.down('Space');
    const pan = center(await card(a).boundingBox());
    await drag(pan, { x: pan.x + 40, y: pan.y + 25 }); await page.keyboard.up('Space');
    await expect.poll(async () => (await camera()).x).not.toBe(beforeSpacePan.x);
    assert.deepEqual((await board()).items[a].value.layout, moved);
    const middleBefore = await camera();
    const middle = await blankPoint();
    await drag(middle, { x: middle.x + 40, y: middle.y + 20 }, 'middle');
    await expect.poll(async () => (await camera()).x).not.toBe(middleBefore.x);
    const zoomBefore = await camera();
    await surface.hover(); await page.mouse.wheel(0, -180);
    await expect.poll(async () => (await camera()).zoom).not.toBe(zoomBefore.zoom);
    await button('适配节点').click();
    await settledCamera();
    const blank = await blankPoint();
    await panBlank(blank, 30, 20);
    const boxes = await Promise.all([card(a).boundingBox(), card(b).boundingBox()]);
    const left = Math.min(...boxes.map(b => b.x)) - 12, top = Math.min(...boxes.map(b => b.y)) - 12;
    const right = Math.max(...boxes.map(b => b.x + b.width)) + 12, bottom = Math.max(...boxes.map(b => b.y + b.height)) + 12;
    await page.keyboard.down('Shift'); await drag({ x: left, y: top }, { x: right, y: bottom }); await page.keyboard.up('Shift');
    await expect(card(a)).toHaveAttribute('data-selected', 'true'); await expect(card(b)).toHaveAttribute('data-selected', 'true');
    await card(a).click(); await card(b).click({ modifiers: ['Shift'] });
    await expect(card(a)).toHaveAttribute('data-selected', 'true'); await expect(card(b)).toHaveAttribute('data-selected', 'true');
    const groupBefore = await board();
    const groupStart = center(await card(a).boundingBox());
    await drag(groupStart, { x: groupStart.x + 24, y: groupStart.y + 18 });
    await expect.poll(async () => (await board()).items[b].value.layout.x).not.toBe(groupBefore.items[b].value.layout.x);
    const groupAfter = await board();
    assert(Math.abs((groupAfter.items[a].value.layout.x-groupBefore.items[a].value.layout.x)-(groupAfter.items[b].value.layout.x-groupBefore.items[b].value.layout.x)) < .01);
    const beforeCopy = await board();
    const nodeCount = s => Object.values(s.items).filter(i => i.value?.type === 'canvas-node' && !i.value.layout.hidden).length;
    const edgeCount = s => Object.values(s.items).filter(i => i.value?.type === 'canvas-edge').length;
    await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
    await expect.poll(async () => nodeCount(await board())).toBe(nodeCount(beforeCopy) + 2);
    await expect.poll(async () => edgeCount(await board())).toBe(edgeCount(beforeCopy) + 1);
    const copied = await board();
    const copiedNodes = Object.entries(copied.items).filter(([id, item]) => !beforeCopy.items[id] && item.value?.type === 'canvas-node');
    assert.equal(copiedNodes.length, 2);
    for (const [, item] of copiedNodes) assert(![recordA, recordB].includes(item.value.contentRef.id), 'copies own independent record bodies');
    await page.keyboard.press('Control+z');
    await expect.poll(async () => nodeCount(await board())).toBe(nodeCount(beforeCopy));
    await page.keyboard.press('Control+y');
    await expect.poll(async () => nodeCount(await board())).toBe(nodeCount(beforeCopy) + 2);
    await expect.poll(async () => edgeCount(await board())).toBe(edgeCount(beforeCopy) + 1);
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.keyboard.press('Control+z');
      await expect.poll(async () => nodeCount(await board())).toBe(nodeCount(beforeCopy));
      await expect.poll(async () => edgeCount(await board())).toBe(edgeCount(beforeCopy));
      await page.keyboard.press('Control+y');
      await expect.poll(async () => nodeCount(await board())).toBe(nodeCount(beforeCopy) + 2);
      await expect.poll(async () => edgeCount(await board())).toBe(edgeCount(beforeCopy) + 1);
    }
    await page.getByRole('textbox', { name: '搜索节点' }).fill('范围确认');
    await expect(page.getByRole('group', { name: '搜索结果' })).toContainText('范围确认');
    await shot('canvas-search-desktop');
    await page.getByRole('textbox', { name: '搜索节点' }).fill('');
    const beforeArrange = await board();
    await button('整理节点').click();
    const arrangeDialog = page.getByRole('dialog', { name: '整理节点', exact: true });
    await expect(arrangeDialog).toBeVisible();
    assert.deepEqual(await board(), beforeArrange, 'arrange preview leaves board unchanged before confirmation');
    await shot('arrange-confirm');
    await arrangeDialog.getByRole('button', { name: '确认整理', exact: true }).click();
    await expect(arrangeDialog).toHaveCount(0);
    await expect.poll(async () => {
      const next = await board();
      return Object.entries(beforeArrange.items).some(([id, item]) => item.value?.type === 'canvas-node' && JSON.stringify(next.items[id]?.value?.layout) !== JSON.stringify(item.value.layout));
    }).toBe(true);
    const createAt = await blankPoint();
    const beforeCreate = nodeCount(await board());
    await page.mouse.dblclick(createAt.x, createAt.y);
    const quick = page.getByRole('dialog', { name: '快捷创建节点', exact: true });
    await expect(quick).toBeVisible(); await page.getByLabel('新节点内容', { exact: true }).fill('快捷节点验证');
    await quick.getByRole('button', { name: '创建节点', exact: true }).click();
    await expect.poll(async () => nodeCount(await board())).toBe(beforeCreate + 1);
    const createdState = await board();
    const created = Object.entries(createdState.items).find(([, item]) => item.value?.type === 'canvas-node' && createdState.items[item.value.contentRef.id]?.value?.text === '快捷节点验证')[0];
    if (await button('关闭详情').isVisible()) await button('关闭详情').click();
    await button('适配节点').click(); await card(created).click({ button: 'right' });
    await expect(page.getByRole('menu', { name: '画布上下文菜单', exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: '移除选中节点', exact: true }).click();
    await expect(card(created)).toHaveCount(0);
    assert.equal((await board()).items[createdState.items[created].value.contentRef.id].value.text, '快捷节点验证');
    await surface.focus(); await page.keyboard.press('Control+z'); await expect(card(created)).toBeVisible();
    await page.locator(`[data-edge="${edgeId}"] .relation-hit`).focus(); await page.keyboard.press('Enter');
    await require('./helpers/select-option.cjs').selectOption(page, '终点节点', created);
    await expect.poll(async () => (await board()).items[edgeId].value.toNodeId).toBe(created);
    await require('./helpers/select-option.cjs').selectOption(page, '起点节点', created);
    assert.equal((await board()).items[edgeId].value.fromNodeId, a, 'self-edge endpoint edit is rejected');
    await require('./helpers/select-option.cjs').selectOption(page, '终点节点', b);
    await expect.poll(async () => (await board()).items[edgeId].value.toNodeId).toBe(b);
    const beforeDelete = await board();
    await button('删除连接').click();
    await expect.poll(async () => (await board()).items[edgeId].value).toBe(null);
    await surface.focus(); await page.keyboard.press('Control+z');
    await expect.poll(async () => edgeCount(await board())).toBe(edgeCount(beforeDelete));
    const restored = await board();
    assert.equal(restored.items[edgeId].value, null, 'undo preserves the original edge tombstone');
    assert(Object.entries(restored.items).some(([id, item]) => id !== edgeId && JSON.stringify(item.value) === JSON.stringify(beforeDelete.items[edgeId].value)), 'deleted edge is restored under a fresh ID');
    await page.getByText('画布设置', { exact: true }).click();
    for (const label of ['显示网格', '网格吸附', '显示小地图']) {
      const field = page.getByRole('checkbox', { name: label, exact: true });
      const checked = await field.isChecked(); await field.setChecked(!checked); await expect(field).toBeChecked({ checked: !checked }); await field.setChecked(checked);
    }
    await require('./helpers/select-option.cjs').selectOption(page, '滚轮行为', 'pan');
    const panCamera = await camera(); await surface.hover(); await page.mouse.wheel(0, 80);
    await expect.poll(async () => (await camera()).y).not.toBe(panCamera.y);
    assert.equal((await camera()).zoom, panCamera.zoom, 'wheel pan preference keeps zoom fixed');
    await require('./helpers/select-option.cjs').selectOption(page, '滚轮行为', 'zoom');
    await expect.poll(async () => (await page.evaluate(() => window.desktop.info())).canvasOptions?.wheel).toBe('zoom');
    await page.getByText('画布设置', { exact: true }).click();
    await shot('canvas-practical-desktop');
    await size(390); await shot('canvas-practical-390'); await size(1440);
    const beforeNativeSpace = nodeCount(await board());
    await button('新建节点').focus(); await page.keyboard.press('Space');
    await expect.poll(async () => nodeCount(await board())).toBe(beforeNativeSpace + 1);
    if (await button('关闭详情').isVisible()) await button('关闭详情').click();
    const beforeCancel = (await board()).items[a].value.layout;
    await surface.evaluate(element => element.addEventListener('pointerdown', event => { window.__cancelPointer = event.pointerId; }, { once: true }));
    const cancelStart = center(await card(a).boundingBox());
    await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down();
    await page.mouse.move(cancelStart.x + 55, cancelStart.y + 30, { steps: 6 });
    await surface.dispatchEvent('pointercancel', { pointerId: await page.evaluate(() => window.__cancelPointer) }); await page.mouse.up();
    assert.deepEqual((await board()).items[a].value.layout, beforeCancel, 'pointercancel discards uncommitted node drag');
    const panCancelCamera = await camera();
    const world = page.locator('.topology-world'), panCancelTransform = await world.getAttribute('style');
    await surface.evaluate(element => element.addEventListener('pointerdown', event => { window.__cancelPointer = event.pointerId; }, { once: true }));
    await page.mouse.move(cancelStart.x, cancelStart.y); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(cancelStart.x + 60, cancelStart.y + 35, { steps: 6 });
    await expect(world).not.toHaveAttribute('style', panCancelTransform);
    await surface.dispatchEvent('pointercancel', { pointerId: await page.evaluate(() => window.__cancelPointer) }); await page.mouse.up({ button: 'middle' });
    await expect(world).toHaveAttribute('style', panCancelTransform);
    assert.deepEqual(await camera(), panCancelCamera, 'pointercancel restores camera without saving the interrupted pan');
    const finalState = await board();
    await close(); await open();
    assert.deepEqual(await board(), finalState);
    assert.equal((await page.evaluate(() => window.desktop.info())).canvasOptions.wheel, 'zoom');
    console.log('PASS P2/P3 real Electron: body drag, Space/middle pan, wheel zoom/pan, marquee/multi-selection, connected copy/paste, undo/redo, search, arrange, quick create, context remove/undo, endpoint edits, preference restart');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
