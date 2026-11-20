const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-notification-'));
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F22' }));
  const shots = path.resolve(process.env.ARASN_NOTIFICATION_SHOTS || 'docs/screenshots/notification');
  await fs.mkdir(shots, { recursive: true });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const metrics = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const notice = page.locator('.app-notification');
    const openSettings = () => button('设置与快捷键').last().click();
    const closeSettings = () => button('关闭弹窗').click();
    const capture = name => page.screenshot({ path: path.join(shots, `${name}.png`), scale: 'css', animations: 'disabled' });
    const win = await app.browserWindow(page);
    await page.locator('.quick-title:enabled').waitFor();
    // Finish the hidden startup transition before manipulating native geometry.
    await page.evaluate(() => window.desktop.layout(true));
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.setMinimumSize(320, 500); w.setContentSize(1440, 900); w.show(); w.focus(); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    await app.evaluate(({ ipcMain }) => {
      global.notificationOriginalSettings = ipcMain._invokeHandlers.get('app:settings');
      global.notificationCalls = [];
      global.notificationFail = false;
      ipcMain.removeHandler('app:settings');
      ipcMain.handle('app:settings', async (event, patch) => {
        global.notificationCalls.push(patch);
        if (global.notificationFail) throw new Error('磁盘暂不可写，请重试。' + 'X'.repeat(100));
        return global.notificationOriginalSettings(event, patch);
      });
    });
    const calls = () => app.evaluate(() => global.notificationCalls);
    const layout = () => page.evaluate(() => ['.topbar', '.lagoon-rail', '.topology-surface', '.topology-toolbar'].map(selector => {
      const el = document.querySelector(selector); const r = el?.getBoundingClientRect();
      return r ? [selector, r.x, r.y, r.width, r.height] : [selector];
    }));
    await button('打开关系画布').click();
    await button('备份并启用关系画布').click();
    await expect(notice).toBeVisible();
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    const originalBoard = await board();
    await button('关闭通知').click();
    await expect(notice).toHaveCount(0);
    // Passive canvas option persistence must remain quiet and preserve geometry.
    const before = await layout();
    await page.locator('.topology-options summary').click();
    await page.getByRole('checkbox', { name: '显示网格', exact: true }).uncheck();
    await expect.poll(async () => (await calls()).filter(p => p.canvasOptions).length).toBe(1);
    await page.locator('.topology-options summary').click();
    await page.waitForTimeout(350);
    await expect(notice).toHaveCount(0);
    assert.deepEqual(await layout(), before);
    // Repeated identical success messages merge and restart the full two seconds.
    await openSettings();
    const toggle = page.getByRole('checkbox', { name: '开机启动时隐藏到托盘', exact: true });
    await toggle.click();
    await expect(notice).toHaveAttribute('data-tone', 'success');
    const first = Date.now();
    await page.waitForTimeout(1300);
    await toggle.click();
    const second = Date.now();
    await expect(notice).toHaveCount(1);
    await page.waitForTimeout(1000);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveCount(0, { timeout: 1700 });
    const elapsed = Date.now() - second;
    assert(elapsed >= 1900 && elapsed < 2800, `success duration ${elapsed}ms`);
    metrics.push({ repeatedSuccess: { first, second, elapsed } });
    await closeSettings();
    // An error is persistent; retry invokes only the failed settings patch.
    await app.evaluate(() => { global.notificationFail = true; });
    await openSettings();
    await selectOption(page, '外观主题', 'dark');
    await expect(notice).toHaveAttribute('data-tone', 'error');
    await expect(notice.getByRole('alert')).toContainText('设置保存失败');
    await page.waitForTimeout(2600);
    await expect(notice).toBeVisible();
    await notice.getByRole('button', { name: '重试', exact: true }).focus();
    await expect(notice.getByRole('button', { name: '重试', exact: true })).toBeFocused();
    const modalRetryCount = (await calls()).length;
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await calls()).length).toBe(modalRetryCount + 1);
    await expect(page.getByRole('dialog')).toBeVisible();
    await closeSettings();
    await capture('error-1440');
    const count = (await calls()).length;
    await notice.getByRole('button', { name: '重试', exact: true }).click();
    await expect.poll(async () => (await calls()).length).toBe(count + 1);
    await expect(notice).toHaveAttribute('data-tone', 'error');
    assert.deepEqual((await calls()).at(-1), { theme: 'dark' });
    await app.evaluate(() => { global.notificationFail = false; });
    await notice.getByRole('button', { name: '重试', exact: true }).click();
    await expect(notice).toHaveAttribute('data-tone', 'success');
    await expect(notice).toHaveCount(0, { timeout: 3000 });
    // A different successful setting also replaces a previous settings error.
    await app.evaluate(() => { global.notificationFail = true; });
    await openSettings(); await toggle.click();
    await expect(notice).toHaveAttribute('data-tone', 'error');
    await app.evaluate(() => { global.notificationFail = false; });
    await selectOption(page, '外观主题', 'light');
    await expect(notice).toHaveAttribute('data-tone', 'success');
    await closeSettings();
    await expect(notice).toHaveCount(0, { timeout: 3000 });
    // Real rendered light/dark desktop/mobile views, wrapping and unchanged canvas geometry.
    for (const width of [1440, 390]) {
      await win.evaluate((w, value) => { w.restore(); w.setMinimumSize(320, 500); w.setContentSize(value, 900); }, width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      for (const theme of ['dark', 'light']) {
        const geometry = await layout();
        await openSettings(); await selectOption(page, '外观主题', theme); await closeSettings();
        await expect(notice).toBeVisible();
        assert.deepEqual(await layout(), geometry, `${theme}-${width}: toast must not move the workspace`);
        const result = await notice.evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); const overlaps=[...document.querySelectorAll('.topology-zoom,.topology-map,.lagoon-rail')].filter(e=>e.getClientRects().length).filter(e=>{const q=e.getBoundingClientRect();return Math.min(r.right,q.right)>Math.max(r.left,q.left)&&Math.min(r.bottom,q.bottom)>Math.max(r.top,q.top)}).map(e=>e.className); return { position: s.position, x: r.x, right: r.right, width: innerWidth, scrollWidth: document.documentElement.scrollWidth, inMain: Boolean(el.closest('main')), background: s.backgroundColor, color: s.color, overlaps }; });
        assert.deepEqual(result.overlaps, [], 'toast clears zoom, minimap and navigation');
        assert.equal(result.position, 'fixed'); assert.equal(result.inMain, false);
        assert(result.x >= 0 && result.right <= width); assert.equal(result.scrollWidth, width);
        metrics.push({ name: `${theme}-${width}`, ...result });
        await capture(`${theme}-${width}`);
        await expect(notice).toHaveCount(0, { timeout: 3000 });
      }
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openSettings(); await selectOption(page, '外观主题', 'dark'); await closeSettings();
    await expect(notice).toBeVisible();
    assert.equal(await notice.evaluate(el => getComputedStyle(el).animationName), 'none');
    await button('关闭通知').focus(); await page.keyboard.press('Enter');
    await expect(notice).toHaveCount(0);
    // Narrow failure wraps and remains available until explicit dismissal.
    await app.evaluate(() => { global.notificationFail = true; });
    await openSettings(); await selectOption(page, '外观主题', 'light'); await closeSettings();
    await expect(notice).toHaveAttribute('data-tone', 'error');
    assert(await notice.evaluate(el => el.scrollWidth <= el.clientWidth));
    await capture('error-390');
    await notice.getByRole('button', { name: '重试', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(notice).toHaveAttribute('data-tone', 'error');
    assert.deepEqual(await board(), originalBoard, 'settings notifications and retries preserve board data');
    assert.deepEqual(errors, []);
    console.log('PASS notification: fixed geometry, silent canvas persistence, repeated success timer, persistent failure, patch-only retry, error replacement, 1440/390 light/dark, keyboard dismissal/retry, reduced motion');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png'), scale: 'css', animations: 'disabled' }).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(shots, 'metrics.json'), JSON.stringify(metrics, null, 2));
    if (app) {
      const exited = new Promise(resolve => app.process().once('exit', resolve));
      await app.evaluate(({ app }) => { setTimeout(() => app.exit(0), 20); });
      await exited;
    }
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
