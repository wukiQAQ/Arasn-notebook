const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

const baseline = process.argv.includes('--before');
const out = path.resolve(process.env.ARASN_NETWORK_CANVAS_SHOTS || 'docs/screenshots/network-canvas-details');
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1.1, `${actual} vs ${expected}`);

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-network-canvas-'));
  let app;
  try {
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F22' }));
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const win = await app.browserWindow(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const shot = name => page.screenshot({ path: path.join(out, `${baseline ? 'before' : 'after'}-${name}.png`), animations: 'disabled' });
    async function size(width, height) {
      await expect.poll(async () => {
        const actual = await page.evaluate(() => [innerWidth, innerHeight]);
        if (actual[0] !== width || actual[1] !== height) {
          await win.evaluate((w, size) => {
            if (w.isMaximized()) w.unmaximize();
            w.setMinimumSize(350, 460);
            w.setContentSize(...size);
          }, [width, height]);
        }
        return actual;
      }).toEqual([width, height]);
    }
    async function theme(value) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, value);
    }
    const positions = () => page.evaluate(() => {
      const x = selector => document.querySelector(selector).getBoundingClientRect().left;
      return {
        title: x('.window-page-title span'), main: x('.app-shell > main'),
        frame: x('.topology-surface'),
        panel: x('.relation-tool-panel'), viewport: x('.topology-viewport'),
        width: document.querySelector('.sidebar').getBoundingClientRect().width,
      };
    });
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await app.evaluate(({ ipcMain }) => {
      const os = process.getBuiltinModule('node:os');
      os.networkInterfaces = () => ({
        'Wi-Fi 测试网络': [{ address: '192.168.1.25', family: 'IPv4', internal: false }],
        'vEthernet 测试网卡': [{ address: '192.168.56.1', family: 'IPv4', internal: false }],
      });
      const original = ipcMain._invokeHandlers.get('lan:view');
      ipcMain.removeHandler('lan:view');
      ipcMain.handle('lan:view', (...args) => globalThis.__networkViewError ? Promise.reject(Error('测试网络读取失败')) : original(...args));
    });
    await page.evaluate(() => window.desktop.layout(true));
    await size(1240, 780);
    await button('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    await expect(button('新建节点').or(upgrade)).toBeVisible();
    if (await upgrade.isVisible()) await upgrade.click();
    await button('新建节点').click();
    if (!baseline) await page.getByRole('menuitem', { name: '便签', exact: true }).click();
    await expect(page.locator('.topology-node[data-selected]')).toBeVisible();
    const results = {};
    for (const mode of ['full', 'compact', 'hidden']) {
      if (mode === 'compact') await button('紧凑导航').click();
      if (mode === 'hidden') await button('展开或收起侧边栏').click();
      await expect.poll(async () => Math.round((await positions()).width)).toBe({ full: 200, compact: 64, hidden: 0 }[mode]);
      results[mode] = await positions();
      await page.mouse.move(5, 50);
      await shot(`canvas-${mode}`);
    }
    await button('展开或收起侧边栏').click();
    if (!baseline) await button('展开导航').click();
    if (!baseline) await button('关闭详情').click();
    await button('设备互传').click();
    await button('打开便签互传').click();
    const nic = page.getByRole('combobox', { name: '私有网卡', exact: true });
    await nic.click();
    const selected = page.getByRole('option', { selected: true });
    await expect(selected).toBeVisible();
    const selectedStyle = () => selected.evaluate(el => {
      const s = getComputedStyle(el);
      return { outline: s.outlineWidth, shadow: s.boxShadow, weight: s.fontWeight, background: s.backgroundColor };
    });
    results.select = await selectedStyle();
    await shot('network-select');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    if (!baseline) await verify({ page, win, app, size, theme, button, shot, positions, results, nic, selected, selectedStyle });
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, `${baseline ? 'before' : 'after'}.json`), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await app?.close();
    await fs.rm(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

async function verify({ page, win, app, size, theme, button, shot, positions, results, nic, selected, selectedStyle }) {
  const help = button('使用说明');
  const popup = page.locator('.network-help-popup');
  const helpBounds = async () => {
    const rect = await popup.boundingBox();
    const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
    assert(rect.x >= 11 && rect.y >= 51 && rect.x + rect.width <= width - 11 && rect.y + rect.height <= height - 11,
      JSON.stringify({ rect, width, height }));
  };
  const openHelp = async text => {
    await expect(popup).toBeHidden();
    await help.click();
    await expect(popup).toContainText(text);
    await helpBounds();
  };
  const assertAlignment = ({ title, main, frame, panel, viewport, width }) => {
    assert(title >= 200 || Math.abs(title - main) < 1.1);
    near(frame, main);
    near(panel - viewport, 12);
    near(main, width);
  };
  for (const mode of ['full', 'compact', 'hidden']) assertAlignment(results[mode]);
  for (const value of ['light', 'dark']) {
    await theme(value);
    await nic.click();
    await expect(selected.locator('.app-select-check')).toBeVisible();
    const other = page.getByRole('option', { selected: false });
    await other.hover();
    const [pick, hover] = await Promise.all([selectedStyle(), other.evaluate(el => {
      const s = getComputedStyle(el);
      return { weight: s.fontWeight, background: s.backgroundColor, shadow: s.boxShadow };
    })]);
    assert.equal(pick.shadow, 'none');
    assert.equal(pick.weight, hover.weight);
    assert.equal(hover.shadow, 'none');
    assert.notEqual(pick.background, hover.background);
    await shot(`network-select-${value}`);
    await page.keyboard.press('ArrowUp');
    const focus = page.locator('.app-select-item:focus-visible');
    await expect(focus).toHaveCSS('outline-width', '1px');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(nic).toContainText('192.168.56.1');
    await expect(page.getByRole('listbox')).toBeHidden();
    await help.hover();
    await expect(page.getByRole('tooltip').filter({ hasText: '使用说明' })).toBeVisible();
    await openHelp('发送便签');
    await expect(popup).toContainText('SHA-256');
    await shot(`lan-help-${value}`);
    await page.keyboard.press('Escape');
    await expect(popup).toBeHidden();
    await expect(help).toBeFocused();
    await expect(page.getByRole('dialog', { name: '便签互传' })).toBeVisible();
    await openHelp('选择网卡');
    await page.getByText('局域网未开启。', { exact: true }).click({ position: { x: 12, y: 6 } });
    await expect(popup).toBeHidden();
  }
  await app.evaluate(() => { globalThis.__networkViewError = true; });
  await button('刷新网络').click();
  await expect(page.getByRole('alert')).toContainText('测试网络读取失败');
  await button('关闭便签互传').click();
  await button('设备互传').click();
  await openHelp('发现与配对');
  await page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await button('打开白板共享').click();
  await expect(page.getByRole('status').filter({ hasText: '未开启' })).toBeVisible();
  await expect(page.locator('.share-privacy')).toContainText('HTTP 传输未加密');
  for (const value of ['light', 'dark']) {
    await theme(value);
    for (const width of [1240, 820, 390]) {
      await size(width, width === 390 ? 500 : 780);
      await openHelp('获取访问链接');
      await shot(`share-help-${value}-${width}`);
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      await expect(help).toBeFocused();
      await expect(page.locator('.share-privacy')).toContainText('无需设备配对或批准');
    }
  }
  await size(820, 700);
  const shareNic = page.getByRole('combobox', { name: '共享网卡' });
  await shareNic.press('Space');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(shareNic).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  const node = page.locator('.topology-node[data-selected]');
  const nodeId = await node.getAttribute('data-topology-node');
  await button('放大画布').click();
  const connect = node.locator('[data-port=right]');
  await connect.press('Enter');
  await expect(page.locator('.relation-draft')).toHaveCount(1);
  const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: {
    Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`,
  } })).json());
  const camera = async () => (await page.evaluate(() => window.desktop.info())).topologyViewport;
  await expect.poll(async () => (await camera())?.zoom).toBeGreaterThan(1);
  const initial = { board: await board(), camera: await camera(), zoom: await button('复位视图').innerText() };
  const floating = () => page.evaluate(() => {
    const panel = document.querySelector('.relation-tool-panel').getBoundingClientRect();
    const settings = document.querySelector('.relation-tool-options').getBoundingClientRect();
    return { inset: settings.left - panel.right, top: settings.top, bottom: settings.bottom, right: settings.right, width: innerWidth, height: innerHeight };
  });
  const sampleTransition = async (label, width) => {
    const frames = await page.evaluate(async label => {
      const x = target => target.getBoundingClientRect().left;
      const action = [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === label);
      action.click();
      const selectors = ['.window-page-title span', '.app-shell > main', '.topology-surface', '.relation-tool-panel', '.topology-viewport'];
      const targets = selectors.map(s => document.querySelector(s));
      const sidebar = document.querySelector('.sidebar');
      const frames = [];
      const start = performance.now();
      while (performance.now() - start < 240) {
        await new Promise(requestAnimationFrame);
        const [title, main, frame, panel, viewport] = targets.map(x);
        frames.push({ title, main, frame, panel, viewport, width: sidebar.getBoundingClientRect().width });
      }
      return frames;
    }, label);
    frames.forEach(assertAlignment);
    near(frames.at(-1).width, width);
    assert(frames.some(frame => Math.abs(frame.width - width) > 3));
    return frames.length;
  };
  results.transitionFrames = [];
  for (const [label, width] of [['紧凑导航', 64], ['展开或收起侧边栏', 0], ['展开或收起侧边栏', 64], ['展开导航', 200]]) {
    results.transitionFrames.push(await sampleTransition(label, width));
    await button('画布设置').click();
    await expect(page.getByRole('checkbox', { name: '显示网格' })).toBeVisible();
    const placement = await floating();
    near(placement.inset, 7);
    assert(placement.right <= placement.width - 11 && placement.top >= 51 && placement.bottom <= placement.height - 11);
    await page.keyboard.press('Escape');
  }
  await button('画布设置').click();
  await shot('canvas-narrow-settings-dark');
  assert(await page.locator('.relation-tool-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await page.keyboard.press('Escape');
  await size(500, 540);
  assertAlignment(await positions());
  assert(await page.locator('.window-page-title').evaluate(el => el.clientWidth >= el.firstElementChild.offsetWidth));
  await button('页面操作').click();
  await expect(button('全局搜索')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('separator', { name: '调整侧边栏宽度' }).press('Home');
  await size(1240, 780);
  await page.getByRole('separator', { name: '调整侧边栏宽度' }).press('End');
  await expect.poll(async () => Math.round((await positions()).width)).toBe(280);
  assertAlignment(await positions());
  await win.evaluate(w => w.maximize());
  await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
  for (const [mode, label, width] of [['full', null, 280], ['compact', '紧凑导航', 64], ['hidden', '展开或收起侧边栏', 0]]) {
    if (label) await button(label).click();
    await expect.poll(async () => Math.round((await positions()).width)).toBe(width);
    assertAlignment(await positions());
    await shot(`canvas-max-${mode}-dark`);
  }
  if (process.platform === 'win32') {
    await captureNativeWindow(app, page, path.join(out, 'after-canvas-max-hidden-windows.png'));
  }
  await expect(node).toHaveAttribute('data-topology-node', nodeId);
  await expect(page.locator('.relation-draft')).toHaveCount(1);
  assert.deepEqual({ board: await board(), camera: await camera(), zoom: await button('复位视图').innerText() }, initial);
  await connect.press('Escape');
  const firstNode = page.locator(`[data-topology-node="${nodeId}"]`);
  const handle = await firstNode.locator('[data-drag-handle]').boundingBox();
  await page.mouse.move(handle.x + 40, handle.y + 10);
  await page.mouse.down();
  await page.mouse.move(handle.x + 390, handle.y - 120, { steps: 12 });
  await page.mouse.up();
  const beforeDrag = initial.board.items[nodeId].value.layout;
  await expect.poll(async () => (await board()).items[nodeId].value.layout.x).toBeGreaterThan(beforeDrag.x + 100);
  await expect(firstNode.getByRole('img', { name: '已保存' })).toBeVisible();
  await button('新建节点').click();
  await page.getByRole('menuitem', { name: '便签', exact: true }).click();
  await expect(node).not.toHaveAttribute('data-topology-node', nodeId);
  const secondId = await node.getAttribute('data-topology-node');
  await button('关闭详情').click();
  await firstNode.locator('[data-drag-handle]').click();
  await connect.press('Enter');
  await page.locator(`[data-topology-node="${secondId}"] [data-drag-handle]`).click();
  await expect.poll(async () => Object.values((await board()).items).some(({ value }) =>
    value?.type === 'canvas-edge' && value.fromNodeId === nodeId && value.toNodeId === secondId)).toBe(true);
  results.verified = ['two themes', 'selection/hover/keyboard', 'help dismissal and viewport bounds', 'network status and warning', 'three navigation modes and frame-by-frame alignment', 'narrow settings anchor', '500px and maximized window', 'canvas state preserved'];
  results.verified.push('node drag, link hit and persistence after navigation changes');
}
