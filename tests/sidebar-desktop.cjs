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
  const shots = path.resolve('docs/screenshots/sidebar-redesign', process.env.ARASN_SIDEBAR_PASS || 'icon-final');
  await fs.mkdir(shots, { recursive: true });
  let app, page;
  const errors = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page);
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    await page.getByRole('button', { name: '打开工作区', exact: true }).click();
    await win.evaluate(w => w.setContentSize(1440, 900));
    const rail = page.locator('aside.sidebar');
    const button = name => rail.getByRole('button', { name, exact: true, includeHidden: true });
    const icon = item => item.locator('.nav-item-icon');
    const check = async name => {
      const item = button(name);
      await expect(rail.locator('.nav-item[data-selected]')).toHaveCount(1);
      await expect(item).toHaveAttribute('data-selected', 'true');
      await expect.poll(() => icon(item).evaluate(el => getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
      const s = await item.evaluate(el => {
        const b = getComputedStyle(el), i = getComputedStyle(el.querySelector('.nav-item-icon'));
        return { shadow: b.boxShadow, bg: b.backgroundColor, after: getComputedStyle(el, '::after').content,
          weight: b.fontWeight, iconShadow: i.boxShadow, radius: i.borderRadius, width: i.width, duration: i.transitionDuration };
      });
      assert.equal(s.shadow, 'none');
      assert.equal(s.bg, 'rgba(0, 0, 0, 0)');
      assert.equal(s.after, 'none');
      assert.equal(s.weight, '500');
      assert.notEqual(s.iconShadow, 'none');
      assert.equal(s.radius, '50%');
      assert.equal(s.width, '30px');
      assert(s.duration.split(',').every(v => v.trim() === '0.2s'));
      for (const other of await rail.locator('.nav-item:not([data-selected])').all()) {
        await expect.poll(() => icon(other).evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
      }
    };
    await expect(rail.getByRole('group', { name: '主导航' }).getByRole('button')).toHaveCount(4);
    await expect(rail.getByRole('group', { name: '协作' }).getByRole('button')).toHaveCount(1);
    for (const theme of ['light', 'dark']) {
      await button('设置与快捷键').click();
      await selectOption(page, '外观主题', theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await button('我的随手页').click();
      await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
      await page.mouse.move(700, 20);
      await check('我的随手页');
      await page.screenshot({ path: path.join(shots, `desktop-${theme}.png`), animations: 'disabled', scale: 'css' });
      await rail.screenshot({ path: path.join(shots, `nav-${theme}.png`), animations: 'disabled' });
      const bounds = await rail.boundingBox();
      await page.screenshot({ path: path.join(shots, `nav-detail-${theme}.png`),
        clip: { x: bounds.x, y: bounds.y + 80, width: bounds.width, height: 340 }, animations: 'disabled', scale: 'css' });
      await button('打开关系画布').hover();
      await expect.poll(() => icon(button('打开关系画布')).evaluate(e => getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      assert.equal(await icon(button('打开关系画布')).evaluate(e => getComputedStyle(e).boxShadow), 'none');
      await rail.screenshot({ path: path.join(shots, `hover-${theme}.png`), animations: 'disabled' });
      await button('我的随手页').focus();
      await page.keyboard.press('Tab');
      await expect(button('打开关系画布')).toBeFocused();
      assert.equal(await button('打开关系画布').evaluate(el => el.matches(':focus-visible')), true);
      assert.equal(await button('打开关系画布').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await page.keyboard.press('Enter');
      await check('打开关系画布');
      await rail.screenshot({ path: path.join(shots, `focus-${theme}.png`), animations: 'disabled' });
      for (const name of ['便笺列表', '文件']) {
        await button(name).click();
        await check(name);
        await rail.screenshot({ path: path.join(shots, `${name === '文件' ? 'files' : 'notes'}-${theme}.png`), animations: 'disabled' });
      }
      await page.getByRole('button', { name: '返回工作区', exact: true }).click();
      const previous = await rail.locator('.nav-item[data-selected]').getAttribute('aria-label');
      await button('设备互传').click();
      await expect(page.getByRole('dialog', { name: '设备互传', exact: true })).toBeVisible();
      // Modal makes the underlying rail inert; inspect DOM selection without role lookup.
      await expect(rail.locator('.nav-item[data-selected]')).toHaveCount(1);
      await expect(rail.locator('[aria-label="设备互传"]')).toHaveAttribute('data-selected', 'true');
      await check('设备互传');
      await page.screenshot({ path: path.join(shots, `devices-${theme}.png`), animations: 'disabled', scale: 'css' });
      await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await check(previous);
    }
    await button('我的随手页').click();
    for (const [width, height] of [[820, 700], [390, 720]]) {
      await win.evaluate((w, size) => { w.setMinimumSize(350, 460); w.setContentSize(...size); }, [width, height]);
      await expect(button('打开关系画布')).toBeVisible();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await expect(page.locator('.adaptive-shell')).toHaveAttribute('data-nav-mode', 'collapsed');
      const boxes = await rail.locator('.nav-item').evaluateAll(items => items.map(e => {
        const r = e.getBoundingClientRect(), i = e.querySelector('.nav-item-icon').getBoundingClientRect();
        const l = e.querySelector('.nav-item-label');
        return { x: r.x, right: r.right, width: r.width, icon: i.width, label: getComputedStyle(l).display };
      }));
      assert(boxes.every(b => b.width >= 30 && b.x >= 0 && b.right <= width && b.icon > 28 && b.label === 'none'), JSON.stringify({ width, boxes }));
      await page.screenshot({ path: path.join(shots, `workspace-${width}.png`), animations: 'disabled', scale: 'css' });
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button('打开关系画布').click();
    assert(await icon(button('打开关系画布')).evaluate(el => getComputedStyle(el).transitionDuration.split(',').every(v => parseFloat(v) === 0)));
    assert.equal(await icon(button('打开关系画布')).evaluate(el => getComputedStyle(el).transform), 'none');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await icon(button('打开关系画布')).evaluate(el => getComputedStyle(el).boxShadow), 'none');
    assert.deepEqual(errors, []);
    console.log('PASS sidebar: icon-only circular shadows, five entries, unique selection/dialog restore, fixed weight, 200ms, hover, keyboard, light/dark, 1440/820/390 with responsive collapsed nav, reduced motion, forced colors');
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
