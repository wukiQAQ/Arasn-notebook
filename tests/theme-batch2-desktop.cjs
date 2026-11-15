const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-theme-batch2-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/theme-batch2/pass1');
  await fs.mkdir(shots, { recursive: true });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark', shortcut: 'Control+Alt+F23' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, patched = false;
  const errors = [], checks = [];
  const launch = async () => {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-input:enabled').waitFor();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const themeIs = async theme => {
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), theme);
  };
  const settings = async () => {
    await button('设置与快捷键').last().click();
    await expect(page.getByRole('region', { name: '外观', exact: true })).toBeVisible();
  };
  const choose = value => selectOption(page, '外观主题', value);
  const capture = async (name, width, height) => {
    const win = await app.browserWindow(page);
    await win.evaluate((w, size) => { w.setMinimumSize(320, 400); w.setContentSize(...size); }, [width, height]);
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const geometry = await page.evaluate(() => {
      const popup = document.querySelector('.xigra-settings');
      const r = popup?.getBoundingClientRect();
      return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth,
        popupFits: !r || (r.x >= 0 && r.y >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1),
        overflowElements: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1).slice(0, 12).map(el => ({ tag: el.tagName, class: el.className, right: el.getBoundingClientRect().right, visibility: getComputedStyle(el).visibility })) };
    });
    checks.push({ name, ...geometry });
    await page.screenshot({ path: path.join(shots, name + '.png'), scale: 'css', animations: 'disabled' });
    assert(!geometry.overflow && geometry.popupFits, JSON.stringify(geometry));
  };
  try {
    await launch(); await themeIs('dark');
    assert.equal((await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor())).toLowerCase(), '#1b1e24');
    // Pause React during a reload: bootstrap must independently correct a stale browser cache.
    await page.evaluate(() => localStorage.setItem('arasn-theme', 'light'));
    let releaseModule;
    const gate = new Promise(resolve => { releaseModule = resolve; });
    let moduleRequested;
    const paused = new Promise(resolve => { moduleRequested = resolve; });
    await page.route('**/assets/index-*.js', async route => { moduleRequested(); await gate; await route.continue(); });
    const reloaded = page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await paused;
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
      await expect(page.locator('#root')).toBeEmpty();
      assert.equal(await page.evaluate(() => window.desktop.initialTheme), 'dark');
    } finally { releaseModule(); }
    await reloaded; await page.unroute('**/assets/index-*.js');
    await page.locator('.quick-input:enabled').waitFor();
    await page.locator('.quick-input').fill('主题一致性验收\n切换外观时保留原始正文。');
    await expect(page.locator('.save-state')).toHaveText('已保存');
    await button('打开工作区').click();
    await settings();
    await capture('appearance-dark-1440', 1440, 900);
    await choose('light'); await themeIs('light');
    await page.emulateMedia({ colorScheme: 'dark' }); await themeIs('light');
    await choose('system');
    await page.emulateMedia({ colorScheme: 'light' }); await themeIs('light');
    await page.emulateMedia({ colorScheme: 'dark' }); await themeIs('dark');
    await choose('light'); await themeIs('light');
    for (const [width, height] of [[1440, 900], [820, 650], [390, 700]]) {
      await capture(`appearance-light-${width}`, width, height);
    }
    await button('关闭弹窗').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeHidden();
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    await capture('before-pages-light-1440', 1440, 900);
    for (const name of ['我的随手页', '便笺列表', '文件', '打开关系画布']) {
      await button(name).click(); await themeIs('light');
      checks.push({ page: name, theme: 'light' });
      await capture(`page-light-${checks.length}`, 1440, 900);
    }
    await button('备份并启用关系画布').click();
    await expect(button('新建节点')).toBeVisible();
    const original = await board();
    await settings();
    await app.evaluate(({ ipcMain }) => {
      global.themeSettingsHandler = ipcMain._invokeHandlers.get('app:settings');
      ipcMain.removeHandler('app:settings');
      ipcMain.handle('app:settings', () => { throw new Error('主题保存失败验收'); });
    }); patched = true;
    await choose('dark');
    await expect(page.getByRole('alert')).toContainText('主题保存失败验收');
    await themeIs('light');
    await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('app:settings'); ipcMain.handle('app:settings', global.themeSettingsHandler); delete global.themeSettingsHandler; }); patched = false;
    await choose('dark'); await themeIs('dark');
    await capture('appearance-dark-390', 390, 700);
    await button('关闭弹窗').focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeHidden();
    await capture('relation-dark-1440', 1440, 900);
    for (const name of ['我的随手页', '便笺列表', '文件', '打开关系画布']) {
      await button(name).click(); await themeIs('dark');
      checks.push({ page: name, theme: 'dark' });
    }
    assert.deepEqual(await board(), original, 'theme changes preserve the whole board');
    await capture('workspace-dark-390', 390, 700);
    await button('切换到便签区').click(); await themeIs('dark');
    await capture('compact-dark-500', 500, 540);
    await expect(page.locator('.quick-input')).toHaveValue('主题一致性验收\n切换外观时保留原始正文。');
    await app.close(); app = null;
    await launch(); await themeIs('dark');
    assert.equal(await page.evaluate(() => window.desktop.initialTheme), 'dark');
    await button('主题一致性验收').click();
    await expect(page.locator('.quick-input')).toHaveValue('主题一致性验收\n切换外观时保留原始正文。');
    assert.deepEqual(errors, []);
    console.log('PASS theme: pre-React bootstrap, stale cache, native background, modes/system changes, settings failure, four pages, compact, restart, board preservation');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png'), scale: 'css' }).catch(() => {});
    throw error;
  } finally {
    await fs.writeFile(path.join(shots, 'verification.json'), JSON.stringify({ checks, errors }, null, 2));
    if (patched && app) await app.evaluate(({ ipcMain }) => { ipcMain.removeHandler('app:settings'); ipcMain.handle('app:settings', global.themeSettingsHandler); delete global.themeSettingsHandler; }).catch(() => {});
    if (app) await app.close();
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    assert(path.basename(resolved).startsWith('arasn-theme-batch2-'));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
