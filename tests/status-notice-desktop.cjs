const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-status-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/status-notice');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: {
    type: 'text', text: '状态提示检查\n提示出现时仍能操作属性和导航。', color: '#263449', x: 120, y: 140,
    topology: { x: 0, y: 0, width: 280, height: 140, kind: 'note', status: 'open' },
  } });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page, settingsPatched = false;
  const metrics = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const notice = page.locator('.toast, .workbench-status');
    const capture = name => page.screenshot({ path: path.join(shots, `${name}.png`), scale: 'css', animations: 'disabled' });
    if (await button('打开工作区').isVisible()) await button('打开工作区').click();
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.setMinimumSize(320, 500); w.setContentSize(1440, 900); w.show(); w.focus(); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    await button('打开关系画布').click();
    await button('备份并启用关系画布').click();
    await expect(notice).toBeVisible();
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    const initialBoard = await board();

    const checkLayout = async name => {
      await expect(notice).toBeVisible();
      const result = await notice.evaluate(el => {
        const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const n = rect(el), main = document.querySelector('.app-shell > main');
        const targets = ['.topbar', '.lagoon-rail', '.topology-surface', '.topology-inspector', '.file-station'];
        const overlaps = targets.flatMap(s => [...document.querySelectorAll(s)].filter(e => e.getClientRects().length).filter(e => {
          const r = rect(e); return Math.min(n.right, r.right) > Math.max(n.x, r.x) && Math.min(n.bottom, r.bottom) > Math.max(n.y, r.y);
        }).map(() => s));
        return { viewport: { width: innerWidth, height: innerHeight }, notice: n, overlaps, inMain: main.contains(el), overflow: document.documentElement.scrollWidth > innerWidth,
          headerBottom: rect(document.querySelector('.topbar')).bottom, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      });
      metrics.push({ name, ...result });
      await capture(name);
      assert.deepEqual(result.overlaps, [], `${name}: status overlaps controls or canvas`);
      assert.equal(result.inMain, true, 'expanded status belongs to the main content flow');
      assert(result.notice.y >= result.headerBottom, 'status stays below the header');
      assert(result.notice.x >= 0 && result.notice.right <= (await page.evaluate(() => innerWidth)) + 1);
      assert.equal(result.overflow, false);
      assert(result.scrollWidth <= result.clientWidth + 1, 'long messages wrap without horizontal overflow');
    };
    await checkLayout('upgrade-1440');
    await expect(notice).toHaveCount(0, { timeout: 6000 });
    for (const [width, height] of [[1440, 900], [820, 650], [390, 700]]) {
      await win.evaluate((w, size) => w.setContentSize(...size), [width, height]);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await button('适配节点').click();
      await page.locator('.topology-node').first().click();
      await page.keyboard.press('Control+c');
      await expect(notice).toContainText('已复制 1 个节点');
      await page.locator('.topology-node').first().dblclick();
      await expect(page.getByRole('dialog', { name: '节点详情', exact: true })).toBeVisible();
      await checkLayout(`inspector-${width}`);
      await button('关闭详情').click();
      await button('文件').click();
      await expect(page.getByRole('heading', { name: '文件', exact: true })).toBeVisible();
      await checkLayout(`files-${width}`);
      await button('打开关系画布').focus();
      await page.keyboard.press('Enter');
      await expect(button('新建节点')).toBeVisible();
      await expect(notice).toHaveCount(0, { timeout: 6000 });
    }

    // Exercise real notification/error handling with an isolated IPC failure.
    await app.evaluate(({ ipcMain }) => {
      global.statusSettingsHandler = ipcMain._invokeHandlers.get('app:settings');
      ipcMain.removeHandler('app:settings');
      ipcMain.handle('app:settings', () => { throw new Error('提示换行检查：' + '保存失败请检查本机设置。'.repeat(16) + 'X'.repeat(100)); });
    });
    settingsPatched = true;
    await button('设置与快捷键').last().click();
    await selectOption(page, '外观主题', 'dark');
    await expect(notice).toContainText('提示换行检查');
    await page.keyboard.press('Escape');
    await checkLayout('long-error-390');
    await expect(notice).toHaveCount(0, { timeout: 6000 });
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('app:settings'); ipcMain.handle('app:settings', global.statusSettingsHandler); delete global.statusSettingsHandler; });
    settingsPatched = false;
    await button('设置与快捷键').last().click();
    await selectOption(page, '外观主题', 'dark');
    await page.keyboard.press('Escape');
    await checkLayout('dark-390');
    await expect(notice).toHaveCount(0, { timeout: 6000 });
    assert.deepEqual(await board(), initialBoard, 'notifications, copy and navigation preserve all board data');
    assert.deepEqual(errors, []);
    console.log('PASS status: upgrade/copy/settings/error, 1440/820/390, inspector and navigation geometry, wrapping, keyboard navigation, expiry, dark theme');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png'), scale: 'css', animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(shots, 'geometry.json'), JSON.stringify(metrics, null, 2));
    if (settingsPatched && app) await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('app:settings'); ipcMain.handle('app:settings', global.statusSettingsHandler); delete global.statusSettingsHandler; }).catch(() => {});
    if (app) await app.close();
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
