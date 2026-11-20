const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
const { selectOption } = require('./helpers/select-option.cjs');

async function verify(scale, theme) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-global-ui-'));
  const shots = path.resolve(process.env.ARASN_UI_SHOTS || 'docs/screenshots/global-ui', `${scale * 100}-${theme}`);
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    await fs.mkdir(shots, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme, sidebar: { mode: 'full', width: 200 } }));
    app = await electron.launch({ args: ['.', `--force-device-scale-factor=${scale}`], env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(6000);
    await win.evaluate(w => { w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await expect.poll(() => page.evaluate(() => devicePixelRatio)).toBe(scale);
    const button = name => page.getByRole('button', { name, exact: true });
    const sidebar = page.locator('#workbench-sidebar');
    const nav = name => sidebar.getByRole('button', { name, exact: true });
    const settle = () => page.evaluate(() => Promise.race([
      Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)),
      new Promise(resolve => setTimeout(resolve, 400)),
    ]));
    const shot = async (name, native = false) => {
      await settle();
      const file = path.join(shots, `${name}.png`);
      if (native) await captureNativeWindow(app, page, file);
      else await page.screenshot({ path: file, animations: 'disabled', scale: 'device' });
    };
    const withinWindow = async locator => {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      const [width, height] = await page.evaluate(() => [innerWidth, innerHeight]);
      assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= width + 1 && box.y + box.height <= height + 1, JSON.stringify(box));
    };
    const verifyClose = async (name, capture) => {
      const close = button(name);
      await withinWindow(close);
      await settle();
      const face = close.locator('.arasn-icon-action-face');
      const geometry = await close.boundingBox();
      const faceGeometry = await face.boundingBox();
      assert.equal(faceGeometry.width, 28);
      assert.ok(geometry.width >= 32 && geometry.height >= 32);
      await page.mouse.move(4, 4);
      await expect(face).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await close.hover();
      await expect(face).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(close).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      assert.deepEqual(await close.boundingBox(), geometry);
      if (capture) {
        await shot('device-hover');
        const hover = await face.evaluate(el => getComputedStyle(el).backgroundColor);
        await page.mouse.down();
        await expect(face).not.toHaveCSS('background-color', hover);
        await shot('device-pressed');
        await page.mouse.move(4, 4);
        await page.mouse.up();
      }
      await page.mouse.move(4, 4);
      await page.keyboard.press('Tab');
      await close.focus();
      await expect(close).toHaveCSS('outline-style', 'solid');
      await expect(close).toHaveCSS('box-shadow', 'none');
      if (capture) await shot('device-keyboard-focus');
    };

    await expect(page.getByRole('textbox', { name: '便签标题', exact: true })).toBeVisible();
    await app.evaluate(({ BrowserWindow, screen }) => {
      const w = BrowserWindow.getAllWindows()[0];
      const area = screen.getDisplayMatching(w.getBounds()).workAreaSize;
      w.setSize(Math.min(1280, area.width - 24), Math.min(820, area.height - 24));
      w.center();
    });
    await nav('设置与快捷键').click();
    await withinWindow(page.locator('.xigra-settings'));
    const categories = page.getByRole('navigation', { name: '设置分类' });
    for (const label of ['外观', '快捷键与触发', '窗口与启动', '数据备份', '外观']) {
      if (!(await categories.isVisible())) await button('设置分类').click();
      await categories.getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(page.locator('.settings-category-title')).toHaveText(label);
      if (label === '窗口与启动') {
        const checked = page.getByRole('checkbox', { name: '开机启动时隐藏到托盘', exact: true });
        await expect(checked).toBeChecked();
        await checked.hover();
        await settle();
        const colors = await checked.evaluate(el => {
          const sample = document.createElement('span');
          sample.style.backgroundColor = 'var(--ui-action-hover)';
          el.after(sample);
          const colors = [getComputedStyle(el).backgroundColor, getComputedStyle(sample).backgroundColor];
          sample.remove();
          return colors;
        });
        assert.equal(colors[0], colors[1]);
      }
    }
    await button(theme === 'light' ? '深色' : '浅色').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme === 'light' ? 'dark' : 'light');
    await button(theme === 'light' ? '浅色' : '深色').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const accent = page.getByRole('textbox', { name: '强调色 HEX' });
    const actionColor = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-action').trim());
    const originalActionColor = await actionColor();
    await accent.fill('#A34577');
    await accent.press('Enter');
    await expect.poll(() => page.evaluate(() => window.desktop.info().then(info => info.appearance.accent))).toBe('#A34577');
    await expect.poll(actionColor).not.toBe(originalActionColor);
    await shot('settings');
    await shot('settings-native', true);
    await button('关闭弹窗').click();
    await nav('设备互传').click();
    await verifyClose('关闭弹窗', true);
    await button('打开便签互传').click();
    await expect(page.locator('.xigra-lan-dialog')).toBeVisible();
    await verifyClose('关闭便签互传');
    await button('关闭便签互传').press('Enter');
    await nav('设备互传').click();
    await button('打开白板共享').click();
    await expect(page.locator('[data-share-state]')).toBeVisible();
    await shot('whiteboard-sharing');
    await button('关闭弹窗').click();

    await nav('我的随手页').click();
    await button('自由绘图').click();
    await button('自由绘图').click();
    await withinWindow(page.locator('.tool-settings-popup'));
    await verifyClose('关闭工具设置');
    await expect(button('保存为预设')).toBeDisabled();
    await button('保存为预设').scrollIntoViewIfNeeded();
    await shot('brush-disabled');
    await page.locator('.tool-settings-popup').evaluate(el => { el.scrollTop = 0; });
    await shot('brush');
    await button('关闭工具设置').click();
    const canvas = await page.locator('.paper-scroll').boundingBox();
    const x = canvas.x + canvas.width * .6;
    const y = canvas.y + canvas.height * .45;
    const drag = async (from, to) => {
      await page.mouse.move(...from);
      await page.mouse.down();
      await page.mouse.move(...to, { steps: 18 });
      await page.mouse.up();
    };
    await drag([x - 90, y], [x + 90, y]);
    const strokes = page.getByTestId('stroke');
    await expect(strokes).toHaveCount(1);
    await button('橡皮擦').click();
    await button('橡皮擦').click();
    await withinWindow(page.locator('.tool-settings-popup'));
    await selectOption(page, '擦除模式', 'partial');
    await expect(page.getByRole('combobox', { name: '擦除模式' })).toHaveText('局部擦除');
    await page.getByRole('slider', { name: '橡皮擦大小' }).press('ArrowRight');
    await shot('eraser');
    await button('关闭工具设置').click();
    await drag([x, y - 48], [x, y + 48]);
    await expect(strokes).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(strokes).toHaveCount(1);

    await nav('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    await expect(button('新建节点').or(upgrade)).toBeVisible();
    if (await upgrade.isVisible()) await upgrade.click();
    await button('新建节点').click();
    await page.getByRole('menuitem', { name: '便签', exact: true }).click();
    await withinWindow(page.locator('.topology-inspector'));
    await shot('relation');
    await button('关闭详情').click();
    await nav('文件').click();
    const fileLayout = page.locator('.file-layout');
    await expect(fileLayout.locator('[aria-pressed="true"]')).toHaveCount(1);
    const disabled = page.locator('.file-pagination button:disabled').first();
    await expect(disabled).toBeDisabled();
    const disabledStyle = await disabled.evaluate(element => getComputedStyle(element).backgroundColor);
    await disabled.hover({ force: true });
    await expect(disabled).toHaveCSS('background-color', disabledStyle);
    await shot('file-selected-disabled');
    await page.keyboard.press('Control+k');
    await expect(page.locator('.command-popup')).toBeVisible();
    await shot('search');
    await page.keyboard.press('Escape');

    const dismissNotice = button('关闭通知');
    if (await dismissNotice.isVisible()) await dismissNotice.click();
    await win.evaluate(w => { w.setSize(520, 420); w.center(); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThanOrEqual(524);
    await nav('设置与快捷键').click();
    await withinWindow(page.locator('.xigra-settings'));
    await categories.getByRole('button', { name: /^外观/ }).click();
    await withinWindow(button('设置分类'));
    await shot('settings-narrow');
    await button('关闭弹窗').click();

    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    const compact = button('紧凑导航');
    if (await compact.isVisible()) await compact.click();
    await withinWindow(page.locator('.file-station'));
    await shot('maximized', true);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-motion-overlay'))), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS Windows Electron ${scale * 100}% ${theme}: controls, four settings categories, devices, tools, relation, files, search, maximize`);
  } catch (error) {
    throw new Error(`Windows Electron ${scale * 100}% ${theme}`, { cause: error });
  } finally {
    if (app) await app.close();
    const resolved = await fs.realpath(data);
    assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

const scenarios = [[1, 'light'], [1.25, 'dark'], [1.5, 'light']];
const scale = Number(process.argv[2]);
(async () => {
  for (const [factor, theme] of scenarios.filter(([factor]) => !scale || scale === factor)) await verify(factor, theme);
})().catch(error => { console.error(error); process.exitCode = 1; });
