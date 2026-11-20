const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-toolbar-'));
  const output = path.resolve('docs/screenshots/toolbar-system', process.env.ARASN_TOOLBAR_PASS || 'pass1');
  await fs.mkdir(output, { recursive: true });
  const id = randomUUID();
  createStore(path.join(data, 'board.json')).apply({ id, expected: 0, opId: randomUUID(), value: { type: 'text', text: '工具栏交互验收\n保留对象与自动保存。', x: 650, y: 350, color: '#4668c6' } });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const errors = [], checks = [];
  try {
    app = await electron.launch({ args: ['.'], env });
    const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page);
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    const b = name => page.getByRole('button', { name, exact: true });
    const nav = name => page.locator('.sidebar').getByRole('button', { name, exact: true });
    const shot = name => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled', scale: 'css' });
    const panel = page.locator('.tool-settings-popup');
    const checkControls = async area => {
      const bad = await page.locator('button[data-ui-button]:visible:not(.color)').evaluateAll(els => els.flatMap(e => {
        if (e.closest('.quick-floating-footer')) return []; // Status capsule controls are a separate compact role.
        const s = getComputedStyle(e), h = e.getBoundingClientRect().height;
        return h !== 44 || s.fontSize !== '15px' || s.fontWeight !== '500' || s.borderRadius !== '10px' ? [{ label: e.getAttribute('aria-label') || e.textContent, h, font: s.fontSize, weight: s.fontWeight, radius: s.borderRadius }] : [];
      }));
      assert.deepEqual(bad, [], area);
    };
    await b('切换到工作区').click(); await nav('我的随手页').click();
    await win.evaluate(w => w.setContentSize(1440, 900));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    await expect(page.locator('.adaptive-shell')).toHaveAttribute('data-nav-mode', 'full');
    await expect(page.locator('.free-workspace')).toHaveAttribute('data-toolbar-mode', 'full');
    await page.waitForTimeout(450); // Wait for the existing initial viewport restore and native layout handshake.
    await expect(page.locator('.paper')).toBeVisible();
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await page.evaluate(() => { window.toolbarPaper = document.querySelector('.paper'); });
    await expect(b('工具属性')).toHaveCount(0);
    const paperState = () => page.locator('.paper').evaluate(e => ({ transform: e.style.transform, same: window.toolbarPaper === e, width: e.closest('.paper-scroll').clientWidth }));
    const initial = await paperState();
    await b('自由绘图').click(); await expect(panel).toHaveCount(0);
    await b('自由绘图').click(); await expect(panel).toBeVisible();
    await selectOption(page, '画笔粗细', '12');
    await b('朱红').click();
    await shot('pen-parameters-dark');
    assert.deepEqual(await paperState(), initial, 'Opening tool settings must not move or resize canvas');
    await b('自由绘图').click(); await expect(panel).toHaveCount(0);
    await b('自由绘图').click(); await expect(panel).toBeVisible();
    await b('图形工具').click(); await expect(panel).toHaveCount(0);
    await b('图形工具').click(); await expect(panel).toBeVisible();
    await selectOption(page, '画笔粗细', '2'); await b('松绿').click();
    await selectOption(page, '绘图工具', 'ellipse');
    await b('自由绘图').click(); await b('自由绘图').click();
    await expect(page.getByRole('combobox', { name: '画笔粗细', exact: true })).toContainText('12 px');
    await expect(b('朱红')).toHaveAttribute('aria-pressed', 'true');
    await b('图形工具').click(); await b('图形工具').click();
    await expect(page.getByRole('combobox', { name: '画笔粗细', exact: true })).toContainText('2 px');
    await expect(page.getByRole('combobox', { name: '绘图工具', exact: true })).toContainText('椭圆');
    await expect(b('松绿')).toHaveAttribute('aria-pressed', 'true');
    await b('橡皮擦').click(); await b('橡皮擦').click();
    await selectOption(page, '擦除模式', 'partial');
    await page.getByRole('slider', { name: '橡皮擦大小' }).fill('60');
    await page.keyboard.press('Escape'); await expect(panel).toHaveCount(0);
    assert(await win.evaluate(w => w.isVisible()), 'Esc should close parameters without hiding the app');
    await b('添加文字').click(); await b('添加文字').click();
    await selectOption(page, '文字字号', '24'); await b('文字加粗').click(); await b('靛蓝').click();
    await page.locator('.page-header-title').click(); await expect(panel).toHaveCount(0);
    await b('橡皮擦').click(); await b('橡皮擦').click();
    await expect(page.getByRole('combobox', { name: '擦除模式', exact: true })).toContainText('局部擦除');
    await expect(page.getByRole('slider', { name: '橡皮擦大小' })).toHaveValue('60');
    await page.keyboard.press('Escape');
    await b('添加文字').click(); await b('添加文字').click();
    await expect(page.getByRole('combobox', { name: '文字字号', exact: true })).toContainText('24 px');
    await expect(b('文字加粗')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await b('选择与拖动').click();
    await page.locator(`#note-${id}`).click();
    await b('选择与拖动').click(); await expect(page.getByRole('spinbutton', { name: '对象横坐标' })).toBeVisible();
    await shot('object-properties-dark'); await page.keyboard.press('Escape');
    const storedStrokes = () => page.evaluate(async () => {
      const board = await (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json();
      return Object.values(board.items).flatMap(item => item.value?.type === 'stroke' ? [item.value] : []);
    });
    const draw = async () => {
      const rect = await page.locator('.paper-scroll').boundingBox();
      const x = rect.x + rect.width * .6, y = rect.y + rect.height * .7;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 70, y + 40, { steps: 8 }); await page.mouse.up();
    };
    await b('自由绘图').click(); await draw();
    await expect.poll(async () => (await storedStrokes()).length).toBe(1);
    assert.equal((await storedStrokes())[0].color, '#d05a4b'); assert.equal((await storedStrokes())[0].width, 12);
    await b('图形工具').click(); await draw();
    await expect.poll(async () => (await storedStrokes()).length).toBe(2);
    assert((await storedStrokes()).some(s => s.color === '#39796b' && s.width === 2));
    await b('撤销上次操作').click(); await b('撤销上次操作').click();
    await expect.poll(async () => (await storedStrokes()).length).toBe(0);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [1440, 820, 720]) {
        await win.evaluate((w, width) => w.setContentSize(width, 900), width);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        await page.waitForTimeout(350); // Native mode-transition bounds and responsive hysteresis must settle.
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        await nav('我的随手页').click();
        await expect(page.locator('.free-workspace')).toHaveAttribute('data-toolbar-mode', width === 1440 ? 'full' : 'compact');
        if (await b('自由绘图').getAttribute('aria-pressed') !== 'true') await b('自由绘图').click();
        await b('自由绘图').click();
        await expect(panel).toBeVisible(); await shot(`canvas-${theme}-${width}`);
        await checkControls('canvas');
        assert(await page.locator('.free-tool-rail').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'Tool rail must not scroll horizontally or clip redo');
        const bounds = await panel.boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        await page.keyboard.press('Escape');
        const metrics = await page.locator('.header-actions .arasn-button:visible').evaluateAll(els => els.map(e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return { name: e.getAttribute('aria-label') || e.textContent, height: r.height, weight: s.fontWeight, font: s.fontSize, radius: s.borderRadius, right: r.right }; }));
        for (const metric of metrics) { assert.equal(metric.height, 44, JSON.stringify(metric)); assert.equal(metric.weight, '500', JSON.stringify(metric)); assert.equal(metric.font, '15px'); assert.equal(metric.radius, '10px'); assert(metric.right <= width + 1); }
        checks.push({ theme, width, actualWidth: await page.evaluate(() => innerWidth), metrics });
        await nav('文件').click(); await expect(page.locator('.page-header-meta')).toContainText('0 个文件'); await shot(`files-${theme}-${width}`);
        await expect(b('导入文件')).toHaveCSS('font-size', '15px');
        await checkControls('files');
        await nav('便笺列表').click(); await shot(`records-${theme}-${width}`); await checkControls('records');
        await nav('设置与快捷键').click(); await shot(`settings-${theme}-${width}`); await checkControls('settings'); await b('关闭弹窗').click();
      }
      await b('切换到便签区').click(); await shot(`quick-${theme}`);
      await checkControls('quick');
      await expect(page.locator('.xigra-quick-create')).toHaveCSS('font-weight', '500');
      await b('切换到工作区').click();
      await page.waitForTimeout(350);
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS tool click toggles, per-tool state, object editing, Esc/outside, canvas geometry, themes and shared controls');
  } finally { await app?.close(); await fs.rm(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
