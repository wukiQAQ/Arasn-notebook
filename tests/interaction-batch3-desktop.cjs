const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs'), { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-interaction3-'));
  const shots = path.resolve('docs/screenshots/interaction-batch3', process.env.ARASN_B3_PASS || 'pass1');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json')), records = [];
  for (let i = 0; i < 4; i++) {
    const id = randomUUID(); records.push(id);
    store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text: `语义节点 ${i + 1}\n原始正文`, x: 100, y: 80 + i * 160, color: '#263449', topology: { x: (i % 2) * 560 - 380, y: Math.floor(i / 2) * 280 - 200, width: 240, height: 140, kind: 'note', status: 'open' } } });
  }
  const roomId = store.snapshot().roomId, engine = new StorageEngine(data);
  const types = ['related', 'reference', 'dependency', 'resolves', 'attachment', 'source'];
  try {
    const state = (await engine.call('init')).state;
    await engine.call('canvasMigration', { dryRun: false, roomId, revision: state.revision });
    const current = (await engine.call('init')).state;
    const nodes = records.map(id => Object.keys(current.items).find(k => current.items[k].value?.contentRef?.id === id));
    for (const [i, pair] of [[0, [0, 1]], [1, [0, 2]], [2, [0, 3]], [3, [1, 2]], [4, [1, 3]], [5, [2, 3]]])
      await engine.call('board', { operation: { id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: nodes[pair[0]], toNodeId: nodes[pair[1]], relationType: types[i], direction: 'forward', label: types[i] } } });
  } finally { await engine.close(); }
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', topologyViewport: { roomId, x: 0, y: 0, zoom: .8 } }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page; const errors = [];
  const btn = name => page.getByRole('button', { name, exact: true });
  const capture = name => page.screenshot({ path: path.join(shots, name + '.png'), scale: 'css', animations: 'disabled' });
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env }); page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    await btn('打开工作区').click(); const win = await app.browserWindow(page); await win.evaluate(w => { w.setContentSize(1440, 900); w.show(); w.focus(); });
    await btn('我的随手页').click();
    const nav = btn('文件'), navWidth = (await nav.boundingBox()).width;
    await nav.hover(); await expect(nav).toHaveCSS('font-weight', '500'); assert.equal((await nav.boundingBox()).width, navWidth);
    await nav.focus(); await page.keyboard.press('Enter'); await expect(nav).toHaveAttribute('aria-current', 'page');
    await btn('我的随手页').click();
    await expect(btn('重做上次操作')).toBeDisabled(); await expect(btn('重做上次操作')).toHaveAttribute('title', '暂无可重做的操作');
    assert.equal(await btn('重做上次操作').evaluate(e => getComputedStyle(e).cursor), 'default');
    const source = path.join(data, '原图细节.png');
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1600; c.height = 1000; const x = c.getContext('2d'); x.fillStyle = '#f0f3f6'; x.fillRect(0, 0, 1600, 1000); x.fillStyle = '#3568a9'; for (let i = 0; i < 1600; i += 4) x.fillRect(i, 0, 1, 1000); x.fillStyle = '#111'; x.font = '48px sans-serif'; x.fillText('Original 1600 × 1000', 80, 120); return c.toDataURL().split(',')[1]; });
    await fs.writeFile(source, Buffer.from(png, 'base64'));
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }); }, source);
    await btn('文件').click(); await btn('导入文件').click(); await expect(page.locator('.file-row')).toHaveCount(1);
    const open = async () => { await btn('预览 原图细节.png').click(); await expect(page.locator('.image-preview-area img')).toBeVisible(); await expect(page.getByRole('status').filter({ hasText: '1600 × 1000' })).toBeVisible(); };
    await open(); assert.equal(await page.locator('.image-preview-area img').evaluate(i => i.naturalWidth), 1600);
    await capture('preview-fit-light-1440'); await btn('100%').click();
    assert.equal(await page.locator('.image-preview-area img').evaluate(i => i.getBoundingClientRect().width), 1600);
    await btn('放大图片').click(); await expect(page.getByLabel('图片显示比例')).toHaveText('125%'); await capture('preview-125');
    await page.keyboard.press('Escape'); await expect(btn('预览 原图细节.png')).toBeFocused();
    // Inject a real IPC failure in this isolated process, then restore it for retry.
    await app.evaluate(({ ipcMain }) => { const original = ipcMain._invokeHandlers.get('files:originalImage'); global.b3Original = original; ipcMain.removeHandler('files:originalImage'); ipcMain.handle('files:originalImage', () => { throw new Error('fixture: 原图读取失败'); }); });
    await btn('预览 原图细节.png').click(); await expect(page.getByRole('alert')).toContainText('原图读取失败'); await expect(page.locator('.image-preview-area img')).toHaveCount(0); await capture('preview-failure');
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('files:originalImage'); ipcMain.handle('files:originalImage', global.b3Original); delete global.b3Original; });
    await btn('重试读取原图').click(); await expect(page.locator('.image-preview-area img')).toBeVisible();
    for (const width of [820, 390]) { await win.evaluate((w, width) => { w.setMinimumSize(350, 460); w.setContentSize(width, 900); }, width); await btn('适应窗口').click(); await capture(`preview-light-${width}`); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await capture('preview-dark-390'); await page.keyboard.press('Escape');
    await win.evaluate(w => w.setContentSize(1440, 900)); await page.getByLabel('选择本页文件', { exact: true }).check(); await btn('加入工作页').click(); await btn('返回工作区').click();
    await page.locator('.free-image-preview').click(); await expect(page.locator('.image-preview-area img')).toBeVisible(); await capture('free-preview-dark'); await page.keyboard.press('Delete'); await page.keyboard.press('Control+z'); await expect(page.locator('.free-file-card')).toHaveCount(1); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape'); await expect(page.locator('.free-image-preview')).toBeFocused();
    await btn('打开关系画布').click(); await expect(page.locator('.relation-hit')).toHaveCount(6);
    const palettes = {};
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      palettes[theme] = await page.locator('.relation-edges g[data-edge]').evaluateAll(es => es.map(e => ({ type: e.getAttribute('data-relation'), color: getComputedStyle(e).getPropertyValue('--relation-color').trim(), stroke: getComputedStyle(e.querySelector('.relation-line')).stroke })));
      assert.equal(new Set(palettes[theme].map(x => x.color)).size, 5);
      assert(palettes[theme].every(x => x.stroke !== 'none'));
      await capture(`semantics-${theme}`);
    }
    assert.notDeepEqual(palettes.light.map(x => x.color), palettes.dark.map(x => x.color));
    await page.locator('.relation-hit').first().focus(); await page.keyboard.press('Enter');
    await selectOption(page, '关系类型', 'resolves'); await selectOption(page, '关系方向', 'both');
    const control = page.getByRole('combobox', { name: '关系类型', exact: true }); await control.focus(); await page.keyboard.press('Space'); await expect(page.getByRole('listbox')).toBeVisible(); await capture('select-open'); await page.keyboard.press('Escape'); await expect(control).toBeFocused(); await expect(page.getByLabel('关系方向', { exact: true })).toContainText('双向');
    await btn('关闭关系详情').click();
    for (const width of [1440, 820, 390]) { await win.evaluate((w, width) => w.setContentSize(width, 900), width); await capture(`navigation-${width}`); await expect(page.locator('.sidebar [aria-current="page"]')).toHaveCount(1); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
    await page.emulateMedia({ reducedMotion: 'reduce' }); assert.equal(await page.locator('.sidebar .space.active').evaluate(e => getComputedStyle(e).transitionDuration), '0s');
    await fs.writeFile(path.join(shots, 'colors.json'), JSON.stringify(palettes, null, 2)); assert.deepEqual(errors, []);
    console.log('PASS batch3: original dimensions/fit/100%/zoom/error/retry/free-preview/focus, semantic palettes, AppSelect keyboard, disabled feedback, navigation/reduced-motion, 1440/820/390');
  } catch (e) { if (page && !page.isClosed()) await capture('failure').catch(() => {}); throw e; }
  finally { if (app) await app.close(); const target = await fs.realpath(data); assert.equal(path.dirname(target), await fs.realpath(os.tmpdir())); await fs.rm(target, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
