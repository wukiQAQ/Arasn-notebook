const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

const pages = [
  ['我的随手页', '自由工作页', 'workpage', '.free-workspace .paper-scroll'],
  ['打开关系画布', '关系画布', 'relations', '.topology-surface'],
  ['便笺列表', '便签', 'notes', '.record-index-heading'],
  ['文件', '文件中心', 'files', '.file-workspace .file-actions'],
];

async function verify(theme, out) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-workbench-nav-'));
  let app;
  try {
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme, shortcut: 'Control+Alt+F22' }));
    createStore(path.join(data, 'board.json')).apply({
      id: randomUUID(), opId: randomUUID(), expected: 0,
      value: { type: 'text', text: '迭代会议记录\n确认桌面工作台的导航、便签与画布体验。', x: 800, y: 400, color: '#9aafff' },
    });
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const button = name => page.getByRole('button', { name, exact: true });
    const sidebar = page.locator('#workbench-sidebar');
    const header = page.getByRole('banner', { name: '窗口导航栏' });
    const hide = header.getByRole('button', { name: '展开或收起侧边栏' });
    const compact = header.locator('button[aria-pressed][aria-controls="workbench-sidebar"]');
    const tray = header.getByRole('button', { name: '隐藏到托盘' });
    const newNote = page.locator('button.page-new-note:visible');
    const title = header.locator('.window-page-title > span');
    const shot = name => page.screenshot({ path: path.join(out, `${name}-${theme}.png`), animations: 'disabled' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await page.evaluate(() => window.desktop.layout(true));
    const resize = async (width, height) => {
      await expect.poll(async () => {
        const size = await page.evaluate(() => [innerWidth, innerHeight]);
        if (size[0] !== width || size[1] !== height) await win.evaluate((w, target) => {
          w.setMinimumSize(500, 540);
          w.setContentSize(...target);
        }, [width, height]);
        return size;
      }).toEqual([width, height]);
    };
    await resize(1360, 850);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(sidebar.getByRole('button', { name: /紧凑导航|展开导航/ })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: '写一张便笺' })).toHaveCount(0);
    const leftControls = header.getByRole('group', { name: '导航与窗口' });
    await expect(leftControls.getByRole('button')).toHaveCount(5);
    await expect(header.getByRole('button', { name: '写一张便笺' })).toHaveCount(0);
    for (const control of [hide, compact, tray]) {
      await expect(control).toHaveCSS('width', '36px');
      await expect(control).toHaveCSS('height', '36px');
      await expect(control.locator('svg')).toHaveCSS('width', '18px');
      await page.mouse.move(3, 100);
      await control.hover();
      const tip = page.getByRole('tooltip', { name: await control.getAttribute('aria-label'), exact: true });
      await expect(tip).toHaveCSS('visibility', 'visible');
      assert((await tip.boundingBox()).y >= 48);
    }
    const separator = sidebar.getByRole('separator', { name: '调整侧边栏宽度' });
    await separator.press('ArrowRight');
    const width = 210;
    await expect(sidebar).toHaveCSS('width', `${width}px`);
    const controlLeft = (await hide.boundingBox()).x;

    async function checkLayout(selector, expandedWidth, checkControls = true) {
      await expect(sidebar).toHaveCSS('width', `${expandedWidth}px`);
      const positions = await page.evaluate(selector => {
        const left = element => element.getBoundingClientRect().left;
        const bar = document.querySelector('.window-navigation');
        const title = bar.querySelector('.window-page-title > span');
        const main = document.querySelector('.app-shell > main');
        const sidebar = document.querySelector('#workbench-sidebar');
        const edge = getComputedStyle(sidebar);
        const rail = sidebar.getBoundingClientRect();
        const controls = bar.querySelector('.window-navigation-controls').getBoundingClientRect();
        const last = bar.lastElementChild.getBoundingClientRect();
        return { title: left(title), titleRight: title.getBoundingClientRect().right, main: left(main), content: left(document.querySelector(selector)),
          railRight: rail.right, railTop: rail.top, border: parseFloat(edge.borderInlineEndWidth),
          railBottom: rail.bottom, mainBottom: main.getBoundingClientRect().bottom, headerBottom: bar.getBoundingClientRect().bottom,
          left: controls.left, right: controls.right, lastLeft: last.left, lastRight: last.right,
          headerHeight: bar.clientHeight, viewportWidth: innerWidth };
      }, selector);
      assert.equal(positions.main, expandedWidth, JSON.stringify(positions));
      assert.equal(positions.railRight, positions.main);
      const inset = ['.record-index-heading', '.file-workspace .file-actions'].includes(selector) ? 12 : 0;
      assert.equal(positions.content, positions.main + inset, JSON.stringify(positions));
      assert.equal(positions.left, 12);
      if (positions.viewportWidth <= 600) assert.equal(positions.title, positions.main + 12);
      else assert(positions.title >= positions.right && positions.titleRight <= positions.lastLeft);
      assert.equal(positions.border, expandedWidth ? 1 : 0);
      assert.equal(positions.railTop, positions.headerBottom);
      assert.equal(positions.railBottom, positions.mainBottom);
      assert(positions.lastRight <= positions.viewportWidth - 140);
      if (checkControls) assert.equal((await hide.boundingBox()).x, controlLeft);
    }
    async function openPage(route, name) {
      const entry = sidebar.getByRole('button', { name: route, exact: true });
      await entry.click();
      await expect(entry).toHaveAttribute('aria-current', 'page');
      await expect(title).toHaveText(name);
      await expect(header.getByRole('heading', { level: 1 })).toHaveText(name);
      if (name === '关系画布') {
        const upgrade = button('备份并启用关系画布');
        await expect(upgrade.or(button('新建节点'))).toBeVisible();
        if (await upgrade.isVisible()) {
          await upgrade.click();
          await expect(button('新建节点')).toBeEnabled();
          const close = button('关闭通知');
          if (await close.isVisible()) await close.click();
          await expect(close).toHaveCount(0);
        }
      }
    }
    for (const [route, name, file, selector] of pages) {
      await openPage(route, name);
      await checkLayout(selector, width);
      await expect(header.locator('.save-state')).toHaveCount(0);
      if (file === 'workpage' || file === 'relations') {
        const footer = page.locator(file === 'workpage' ? '.free-workspace .canvas-footer' : '.relation-save-footer');
        await expect(footer).toContainText('本机工作空间');
        await expect(footer.locator('.save-state')).toHaveText('已保存');
        const footerRect = await footer.boundingBox();
        assert(footerRect.y > 700);
        if (file === 'relations') {
          await expect(footer).toContainText(/\d+ 个节点 · \d+ 条连线/);
          await expect(footer.locator('#topology-controls-help')).toBeVisible();
          const surface = await page.locator('.topology-surface').boundingBox();
          const zoom = await page.locator('.topology-zoom').boundingBox();
          assert(surface.x + surface.width - zoom.x - zoom.width <= 20);
          assert(zoom.y + zoom.height < footerRect.y);
          const map = page.locator('.topology-map');
          if (await map.isVisible()) {
            const mapRect = await map.boundingBox();
            assert(mapRect.y + mapRect.height <= zoom.y);
          }
        }
      }
      if (file === 'workpage') await expect(page.locator('.free-workspace .free-tool-rail')).toHaveAttribute('data-mode', 'full');
      if (file === 'notes') {
        await expect(page.locator('.record-index-heading')).not.toContainText('条记录');
        await page.locator('.xigra-record-workspace .xigra-record-list button').filter({ hasText: '迭代会议记录' }).click();
        await expect(page.locator('.xigra-record-paper .save-state')).toHaveText('已保存');
        const selected = page.locator('.xigra-record-workspace .xigra-record-list [aria-current="true"]');
        await expect(selected).toHaveCSS('box-shadow', 'none');
        await expect.poll(() => selected.evaluate(el => {
          const probe = document.createElement('span'); probe.style.borderColor = 'var(--ui-action)'; el.append(probe);
          const actual = getComputedStyle(el).borderLeftColor, expected = getComputedStyle(probe).borderLeftColor;
          probe.remove(); return actual === expected ? null : { actual, expected };
        })).toBeNull();
      }
      if (file === 'files') await expect(page.locator('.file-station')).toContainText('0 个文件');
      await page.mouse.move(3, 53);
      await shot(file);
      if (file === 'workpage') {
        for (const [name, tipName] of [['全局搜索', '搜索便签'], ['全局快捷操作', '快捷操作 · Ctrl+K'], ['全局共享', '共享与设备']]) {
          await page.mouse.move(3, 100);
          await header.getByRole('button', { name, exact: true }).hover();
          const tip = page.getByRole('tooltip', { name: tipName, exact: true });
          await expect(tip).toBeVisible();
          await expect.poll(async () => {
            const box = await tip.boundingBox();
            return box.y >= 52 && box.x >= 0 && box.x + box.width <= 1360;
          }).toBe(true);
          await expect(page.locator('.window-tooltip-position')).toHaveCSS('z-index', '21');
          if (name === '全局快捷操作') await shot('commands-tooltip');
        }
        await page.mouse.move(3, 100);
      }
      if (file === 'workpage') {
        const frames = await compact.evaluate(async control => {
          const sidebar = document.querySelector('#workbench-sidebar');
          const title = document.querySelector('.window-page-title > span');
          const main = document.querySelector('.app-shell > main');
          const x = element => element.getBoundingClientRect().left;
          const positions = [];
          control.click();
          const start = performance.now();
          while (performance.now() - start < 240) {
            await new Promise(requestAnimationFrame);
            positions.push([sidebar.getBoundingClientRect().width, x(title), x(main)]);
          }
          return positions;
        });
        assert(frames.some(([width]) => width > 70 && width < 200));
        for (const [frameWidth, titleX, mainX] of frames) assert(Math.abs(frameWidth - mainX) <= 1 && titleX === frames[0][1]);
      } else await compact.click();
      await expect(compact).toHaveAttribute('aria-pressed', 'true');
      await expect(sidebar.getByRole('button', { name: route, exact: true })).toHaveAttribute('aria-current', 'page');
      await checkLayout(selector, 64);
      if (file === 'workpage') { await page.mouse.move(3, 53); await shot('workpage-compact'); }
      await hide.click();
      await expect(hide).toHaveAttribute('aria-expanded', 'false');
      await expect(compact).toBeDisabled();
      await checkLayout(selector, 0);
      if (file === 'workpage') await shot('workpage-hidden');
      await hide.click();
      await checkLayout(selector, 64);
      await compact.click();
      await checkLayout(selector, width);
    }

    await openPage('便笺列表', '便签');
    const help = button('使用说明');
    const editor = page.locator('.xigra-record-editor');
    const popup = page.getByRole('dialog', { name: '使用说明' });
    const editorBox = await editor.boundingBox();
    await expect(help).toHaveCount(1);
    await page.mouse.move(3, 100);
    await help.hover();
    await expect(page.getByRole('tooltip', { name: '使用说明' })).toBeVisible();
    await help.click();
    await expect(popup).toContainText('添加附件');
    await expect(popup).toContainText('加入关系画布');
    assert.deepEqual(await editor.boundingBox(), editorBox);
    await shot('notes-help');
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await help.click();
    await page.locator('.record-index-heading').click();
    await expect(popup).toHaveCount(0);

    await page.route('**/api/ops', route => route.fulfill({ status: 503, body: 'isolated sync failure' }));
    await editor.fill('迭代会议记录\n离线保存检查。');
    const noteStatus = page.locator('.xigra-record-paper .save-state');
    await expect(noteStatus).toHaveText(/待同步|尚未落盘|保存需要处理/);
    await expect(page.locator('.app-shell > main .xigra-notice[data-tone="error"]')).toBeVisible();
    await page.unroute('**/api/ops');
    if (await button('重试保存').isVisible()) await button('重试保存').click();
    await expect(noteStatus).toHaveText('已保存');

    await resize(720, 580);
    await compact.click();
    await button('便签正文').click();
    await help.click();
    await expect(popup).toBeVisible();
    const bounds = await popup.boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 720 && bounds.y + bounds.height <= 580);
    await page.keyboard.press('Escape');
    await compact.click();
    await resize(540, 560);
    await button('便签列表').click();
    await checkLayout('.record-index-heading', width, false);
    assert(await title.evaluate(el => el.scrollWidth <= el.clientWidth));
    await shot('notes-narrow');
    await openPage('打开关系画布', '关系画布');
    const narrowFooter = await page.locator('.relation-save-footer').boundingBox();
    const narrowZoom = await page.locator('.topology-zoom').boundingBox();
    assert(narrowFooter.x >= 0 && narrowFooter.x + narrowFooter.width <= 540);
    assert(Math.abs(narrowFooter.y + narrowFooter.height - 560) <= 2);
    assert(narrowZoom.x >= 0 && narrowZoom.x + narrowZoom.width <= 540);
    assert(narrowZoom.y + narrowZoom.height < narrowFooter.y);
    await shot('relations-narrow');
    await resize(1360, 850);

    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    for (const [route, name, , selector] of pages) {
      await openPage(route, name);
      await checkLayout(selector, width, false);
      await compact.click();
      await checkLayout(selector, 64, false);
      await hide.click();
      await checkLayout(selector, 0, false);
      await hide.click();
      await compact.click();
      await checkLayout(selector, width, false);
    }
    if (theme === 'dark' && process.platform === 'win32') {
      await openPage('我的随手页', '自由工作页');
      await expect(page.locator('.free-workspace .free-tool-rail')).toHaveAttribute('data-mode', 'full');
      await page.mouse.move(3, 53);
      await captureNativeWindow(app, page, path.join(out, 'workpage-maximized-windows.png'));
    }
    await win.evaluate(w => w.unmaximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
    await openPage('文件', '文件中心');
    const grip = await separator.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + 150);
    await page.mouse.down();
    await page.mouse.move(230, grip.y + 150, { steps: 8 });
    await page.mouse.up();
    await checkLayout('.file-workspace .file-actions', 230);
    await separator.press('ArrowLeft');
    await separator.press('ArrowLeft');
    await expect.poll(async () => (await page.evaluate(() => window.desktop.info())).sidebar).toEqual({ mode: 'full', width });
    const records = () => page.evaluate(async () => {
      const response = await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } });
      return Object.values((await response.json()).items).filter(item => item.value?.type === 'text').map(item => item.value.text);
    });
    const startingCount = (await records()).length;
    await openPage('我的随手页', '自由工作页');
    await expect(newNote).toHaveText('新建便签');
    await newNote.click();
    const canvasEditor = page.getByRole('textbox', { name: '便签完整正文' });
    await expect(canvasEditor).toBeFocused();
    await canvasEditor.fill('通过完整侧栏新建工作页便签。');
    await expect.poll(records).toContain('通过完整侧栏新建工作页便签。');
    await expect.poll(async () => (await records()).length).toBe(startingCount + 1);
    await button('关闭便签详情').click();
    const selectedCanvas = page.locator('.free-workspace .spatial-note.focused');
    await expect(selectedCanvas).toHaveCSS('outline-style', 'none');
    const canvasColor = await selectedCanvas.evaluate(el => {
      const probe = document.createElement('span'); probe.style.borderColor = 'var(--ui-action)'; el.append(probe);
      const style = getComputedStyle(el), accent = getComputedStyle(probe).borderLeftColor;
      probe.remove();
      return style.borderLeftColor === accent && style.borderRightColor === accent && style.borderLeftWidth === style.borderRightWidth;
    });
    assert(canvasColor);
    await shot('canvas-selected');
    await openPage('便笺列表', '便签');
    await compact.click();
    await expect(sidebar).toHaveCSS('width', '64px');
    await expect(newNote.locator('span')).toHaveText('新建便签');
    await page.mouse.move(4, 50);
    await newNote.hover();
    await expect(page.getByRole('tooltip', { name: '新建便签' })).toBeVisible();
    await newNote.click();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue('');
    await newNote.click();
    assert.equal((await records()).length, startingCount + 1);
    await editor.fill('通过紧凑侧栏新建便签。');
    await expect(noteStatus).toHaveText('已保存');
    await expect.poll(async () => (await records()).length).toBe(startingCount + 2);
    await compact.click();
    await expect(sidebar).toHaveCSS('width', `${width}px`);
    await page.keyboard.press('Control+k');
    await expect(page.locator('.command-popup')).toBeVisible();
    await page.locator('.command-popup').getByText('写一张便笺', { exact: true }).click();
    await expect(editor).toHaveValue('');
    assert.equal((await records()).length, startingCount + 2);
    await openPage('我的随手页', '自由工作页');
    await button('返回上一页').click();
    await expect(title).toHaveText('便签');
    await button('前进到下一页').click();
    await expect(title).toHaveText('自由工作页');
    await expect.poll(async () => (await records()).length).toBe(startingCount + 2);
    await tray.click();
    await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(false);
    await win.evaluate(w => { w.show(); w.focus(); });
    await page.evaluate(() => window.desktop.layout(false));
    const quick = page.locator('.quick-panel');
    const quickCreate = header.getByRole('button', { name: '新建便笺' });
    await expect(quickCreate).toBeVisible();
    await expect(quick.getByRole('button', { name: '新建便笺' })).toHaveCount(0);
    await expect(tray).toBeVisible();
    await quickCreate.click();
    await expect(quick.locator('.quick-input')).toBeFocused();
    await quick.locator('.quick-input').fill('通过速记顶部加号保存便签。');
    await expect(quick.locator('.save-state')).toHaveText('已保存');
    await quickCreate.click();
    await expect(quick.locator('.quick-input')).toHaveValue('');
    await expect(quick.getByRole('region', { name: '最近便笺' })).toContainText('通过速记顶部加号保存便签。');
    await expect.poll(async () => (await records()).length).toBe(startingCount + 3);
    await page.mouse.move(2, 53);
    await shot('quick');
    assert.deepEqual(errors, []);
  } finally {
    await app?.close();
    await fs.rm(data, { recursive: true, force: true });
  }
}

(async () => {
  const out = path.resolve(process.env.ARASN_NAV_SHOTS || 'docs/screenshots/workbench-navigation');
  await fs.mkdir(out, { recursive: true });
  for (const theme of ['light', 'dark']) await verify(theme, out);
  console.log('PASS left titlebar, sidebar modes, single note creation, draft focus, save, shortcut, tray and native maximize in both themes');
})().catch(error => { console.error(error); process.exitCode = 1; });
