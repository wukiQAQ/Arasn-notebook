const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { selectOption } = require('./helpers/select-option.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

const dpr = process.argv.includes('--high-dpi') ? 1.5 : 1;
const out = path.resolve('docs/screenshots/appearance-center', dpr === 1 ? 'standard' : 'scale-150');

function contrast(first, second) {
  const luminance = color => color.match(/[\da-f]{2}/gi).map(channel => {
    const value = parseInt(channel, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  }).reduce((total, value, index) => total + value * [0.2126, 0.7152, 0.0722][index], 0);
  const a = luminance(first); const b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}

(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-appearance-'));
  await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(dir, 'settings.json'), JSON.stringify({
    shortcut: 'Control+Alt+F22', theme: 'light', startMinimized: false, alwaysOnTop: false,
  }));
  const env = { ...process.env, ARASN_DATA_DIR: dir, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const errors = [];
  let app, page, win;
  const b = name => page.getByRole('button', { name, exact: true });
  const modal = () => page.locator('.xigra-settings');
  const nav = () => page.getByRole('navigation', { name: '设置分类' });
  const scroll = () => page.locator('.settings-detail-scroll');
  const info = () => page.evaluate(() => window.desktop.info());
  const token = name => page.evaluate(key => getComputedStyle(document.documentElement).getPropertyValue(key).trim(), name);
  const saved = () => expect(page.locator('.appearance-actions').getByRole('status')).toHaveText('更改实时生效并自动保存');
  const geometry = async locator => Object.fromEntries(Object.entries(await locator.boundingBox())
    .map(([key, value]) => [key, Math.round(value * 4) / 4]));
  const category = name => nav().getByRole('button', { name: new RegExp('^' + name) }).click();
  const shot = name => page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled', scale: 'css' });
  const setHex = async (label, value) => {
    const input = page.getByRole('textbox', { name: label + ' HEX' });
    await input.fill(value);
    await input.press('Enter');
  };
  async function size(requestedWidth, requestedHeight) {
    const size = await app.evaluate(({ BrowserWindow, screen }, [width, height]) => {
      const w = BrowserWindow.getAllWindows()[0];
      const area = screen.getDisplayMatching(w.getBounds()).workAreaSize;
      return [Math.min(width, area.width - 24), Math.min(height, area.height - 24)];
    }, [requestedWidth, requestedHeight]);
    await expect.poll(async () => {
      const actual = await page.evaluate(() => [innerWidth, innerHeight]);
      if (actual.some((value, index) => value !== size[index])) {
        await win.evaluate((w, size) => { w.setMinimumSize(500, 540); w.setContentSize(...size); }, size);
      }
      return actual;
    }).toEqual(size);
  }
  async function open() {
    app = await electron.launch({ args: ['.', `--force-device-scale-factor=${dpr}`], env });
    page = await app.firstWindow();
    page.setDefaultTimeout(7500);
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('.quick-title:enabled').waitFor();
    win = await app.browserWindow(page);
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await page.evaluate(() => window.desktop.layout(true));
    await size(1440, 900);
    await b('设置与快捷键').last().click();
    await expect(modal()).toBeVisible();
    await expect(b('浅色')).toBeVisible();
    await modal().evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  }
  try {
    await open();
    const client = await page.evaluate(() => [innerWidth, innerHeight, devicePixelRatio]);
    assert.equal(client[2], dpr);
    const before = await info();
    await assert.rejects(page.evaluate(() => window.desktop.settings({ appearance: { preset: 'unknown' } })), /外观设置无效/);
    const frame = await win.evaluate(w => ({ id: w.id, bounds: w.getBounds() }));
    const rect = await geometry(modal());
    const rail = await geometry(nav());
    const footer = await geometry(page.locator('.settings-detail-footer'));
    assert.equal(rect.width, Math.min(1080, client[0] - 40));
    assert.equal(rect.height, Math.min(740, client[1] - 80));
    assert(rect.x >= 0 && rect.y >= 48 && rect.x + rect.width <= client[0] && rect.y + rect.height <= client[1]);
    for (const name of ['快捷键与触发', '窗口与启动', '数据备份', '外观']) {
      await category(name);
      await expect(page.locator('.settings-category-title')).toHaveText(name);
      assert.deepEqual(await geometry(modal()), rect);
      assert.deepEqual(await geometry(nav()), rail);
      assert.deepEqual(await win.evaluate(w => ({ id: w.id, bounds: w.getBounds() })), frame);
      if (name === '数据备份') {
        await expect(page.locator('.settings-detail-footer').getByRole('button', { name: '导出完整备份' })).toBeVisible();
        assert.deepEqual(await geometry(page.locator('.settings-detail-footer')), footer);
      }
      if (name === '快捷键与触发') {
        await scroll().evaluate(el => { el.scrollTop = 180; });
        assert(await scroll().evaluate(el => el.scrollTop > 0));
        await shot('shortcuts-scroll');
      }
    }
    await category('快捷键与触发');
    assert(await scroll().evaluate(el => el.scrollTop > 0));
    await category('外观');
    await shot('appearance-light');
    await selectOption(page, '外观主题', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await selectOption(page, '外观主题', 'system');
    assert.equal(await app.evaluate(({ nativeTheme }) => nativeTheme.themeSource), 'system');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await selectOption(page, '外观主题', 'dark');
    await page.emulateMedia({ colorScheme: null });
    for (const [name, expected] of [['石墨', '#202221'], ['深海', '#102330'], ['极简浅色', '#25231F'], ['深海', '#102330']]) {
      await b(name).click();
      await expect(b(name)).toHaveAttribute('aria-pressed', 'true');
      assert.equal(await token('--ui-surface-app'), expected);
    }
    await shot('appearance-ocean');
    const semantic = await token('--xigra-success');
    await b('湖蓝').click();
    await expect(b('湖蓝')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('选择强调色', { exact: true }).fill('#a6e3ff');
    await expect(page.getByRole('textbox', { name: '强调色 HEX' })).toHaveValue('#A6E3FF');
    await setHex('强调色', '#E3D287');
    await saved();
    assert.equal(await token('--ui-action'), '#E3D287');
    assert.equal(await token('--xigra-success'), semantic);
    assert(contrast(await token('--ui-action'), await token('--ui-on-action')) >= 4.5);
    assert.equal((await info()).appearance.accent, '#E3D287');
    await setHex('强调色', '#NOPE');
    await expect(page.getByRole('textbox', { name: '强调色 HEX' })).toHaveAttribute('aria-invalid', 'true');
    await setHex('强调色', '#E3D287');
    await selectOption(page, '界面字体', 'Arial');
    await selectOption(page, '字体尺度', 'comfortable');
    await expect(page.locator('html')).toHaveAttribute('data-ui-scale', 'comfortable');
    assert.match(await page.locator('.appearance-font-preview').evaluate(el => getComputedStyle(el).fontFamily), /^Arial[,"]/);
    const panel = page.locator('.appearance-advanced');
    await panel.locator('summary').click();
    await setHex('背景色', '#101820');
    await setHex('前景色', '#101820');
    await expect(panel.getByRole('status')).toContainText('已自动调整实际文字色');
    for (const surface of ['--ui-surface-app', '--ui-surface-card', '--ui-surface-floating', '--ui-surface-canvas']) {
      assert(contrast(await token(surface), await token('--ui-text-primary')) >= 4.5);
    }
    await b('恢复默认前景色').click();
    await expect(panel.getByRole('status')).toBeHidden();
    await setHex('前景色', '#101820');
    await saved();
    assert.deepEqual(await geometry(modal()), rect);
    assert.deepEqual(await win.evaluate(w => ({ id: w.id, bounds: w.getBounds() })), frame);
    await panel.getByRole('status').scrollIntoViewIfNeeded();
    await shot('appearance-advanced-dark');
    await scroll().evaluate(el => { el.scrollTop = 0; });
    if (process.platform === 'win32') await captureNativeWindow(app, page, path.join(out, 'appearance-windows.png'));
    const persisted = (await info()).appearance;
    await app.close(); app = undefined;
    await open();
    await expect.poll(async () => (await info()).appearance).toEqual(persisted);
    await expect(b('深海')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('textbox', { name: '强调色 HEX' })).toHaveValue('#E3D287');
    const beforeReset = await info();
    await b('恢复默认外观').click();
    await saved();
    const reset = await info();
    assert.deepEqual(reset.appearance, { preset: 'arasn', accent: null, background: null, foreground: null, font: 'system', scale: 'standard' });
    assert.equal(reset.theme, 'system');
    for (const key of ['triggers', 'alwaysOnTop', 'startMinimized', 'startHidden', 'openAtLogin']) {
      assert.deepEqual(reset[key], before[key], key);
    }
    for (const key of ['topologyViewport', 'freeViewport', 'sidebar', 'canvasOptions']) assert.deepEqual(reset[key], beforeReset[key], key);
    await size(560, 590);
    await category('外观');
    const narrow = await geometry(modal());
    assert(narrow.x >= 0 && narrow.y >= 48);
    assert(await scroll().evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await shot('appearance-narrow');
    await b('设置分类').click();
    await category('数据备份');
    assert.deepEqual(await geometry(modal()), narrow);
    assert.deepEqual(errors, []);
    console.log(`PASS Windows Electron appearance center, DPR ${dpr}, viewport ${client[0]}×${client[1]}, panel ${rect.width}×${rect.height}`);
  } finally {
    await app?.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
