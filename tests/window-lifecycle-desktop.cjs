const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-window-lifecycle-'));
  const output = path.resolve('docs/screenshots/window-batch1'); await fs.mkdir(output, { recursive: true });
  const store = createStore(path.join(data, 'board.json')), recordId = randomUUID();
  store.apply({ id: recordId, opId: randomUUID(), expected: 0, value: { type: 'text', text: '保留工作位置\n切换速记后继续这里的讨论。', color: '#263449', x: 10, y: 10, topology: { x: 10, y: 10, width: 240, height: 160, kind: 'note', status: 'open' } } });
  const roomId = store.snapshot().roomId, engine = new StorageEngine(data);
  let nodeId;
  try {
    const initial = (await engine.call('init')).state;
    await engine.call('canvasMigration', { dryRun: false, roomId, revision: initial.revision });
    nodeId = Object.entries((await engine.call('init')).state.items).find(([, item]) => item.value?.type === 'canvas-node')[0];
  } finally { await engine.close(); }
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F21', alwaysOnTop: true }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win; const errors = [], checks = [], captures = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const state = () => win.evaluate(w => ({ bounds: w.getBounds(), normal: w.getNormalBounds(), maximized: w.isMaximized(), minimized: w.isMinimized(), visible: w.isVisible(), top: w.isAlwaysOnTop() }));
  const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
  const layout = value => page.evaluate(value => window.desktop.layout(value), value);
  const shot = async name => {
    await page.screenshot({ path: path.join(output, `${name}-content.png`) });
    captures.push({ name, ...(await captureNativeWindow(app, page, path.join(output, `${name}-windows.png`))) });
  };
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.setDefaultTimeout(12000); page.on('pageerror', error => errors.push(error.message));
    // This suite uses fill() for text and only Escape for key input. Ignore
    // incidental physical printable keys reaching the foreground test HWND.
    await page.evaluate(() => { window.__incidentalKeys = 0; document.addEventListener('keydown', event => {
      if ((event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key)) && !event.ctrlKey && !event.altKey && !event.metaKey) { event.preventDefault(); window.__incidentalKeys++; }
    }, true); });
    win = await app.browserWindow(page); await win.evaluate(w => { w.show(); w.focus(); });
    await expect(page.locator('.quick-title')).toBeEnabled();
    await page.locator('.quick-input').fill('独立速记草稿');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    const quick = await state();
    await layout(true); await expect(page.locator('.xigra-record-editor')).toHaveValue('独立速记草稿');
    await win.evaluate(w => { w.unmaximize(); w.setBounds({ x: 90, y: 70, width: 1080, height: 740 }); });
    await expect.poll(async () => (await state()).bounds.width).toBe(1080);
    const normal = await state();
    await button('打开关系画布').click(); const node = page.locator(`[data-topology-node="${nodeId}"]`);
    await node.click(); await expect(node).toHaveAttribute('data-selected', 'true');
    await button('放大画布').click();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const transform = await page.locator('.topology-world').getAttribute('style');
    await page.evaluate(id => { window.__workspaceNode = document.querySelector(`[data-topology-node="${id}"]`); window.__workspaceRoot = document.querySelector('main'); }, nodeId);
    const count = Object.values((await board()).items).filter(i => i.value?.type === 'text').length;
    // Log native bounds events with visibility, including the maximize/unmaximize path.
    await win.evaluate(w => { globalThis.__windowEvents = []; for (const event of ['show', 'hide', 'resize', 'maximize', 'unmaximize']) w.on(event, () => globalThis.__windowEvents.push({ event, visible: w.isVisible(), opacity: w.getOpacity(), maximized: w.isMaximized() })); });
    await layout(false); await expect(page.locator('.quick-input')).toHaveValue('独立速记草稿');
    await expect(page.locator('.quick-input')).toBeFocused(); assert.deepEqual((await state()).bounds, quick.bounds);
    await page.locator('.quick-input').fill('独立速记草稿\n新的想法继续写在这里。');
    await layout(true); assert.deepEqual((await state()).bounds, normal.bounds);
    await expect(node).toHaveAttribute('data-selected', 'true');
    assert.equal(await page.locator('.topology-world').getAttribute('style'), transform);
    assert.equal(await page.evaluate(id => window.__workspaceRoot === document.querySelector('main') && window.__workspaceNode === document.querySelector(`[data-topology-node="${id}"]`), nodeId), true);
    checks.push('normal geometry, page, node identity, selected node, camera and independent quick text survive');
    await win.evaluate(w => w.maximize()); await expect.poll(async () => (await state()).maximized).toBe(true);
    await shot('light-workspace-maximized');
    await layout(false); assert.equal((await state()).maximized, false); assert.deepEqual((await state()).bounds, quick.bounds);
    await shot('light-quick');
    await layout(true); assert.equal((await state()).maximized, true); assert.equal((await state()).top, false);
    await expect(node).toHaveAttribute('data-selected', 'true');
    checks.push('maximized workspace restored; quick geometry separate; workspace never topmost');
    await win.evaluate(w => { globalThis.__windowEvents = []; w.minimize(); });
    await expect.poll(async () => (await state()).minimized).toBe(true);
    await layout(false); await expect(page.locator('.quick-input')).toBeVisible();
    // A minimized workspace switches without automatically revealing the quick panel.
    assert.equal((await state()).visible, false);
    await app.evaluate(({ app }) => app.emit('second-instance'));
    await expect.poll(async () => (await state()).visible).toBe(true);
    await layout(true); assert.equal((await state()).maximized, true);
    const switchEvents = await win.evaluate(() => globalThis.__windowEvents);
    assert(switchEvents.filter(e => ['resize', 'maximize', 'unmaximize'].includes(e.event)).every(e => !e.visible || e.opacity === 0), JSON.stringify(switchEvents));
    checks.push('minimized/maximized switch; no opaque geometry event before renderer readiness');
    // Watch every DOM mutation during popup exit, not just the settled page.
    for (const theme of ['light', 'dark']) {
      await button('设置与快捷键').first().click();
      await selectOption(page, '外观主题', theme);
      await button('关闭弹窗').click(); await expect(page.getByRole('dialog')).toBeHidden();
      const openShare = async () => { await button('设备互传').click(); await button('打开白板共享').click(); await expect(page.getByRole('dialog', { name: '白板实时共享', exact: true })).toBeVisible(); };
      await openShare(); await shot(`${theme}-share`);
      for (const method of ['close', 'escape', 'back', 'switch']) {
        console.log('Checking', theme, method);
        if (method !== 'close') await openShare();
        await page.evaluate(() => {
          window.__dialogFrames = [];
          const sample = () => window.__dialogFrames.push(Array.from(document.querySelectorAll('[role="dialog"]')).map(el => el.getAttribute('aria-label') || el.textContent.slice(0, 60)));
          sample(); window.__dialogObserver = new MutationObserver(sample); window.__dialogObserver.observe(document.body, { subtree: true, childList: true, attributes: true });
        });
        if (method === 'close') await button('关闭弹窗').click();
        if (method === 'escape') await page.keyboard.press('Escape');
        if (method === 'back') { await button('返回设备互传').click(); await expect(page.getByRole('dialog', { name: '设备互传', exact: true })).toBeVisible(); await button('关闭弹窗').click(); }
        if (method === 'switch') { await layout(false); await expect(page.getByRole('dialog')).toBeHidden(); await layout(true); }
        await expect(page.getByRole('dialog')).toBeHidden();
        const frames = await page.evaluate(() => { window.__dialogObserver.disconnect(); return window.__dialogFrames; });
        assert(!frames.flat().includes('设置'), `${theme}/${method}: settings flashed`);
        await expect(node).toHaveAttribute('data-selected', 'true'); assert.equal((await state()).maximized, true);
        checks.push(`${theme} share ${method}: no settings frame; workspace selection retained`);
      }
      await shot(`${theme}-restored-workspace`);
    }
    // Native trigger delivery while hidden must select the target before reveal.
    await win.evaluate(w => { w.hide(); w.webContents.send('app:trigger-action', 'quick-note', true); });
    await expect(page.locator('.quick-input')).toBeVisible(); await expect.poll(async () => (await state()).visible).toBe(true);
    await expect(page.locator('.quick-input')).toHaveValue('独立速记草稿\n新的想法继续写在这里。');
    await win.evaluate(w => w.webContents.send('app:trigger-action', 'workbench', true));
    await expect(page.locator('.topology-viewport')).toBeVisible(); await expect.poll(async () => (await state()).maximized).toBe(true);
    await page.evaluate(() => window.desktop.hide()); await expect.poll(async () => (await state()).visible).toBe(false);
    await app.evaluate(({ app }) => app.emit('second-instance')); await expect.poll(async () => (await state()).visible).toBe(true);
    assert.equal((await state()).maximized, true); checks.push('hidden native trigger action and second-instance restore');
    await win.evaluate(w => w.close()); await expect.poll(async () => (await state()).visible).toBe(false);
    await app.evaluate(({ app }) => app.emit('second-instance')); await expect.poll(async () => (await state()).visible).toBe(true);
    await page.evaluate(async () => { const switching = window.desktop.layout(false); await window.desktop.hide(); await switching; });
    await expect.poll(async () => (await state()).visible).toBe(false);
    await app.evaluate(({ app }) => app.emit('second-instance'));
    await expect.poll(async () => (await state()).visible).toBe(true);
    await layout(true); assert.equal((await state()).maximized, true);
    checks.push('hide during an in-flight transition wins over readiness reveal');
    assert.equal(Object.values((await board()).items).filter(i => i.value?.type === 'text').length, count);
    assert.deepEqual(errors, []);
    const events = await win.evaluate(() => globalThis.__windowEvents);
    // Every geometry mutation of a mode switch must occur hidden; explicit maximize is excluded.
    assert(events.some(e => e.event === 'resize' && (!e.visible || e.opacity === 0)));
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ platform: process.platform, checks, captures, events, errors, incidentalPrintableKeysBlocked: await page.evaluate(() => window.__incidentalKeys), nativeState: await state() }, null, 2));
    console.log(`PASS ${checks.length} lifecycle checks, ${captures.length} Win32 screenshots; no duplicate records or renderer errors`);
  } catch (error) {
    if (page) console.error(await page.evaluate(() => ({ dialogs: Array.from(document.querySelectorAll('[role="dialog"]')).map(el => ({ attrs: el.outerHTML.slice(0, 450), opacity: getComputedStyle(el).opacity, animations: el.getAnimations().map(a => ({ state: a.playState, pending: a.pending, time: a.currentTime, timing: a.effect.getComputedTiming() })) })), visibility: document.visibilityState })));
    if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (app) { const exited = new Promise(resolve => app.process().once('exit', resolve)); await app.evaluate(({ app }) => app.exit(0)).catch(() => {}); await exited; }
    const resolved = path.resolve(data); if (resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('arasn-window-lifecycle-')) await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
