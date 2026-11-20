const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-capture2-'));
  const shots = path.resolve(process.env.ARASN_CAPTURE_SHOTS || 'docs/screenshots/capture-batch2/pass1'); await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const note = randomUUID(), distant = randomUUID();
  const seed = (id, value) => store.apply({ id, value, opId: randomUUID(), expected: 0 });
  seed(note, { type: 'text', text: '中文正文与清晰度检验\n第二行保留真实内容。\n第三行用于检查卡片内裁剪。', color: '#24384b', x: 100, y: 90, width: 270, height: 180, fontSize: 18 });
  seed(distant, { type: 'text', text: '远处的便签\n完整画布应包含此对象。', color: '#24384b', x: 1800, y: 900, width: 260, height: 150 });
  seed(randomUUID(), { type: 'stroke', color: '#e32636', width: 7, opacity: 1, points: [[420, 100], [550, 100], [550, 180], [420, 180], [420, 100]] });
  const roomId = store.snapshot().roomId;
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F24', freeViewport: { roomId, x: 600, y: 360, zoom: 1 } }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win; const errors = [], checks = [], outputs = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const dialog = () => page.getByRole('dialog', { name: '截图 / 导出', exact: true });
  const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
  const write = value => page.evaluate(async value => {
    const response = await fetch('/api/ops', { method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
    if (!response.ok) throw Error(await response.text());
  }, value);
  async function launch(dpi) {
    app = await electron.launch({ args: ['.', ...(dpi ? [`--force-device-scale-factor=${dpi}`] : [])], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      window.__captureTrace = [];
      const encode = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
        window.__captureTrace.push(['encode', this.width, this.height]);
        return encode.call(this, blob => { window.__captureTrace.push(['encoded', !!blob]); callback(blob); }, ...args);
      };
      const decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function() { window.__captureTrace.push(['decode']); await decode.call(this); window.__captureTrace.push(['decoded']); };
    });
    await page.locator('.quick-title:enabled').waitFor();
    win = await app.browserWindow(page); await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    await page.evaluate(() => document.addEventListener('keydown', event => { if (!event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key))) event.preventDefault(); }, true));
    await page.evaluate(() => window.desktop.layout(true)); await button('我的随手页').click();
    await win.evaluate(w => { w.unmaximize(); w.setContentSize(1440, 900); });
    if (dpi) await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(dpi);
    else await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    if (!dpi) await expect(button('重置视图为100%')).toHaveText('100%');
    await app.evaluate(async ({ clipboard, ClipboardItem }) => {
      globalThis.__captureClipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
    });
  }
  async function stop() {
    if (!app) return;
    await app.evaluate(async ({ clipboard }) => { if (globalThis.__captureClipboard) await clipboard.write(globalThis.__captureClipboard); });
    const exited = new Promise(resolve => app.process().once('exit', resolve)); await app.evaluate(({ app }) => app.exit(0)); await exited; app = null;
  }
  async function open(mode) {
    await button('截图 / 导出').click(); await expect(dialog()).toBeVisible();
    await page.getByRole('radio', { name: new RegExp(mode) }).check();
  }
  async function ready() { await expect(dialog().locator('.capture-preview img')).toBeVisible({ timeout: 12000 }); await expect(button('保存 PNG')).toBeEnabled(); }
  async function close() { await button('关闭截图导出').click(); await expect(dialog()).toBeHidden(); }
  async function save(name, closeAfterClick = false) {
    await ready(); const file = path.join(shots, name + '.png');
    await app.evaluate(({ session }, file) => session.fromPartition('persist:arasn').once('will-download', (_event, item) => item.setSavePath(file)), file);
    await button('保存 PNG').click(); if (closeAfterClick) await close(); await expect.poll(() => fs.stat(file).then(stat => stat.size).catch(() => 0)).toBeGreaterThan(0);
    const bytes = await fs.readFile(file); const size = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }; outputs.push({ name, ...size }); return size;
  }
  async function selectRegion(x = 45, y = 50, width = 820, height = 330, during) {
    await button('开始框选').click(); const stage = page.getByRole('dialog', { name: '框选画布区域' }).locator('.capture-stage'); await expect(stage).toBeVisible();
    await stage.evaluate(el => { for (const type of ['pointerdown', 'pointerup']) el.addEventListener(type, event => window.__captureTrace.push([type, event.clientX, event.clientY, el.getBoundingClientRect().toJSON(), devicePixelRatio]), { once: true }); });
    const r = await stage.boundingBox(); await page.mouse.move(r.x + x, r.y + y); await page.mouse.down();
    await page.mouse.move(r.x + x + width, r.y + y + height, { steps: 10 });
    if (during) await during();
    await page.mouse.up(); await ready();
  }
  try {
    await launch();
    const file = path.join(data, '原始图案.png');
    const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#00a86b'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#e8b229'; x.fillRect(300, 0, 300, 400); return c.toDataURL().split(',')[1]; });
    await fs.writeFile(file, Buffer.from(png, 'base64'));
    const otherFiles = [];
    for (const [name, color] of [['蓝色原图.png', '#245ca8'], ['紫色原图.png', '#9b4d9b']]) {
      const bytes = await page.evaluate(color => { const c = document.createElement('canvas'); c.width = 600; c.height = 400; c.getContext('2d').fillStyle = color; c.getContext('2d').fillRect(0, 0, 600, 400); return c.toDataURL().split(',')[1]; }, color);
      const target = path.join(data, name); await fs.writeFile(target, Buffer.from(bytes, 'base64')); otherFiles.push(target);
    }
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, [file, ...otherFiles]);
    const imported = await page.evaluate(() => window.desktop.files.choose()); assert(imported[0].ok);
    const imageId = randomUUID();
    await write({ id: imageId, opId: randomUUID(), expected: 0, value: { type: 'free-file', roomId, contentRef: { kind: 'file', id: imported[0].file.id }, name: '原始图案.png', category: '图片', x: 570, y: 100, width: 290, height: 230, localOnly: true } });
    for (let i = 1; i < 3; i++) await write({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'free-file', roomId, contentRef: { kind: 'file', id: imported[i].file.id }, name: imported[i].file.name, category: '图片', x: 570 + (i - 1) * 240, y: 430, width: 200, height: 165, localOnly: true } });
    await expect(page.locator('.free-file-card img')).toHaveCount(3); await expect(page.locator('.free-file-card img').first()).toBeVisible();
    await page.locator(`[data-note-id="${note}"] textarea`).fill('中文正文与清晰度检验\n第二行保留真实内容。\n第三行用于检查卡片内裁剪。\n截图操作不应撤销这次输入');
    await page.locator(`[data-note-id="${note}"] textarea`).evaluate(el => { el.scrollTop = 0; });
    await expect(button('撤销上次操作')).toBeEnabled();
    await expect(page.locator('.save-state:visible')).toHaveText('已保存');
    await button('自由绘图').click();
    const original = await board(), camera = await page.locator('.paper').getAttribute('style');
    assert.equal(await button('导出图片').count(), 0); assert.equal(await button('导出当前视口').count(), 0);
    await open('框选截图');
    await selectRegion(45, 50, 820, 330, async () => {
      assert.equal(await page.locator('.paper-scroll').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
      assert.equal(await page.locator(`[data-note-id="${note}"] .note-handle > div`).evaluate(el => getComputedStyle(el).display), 'none');
      assert.equal(await page.locator(`[data-note-id="${note}"]`).evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await page.screenshot({ path: path.join(shots, 'light-region-overlay.png') });
      await captureNativeWindow(app, page, path.join(shots, 'light-region-windows.png'));
      await page.keyboard.press('Control+z'); await page.mouse.wheel(0, -500);
      assert.equal(await page.locator('.paper').getAttribute('style'), camera);
    });
    assert.deepEqual(await save('region-1x'), { width: 820, height: 330 });
    for (const multiplier of [2, 4]) {
      await selectOption(page, '导出倍率', String(multiplier)); await ready();
      assert.deepEqual(await save(`region-${multiplier}x`), { width: 820 * multiplier, height: 330 * multiplier });
    }
    await expect(dialog().locator('.capture-warnings')).toContainText('原图像素较少');
    await button('复制图片').click();
    await expect.poll(() => app.evaluate(async ({ clipboard, nativeImage }) => {
      const item = (await clipboard.read()).find(item => item.types.includes('image/png'));
      if (!item) return null; return nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer())).getSize();
    })).toEqual({ width: 3280, height: 1320 });
    assert(await app.evaluate(async ({ clipboard, nativeImage }, file) => {
      const item = (await clipboard.read()).find(item => item.types.includes('image/png'));
      const copied = nativeImage.createFromBuffer(Buffer.from(await (await item.getType('image/png')).arrayBuffer()));
      return copied.toBitmap().equals(nativeImage.createFromPath(file).toBitmap());
    }, path.join(shots, 'region-4x.png')));
    await page.screenshot({ path: path.join(shots, 'light-preview-4x.png') });
    await captureNativeWindow(app, page, path.join(shots, 'light-preview-windows.png'));
    await button('重新框选').click(); await expect(page.getByRole('dialog', { name: '框选画布区域' })).toBeVisible(); await page.keyboard.press('Escape');
    await expect(dialog()).toBeHidden(); assert.equal(await page.evaluate(() => document.getElementById('root').inert), false);
    assert.equal(await win.evaluate(w => w.isVisible()), true); assert.deepEqual(await board(), original);
    await open('框选截图'); await button('开始框选').click();
    await win.evaluate(w => w.webContents.send('app:trigger-action', 'quick-note', true, 0));
    await expect(page.locator('.quick-panel')).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.getElementById('root').inert)).toBe(false);
    assert.equal(await page.evaluate(() => document.documentElement.hasAttribute('data-capturing')), false);
    await page.evaluate(() => window.desktop.layout(true)); await expect(page.locator('.paper-scroll')).toBeVisible();
    assert.deepEqual(await board(), original);
    checks.push('region drag, 1/2/4 PNG dimensions, native clipboard, reselect/Esc, pen/wheel/undo isolation, board unchanged');
    checks.push('native quick-note switch cancels capture and restores workspace without leaving inert state');
    await open('当前视口'); await button('生成预览').click();
    const view = await page.locator('.paper-scroll').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
    assert.deepEqual(await save('viewport-1x'), view); await close();
    await open('完整画布'); await button('生成预览').click(); const all = await save('all-1x'); assert(all.width > view.width && all.height > view.height);
    await selectOption(page, '导出倍率', '4'); await expect(dialog().getByRole('alert')).toContainText('安全尺寸'); assert.equal(await button('保存 PNG').count(), 0);
    await selectOption(page, '导出倍率', '1'); await ready(); await selectOption(page, '导出留白', '48'); const padded = await save('all-padding-48'); assert.equal(padded.width, all.width + 48); assert.equal(padded.height, all.height + 48);
    await close(); checks.push('viewport excludes UI; full includes distant object; padding, safe limit, lower multiplier retry');
    const pixels = await app.evaluate(({ nativeImage }, file) => {
      const image = nativeImage.createFromPath(file), { width, height } = image.getSize(), bytes = image.toBitmap();
      let red = 0, green = 0, yellow = 0, blue = 0, purple = 0, ink = 0, noteInk = 0;
      for (let i = 0; i < width * height * 4; i += 4) { const b = bytes[i], g = bytes[i + 1], r = bytes[i + 2];
        if (r > 180 && g < 90 && b < 100) red++; if (g > 100 && r < 30 && b < 160) green++; if (r > 180 && g > 130 && b < 80) yellow++;
        if (r < 60 && g > 70 && g < 120 && b > 145) blue++; if (r > 135 && r < 180 && g < 100 && b > 130) purple++;
        if (r < 100 && g < 110 && b < 120) { ink++; const x = (i / 4) % width, y = Math.floor(i / 4 / width); if (x >= 42 && x < 275 && y >= 67 && y < 147) noteInk++; }
      } return { red, green, yellow, blue, purple, ink, noteInk };
    }, path.join(shots, 'all-1x.png'));
    assert(pixels.red > 100 && pixels.green > 2000 && pixels.yellow > 2000 && pixels.blue > 2000 && pixels.purple > 2000 && pixels.noteInk > 150, JSON.stringify(pixels));
    checks.push('export retains red SVG shape, three distinct originals after cache eviction, and real text pixels');
    await app.evaluate(({ ipcMain }) => { globalThis.__captureOriginal = ipcMain._invokeHandlers.get('files:originalImage'); ipcMain.removeHandler('files:originalImage'); ipcMain.handle('files:originalImage', () => { throw Error('验收：原图暂不可用'); }); });
    await open('当前视口'); await button('生成预览').click(); await expect(dialog().getByRole('alert')).toContainText('原图暂不可用'); assert.equal(await button('保存 PNG').count(), 0);
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('files:originalImage'); ipcMain.handle('files:originalImage', globalThis.__captureOriginal); });
    await button('刷新预览').click(); await ready(); await close(); checks.push('missing original fails explicitly; retry restores complete preview');
    await button('设置与快捷键').first().click(); await selectOption(page, '外观主题', 'dark'); await button('关闭弹窗').click();
    await open('当前视口'); await button('生成预览').click(); await ready(); await page.screenshot({ path: path.join(shots, 'dark-preview.png') }); await captureNativeWindow(app, page, path.join(shots, 'dark-preview-windows.png')); await close();
    await button('缩小').click(); await expect(button('重置视图为100%')).toHaveText('83%');
    const canvasRect = await page.locator('.paper-scroll').boundingBox();
    await page.mouse.move(canvasRect.x + 920, canvasRect.y + 490); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(canvasRect.x + 1080, canvasRect.y + 550, { steps: 8 }); await page.mouse.up({ button: 'middle' });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await open('当前视口'); await button('生成预览').click(); await save('zoomed-viewport'); await close();
    await open('框选截图'); await selectRegion(80, 90, 320, 200); assert.deepEqual(await save('zoomed-region'), { width: 320, height: 200 }); await close();
    await app.evaluate(({ nativeImage }, files) => {
      const view = nativeImage.createFromPath(files.view), crop = nativeImage.createFromPath(files.crop);
      const a = view.toBitmap(), b = crop.toBitmap(), width = view.getSize().width;
      for (let y = 10; y < 200; y += 20) for (let x = 10; x < 320; x += 20) for (let c = 0; c < 3; c++)
        if (Math.abs(a[((y + 90) * width + x + 80) * 4 + c] - b[(y * 320 + x) * 4 + c]) > 2) throw Error('缩放平移后的区域像素与视口裁剪不一致');
    }, { view: path.join(shots, 'zoomed-viewport.png'), crop: path.join(shots, 'zoomed-region.png') });
    assert.deepEqual(await board(), original); checks.push('dark theme, zoomed region uses correct world bounds');
    await button('打开关系画布').click(); await button('备份并启用关系画布').click(); await expect(button('新建节点')).toBeEnabled();
    const migrated = await board(), ids = Object.keys(migrated.items).filter(id => migrated.items[id].value?.type === 'canvas-node');
    const edgeId = randomUUID(); await write({ id: edgeId, opId: randomUUID(), expected: 0, value: { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: ids[0], toNodeId: ids[1], direction: 'both', relationType: 'dependency', label: '关系与标签也要清晰' } });
    await expect(page.locator(`[data-edge="${edgeId}"]`)).toHaveCount(1); const related = await board();
    await open('完整画布'); await button('生成预览').click(); await save('relations-all'); await page.screenshot({ path: path.join(shots, 'dark-relation-preview.png') }); await close();
    await open('框选截图'); await selectRegion(35, 45, 350, 220); assert.deepEqual(await save('relations-region'), { width: 350, height: 220 }); await close(); assert.deepEqual(await board(), related);
    checks.push('relation nodes and semantic curves/labels share full and region export; no graph edits');
    await win.evaluate(w => { w.setMinimumSize(320, 460); w.setContentSize(390, 720); });
    await open('完整画布'); await page.screenshot({ path: path.join(shots, 'dark-controls-390.png') }); await button('生成预览').click(); await ready(); await page.screenshot({ path: path.join(shots, 'dark-preview-390.png') });
    assert(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth));
    assert(await button('保存 PNG').evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; })); await close();
    await stop(); await launch(1.25);
    assert(Math.abs(await page.evaluate(() => devicePixelRatio) - 1.25) < .01);
    await open('当前视口'); await button('生成预览').click(); const dpiView = await page.locator('.paper-scroll').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
    assert.deepEqual(await save('dpi125-viewport', true), dpiView); checks.push('Windows 125% device scale is independent; save survives immediate preview close');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'results.json'), JSON.stringify({ checks, outputs, pixels, errors }, null, 2));
    console.log(`PASS capture batch2: ${checks.length} groups, ${outputs.length} PNG outputs, all layers/gestures/clipboard/limits/themes/125% DPI`);
  } catch (error) {
    if (page && !page.isClosed()) console.error(await page.evaluate(() => ({ hidden: document.hidden, fonts: document.fonts.status, inert: document.getElementById('root').inert, trace: window.__captureTrace })));
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {}); throw error;
  } finally {
    await stop(); const target = await fs.realpath(data); assert.equal(path.dirname(target), await fs.realpath(os.tmpdir())); assert(path.basename(target).startsWith('arasn-capture2-')); await fs.rm(target, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
