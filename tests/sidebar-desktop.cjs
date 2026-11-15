const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-sidebar-'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const shots = path.resolve('docs/screenshots/sidebar-redesign', process.env.ARASN_SIDEBAR_PASS || 'final');
  await fs.mkdir(shots, { recursive: true });
  let app, page;
  const errors = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.show(); w.focus(); });
    await page.getByRole('button', { name: '打开工作区', exact: true }).click();
    await win.evaluate(w => w.setContentSize(1440, 900));
    const rail = page.getByRole('complementary', { name: '侧边栏' });
    const button = name => rail.getByRole('button', { name, exact: true });
    await button('我的随手页').click();
    await expect(rail.getByRole('group', { name: '主导航' }).getByRole('button')).toHaveCount(4);
    await expect(rail.getByRole('group', { name: '协作' }).getByRole('button')).toHaveCount(1);
    await expect(button('切换主题')).toHaveCount(0);
    await expect(button('我的随手页')).toHaveAttribute('aria-current', 'page');
    await page.mouse.move(700, 20);
    await page.screenshot({ path: path.join(shots, 'desktop-light.png'), animations: 'disabled', scale: 'css' });
    await rail.screenshot({ path: path.join(shots, 'sidebar-light.png'), animations: 'disabled' });
    const selected = await button('我的随手页').evaluate(e => getComputedStyle(e).backgroundColor);
    await button('打开关系画布').hover();
    await expect.poll(() => button('打开关系画布').evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe(selected);
    await rail.screenshot({ path: path.join(shots, 'sidebar-hover.png'), animations: 'disabled' });
    const hover = await button('打开关系画布').evaluate(e => getComputedStyle(e).backgroundColor);
    assert.notEqual(selected, hover);
    await button('打开关系画布').focus();
    await page.keyboard.press('Enter');
    await expect(button('打开关系画布')).toHaveAttribute('aria-current', 'page');
    await page.screenshot({ path: path.join(shots, 'relations-focus.png'), animations: 'disabled', scale: 'css' });
    await button('便笺列表').click();
    await expect(button('便笺列表')).toHaveAttribute('aria-current', 'page');
    await button('文件').click();
    await expect(page.locator('.sidebar [aria-label="文件"]')).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: '返回工作区', exact: true }).click();
    await button('设备互传').click();
    await expect(page.getByRole('dialog', { name: '设备互传', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await button('设置与快捷键').click();
    await selectOption(page, '外观主题', 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await button('我的随手页').click();
    await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
    await page.mouse.move(700, 20);
    await page.screenshot({ path: path.join(shots, 'desktop-dark.png'), animations: 'disabled', scale: 'css' });
    await button('设置与快捷键').click();
    await selectOption(page, '外观主题', 'light');
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
    await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
    for (const [width, height] of [[820, 700], [390, 720]]) {
      await win.evaluate((w, size) => { w.setMinimumSize(350, 460); w.setContentSize(...size); }, [width, height]);
      await expect(button('打开关系画布')).toBeVisible();
      const bounds = await rail.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      const boxes = await rail.getByRole('button').evaluateAll(items => items.map(e => { const r = e.getBoundingClientRect(); return { x: r.x, right: r.right, width: r.width }; }));
      assert(boxes.every(b => b.width >= 30 && b.x >= 0 && b.right <= width));
      await page.screenshot({ path: path.join(shots, `workspace-${width}.png`), animations: 'disabled', scale: 'css' });
    }
    await button('设置与快捷键').click();
    await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('PASS sidebar grouping, routes, keyboard activation, distinct hover/selected, files/devices/settings, theme control, 1440/820/390px, no page errors');
  } catch (error) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {});
    throw error;
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    await fs.rm(target, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
