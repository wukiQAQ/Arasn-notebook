const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

async function verify(scale, theme) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-window-shape-'));
  const shots = path.resolve(process.env.ARASN_SCREENSHOTS || 'docs/screenshots/window-shape-transition');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'text', text: '窗口测试节点\n保持关系画布位置和选中。', color: '#263449', x: 120, y: 140,
    topology: { x: 0, y: 0, width: 280, height: 132, kind: 'note', status: 'open' } } });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: ['.', `--force-device-scale-factor=${scale}`], env });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const win = await app.browserWindow(page);
    const button = name => page.getByRole('button', { name, exact: true });
    const switcher = page.locator('.mode-switch-button');
    const shell = page.locator('.app-shell');
    const capture = name => captureNativeWindow(app, page, path.join(shots, `${theme}-${name}.png`));
    const bounds = () => win.evaluate(w => w.getBounds());
    const waitMode = async expanded => {
      await expect(switcher).toHaveAttribute('aria-label', expanded ? '切换到便签区' : '切换到工作区');
      await expect(shell).toHaveAttribute('data-layout-motion', 'idle');
    };
    const change = async expanded => { await switcher.click(); await waitMode(expanded); };
    await win.evaluate(w => { w.show(); w.focus(); });
    await expect(page.locator('.quick-title')).toBeEnabled();
    await page.evaluate(async theme => { await window.desktop.settings({ theme }); document.documentElement.dataset.theme = theme; }, theme);
    assert.equal(await page.evaluate(() => devicePixelRatio), scale);
    await win.evaluate(w => w.setBounds({ ...w.getBounds(), x: 150, y: 100, width: 550, height: 590 }));
    const quick = await bounds();
    await page.locator('.quick-title').fill('过渡期间自动保存');
    const draft = '在窗口开始变化前立即切换，内容仍能保存。';
    await page.locator('.quick-input').fill(draft);
    await change(true);
    await win.evaluate(w => w.setBounds({ ...w.getBounds(), x: 55, y: 42, width: 920, height: 640 }));
    const workspace = await bounds();
    await button('打开关系画布').click();
    const migrate = button('备份并启用关系画布');
    if (await migrate.isVisible()) await migrate.click();
    const node = page.locator('[data-topology-node]').first();
    await node.click();
    await expect(node).toHaveAttribute('data-selected', 'true');
    await button('放大画布').click();
    const graph = page.locator('.topology-viewport');
    const graphBox = await graph.boundingBox();
    await page.mouse.move(graphBox.x + 30, graphBox.y + 35);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(graphBox.x + 115, graphBox.y + 80, { steps: 4 });
    await page.mouse.up({ button: 'middle' });
    await expect.poll(() => page.evaluate(async () => (await window.desktop.info()).topologyViewport?.zoom)).toBeGreaterThan(1);
    const camera = await page.evaluate(async () => (await window.desktop.info()).topologyViewport);

    await win.evaluate(w => {
      const setBounds = w.setBounds.bind(w);
      w.shapeTrace = { frames: [], hide: 0, opacity: [] };
      w.on('hide', () => w.shapeTrace.hide++);
      const setOpacity = w.setOpacity.bind(w);
      w.setOpacity = opacity => { w.shapeTrace.opacity.push(opacity); return setOpacity(opacity); };
      w.setBounds = (...args) => {
        const result = setBounds(...args);
        w.shapeTrace.frames.push({ at: performance.now(), ...w.getBounds(), requested: args[0], visible: w.isVisible() });
        return result;
      };
    });
    const trace = () => win.evaluate(w => w.shapeTrace);
    const resetTrace = () => win.evaluate(w => { w.shapeTrace = { frames: [], hide: 0, opacity: [] }; });
    const checkPath = async (start, end) => {
      const actual = await trace();
      const low = Math.min(start.width, end.width), high = Math.max(start.width, end.width);
      assert(new Set(actual.frames.filter(frame => frame.width > low && frame.width < high).map(frame => frame.width)).size >= 4, JSON.stringify(actual));
      assert.equal(actual.hide, 0);
      assert(!actual.opacity.includes(0) && actual.frames.every(frame => frame.visible));
      assert.deepEqual(await bounds(), end, JSON.stringify(actual.frames.slice(-4)));
      return actual.frames.length;
    };
    await capture('01-workspace');
    await switcher.click();
    await expect(shell).toHaveAttribute('data-layout-motion', 'in');
    await capture('02-shrinking');
    await switcher.evaluate(button => { button.click(); button.click(); button.click(); });
    await waitMode(false);
    const shrink = await checkPath(workspace, quick);
    await expect(page.locator('.quick-input')).toBeFocused();
    await expect(page.locator('.quick-input')).toHaveValue(draft);
    await capture('03-quick');

    await resetTrace();
    await switcher.click();
    await expect(shell).toHaveAttribute('data-layout-motion', 'in');
    await capture('04-expanding');
    await waitMode(true);
    const expand = await checkPath(quick, workspace);
    await expect(node).toHaveAttribute('data-selected', 'true');
    assert.deepEqual(await page.evaluate(async () => (await window.desktop.info()).topologyViewport), camera);

    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await resetTrace();
    await change(false);
    assert.deepEqual(await bounds(), quick);
    assert((await trace()).frames.length <= 3);
    await expect(page.locator('.quick-input')).toBeFocused();
    await resetTrace();
    await change(true);
    assert(await win.evaluate(w => w.isMaximized()));
    assert((await trace()).frames.length <= 3);
    await capture('05-maximized');
    await win.evaluate(w => w.unmaximize());
    await expect.poll(bounds).toEqual(workspace);

    await switcher.click();
    await expect(shell).toHaveAttribute('data-layout-motion', 'in');
    await win.evaluate(w => w.minimize());
    await waitMode(false);
    assert(await win.evaluate(w => w.isMinimized()));
    await win.evaluate(w => w.restore());
    await expect.poll(bounds).toEqual(quick);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const expanded of [true, false]) {
      await resetTrace();
      await change(expanded);
      assert((await trace()).frames.length <= 3);
      assert.deepEqual(await bounds(), expanded ? workspace : quick);
    }
    await expect.poll(() => page.evaluate(async text => {
      const response = await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } });
      const { items } = await response.json();
      return Object.values(items).some(item => item.value?.text?.includes(text));
    }, draft)).toBe(true);
    assert.deepEqual(errors, []);
    console.log(`PASS ${theme}, DPR ${scale}: ${shrink}/${expand} native bounds updates, both native maximized paths, rapid clicks, minimize/restore, reduced motion, focus, saved draft and graph state`);
  } finally {
    await app?.close();
    await fs.rm(data, { recursive: true, force: true });
  }
}

(async () => {
  await verify(1, 'dark');
  await verify(1.25, 'light');
})().catch(error => { console.error(error); process.exitCode = 1; });
