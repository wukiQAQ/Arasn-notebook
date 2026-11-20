const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
(async () => {
  const phase = process.env.ARASN_HEADER_PHASE || 'after';
  const output = path.resolve('docs/screenshots/page-header', phase);
  await fs.mkdir(output, { recursive: true });
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-page-header-'));
  const store = createStore(path.join(data, 'board.json'));
  store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'text', text: '信息层级验收\n切换页面与窗口尺寸后保留正文和位置。', x: 300, y: 180, color: '#4668c6' } });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const errors = [], results = [];
  try {
    app = await electron.launch({ args: ['.'], env });
    const page = await app.firstWindow(); const win = await app.browserWindow(page);
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    const button = name => page.getByRole('button', { name, exact: true });
    const nav = name => page.locator('.sidebar').getByRole('button', { name, exact: true });
    await button('切换到工作区').click();
    await nav('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    if (await upgrade.isVisible()) { await expect(upgrade).toBeEnabled(); await upgrade.click(); }
    await expect(button('新建节点')).toBeEnabled();
    if (await button('关闭通知').isVisible()) { await button('关闭通知').click(); await expect(button('关闭通知')).toHaveCount(0); }
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    const original = await board();
    await page.evaluate(() => { window.headerCanvas = document.querySelector('.free-workspace'); window.headerPaper = document.querySelector('.paper'); window.headerTopology = document.querySelector('.topology-viewport'); });
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const size of (phase === 'before' ? ['normal', 'maximized', 'narrow'] : ['normal', 'maximized', 'narrow', 'tiny'])) {
        if (size === 'maximized') {
          await win.evaluate(w => w.maximize()); await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
        } else {
          await win.evaluate(w => w.unmaximize()); await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
          const width = size === 'normal' ? 1440 : size === 'tiny' ? 390 : 720;
          await win.evaluate((w, width) => { w.setMinimumSize(350, 460); w.setContentSize(width, 800); }, width);
          await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        }
        // The existing <640px reader replaces the paper; compare identity within each layout.
        await expect(page.locator('.paper')).toHaveCount(size === 'tiny' ? 0 : 1);
        await page.evaluate(() => { window.headerPaper = document.querySelector('.paper'); });
        for (const [route, name, title] of [['文件', 'files', '文件中心'], ['打开关系画布', 'relations', '关系画布'], ['我的随手页', 'canvas', '自由工作页'], ['便笺列表', 'records', '速记']]) {
          await nav(route).click();
          await expect(page.locator('.topbar h1')).toContainText(title);
          if (name === 'files') await expect(page.locator('.file-pagination')).toBeVisible();
          if (name === 'files' && phase !== 'before') await expect(page.locator('.topbar h1')).toContainText('0 个文件');
          if (name === 'relations') await expect(page.locator('.topology-viewport')).toBeVisible();
          await page.mouse.move(1, 1);
          await page.screenshot({ path: path.join(output, `${name}-${theme}-${size}.png`), animations: 'disabled', scale: 'css' });
          const geometry = await page.locator('main').evaluate(el => {
            const h = el.querySelector('.topbar'), title = h.querySelector('h1').getBoundingClientRect(), actions = h.querySelector('.header-actions').getBoundingClientRect();
            return { titles: [...el.querySelectorAll('h1')].filter(e => e.checkVisibility()).map(e => e.textContent), width: innerWidth,
              overflow: document.documentElement.scrollWidth > innerWidth, headerHeight: h.getBoundingClientRect().height,
              font: getComputedStyle(h.querySelector('h1')).fontSize, overlap: title.right > actions.left + 1 && title.top < actions.bottom && actions.top < title.bottom,
              actionsContained: actions.bottom <= h.getBoundingClientRect().bottom + 1,
              buttonsContained: [...h.querySelectorAll('button')].filter(e => e.checkVisibility()).every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= h.getBoundingClientRect().bottom + 1; }),
              canvasStable: window.headerCanvas === document.querySelector('.free-workspace'), topologyStable: window.headerTopology === document.querySelector('.topology-viewport'),
              paperStable: innerWidth <= 640 || window.headerPaper === document.querySelector('.paper') };
          });
          if (phase !== 'before') {
            assert.equal(geometry.titles.length, 1, JSON.stringify(geometry)); assert(!geometry.overflow && !geometry.overlap && geometry.actionsContained && geometry.buttonsContained, JSON.stringify(geometry));
            assert(geometry.canvasStable && geometry.topologyStable && geometry.paperStable, JSON.stringify({ name, theme, size, ...geometry }));
            if (name === 'relations') await expect(page.locator('.topbar h1')).toContainText('1 个节点');
          }
          results.push({ name, theme, size, ...geometry });
          if (name === 'files') { await button('返回工作区').click(); await expect(page.locator('.file-workspace')).toHaveCount(0); await nav(route).click(); }
          if (name === 'relations') { await button('返回工作页').click(); await expect(page.locator('.free-workspace')).toBeVisible(); }
        }
        await nav('设备互传').click();
        await expect(page.locator('.device-hub')).toBeVisible();
        await expect(page.locator('.device-hub h2:not(.sr-only)')).toHaveText('设备互传');
        await page.screenshot({ path: path.join(output, `devices-${theme}-${size}.png`), animations: 'disabled', scale: 'css' });
        await button('关闭弹窗').click();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(await board(), original, 'Page/layout/theme changes must preserve stored content');
    if (phase !== 'before') {
      await win.evaluate(w => { w.setContentSize(1440, 800); });
      await nav('打开关系画布').click();
      await page.getByRole('textbox', { name: '搜索节点', exact: true }).fill('信息层级');
      await nav('文件').click(); await button('返回工作区').click();
      await expect(page.getByRole('textbox', { name: '搜索节点', exact: true })).toHaveValue('信息层级');
      await expect(page.getByRole('combobox', { name: '新节点类型', exact: true })).toBeVisible();
      await expect(button('整理节点')).toBeEnabled();
      await button('新建节点').click(); await expect(page.locator('.topbar h1')).toContainText('2 个节点');
      await button('撤销节点操作').click(); await expect(page.locator('.topbar h1')).toContainText('1 个节点');
      await button('返回工作页').click(); await button('截图 / 导出').click();
      await expect(button('关闭截图导出')).toBeVisible(); await button('关闭截图导出').click();
    }
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`PASS ${phase}: ${results.length} page/theme/window checks + ${results.length / 4} device dialogs, navigation and canvas identity`);
  } finally { await app?.close(); await fs.rm(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
