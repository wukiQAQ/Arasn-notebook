const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { selectOption } = require('./helpers/select-option.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-layout-'));
  const out = path.resolve('docs/screenshots/quick-layout', process.env.ARASN_LAYOUT_PASS || 'pass1');
  await fs.mkdir(out, { recursive: true });
  const fixture = path.join(root, 'layout-attachment.txt');
  await fs.writeFile(fixture, '附件存储回归验证');
  const env = { ...process.env, ARASN_DATA_DIR: path.join(root, 'data'), ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const checks = [], errors = [];
  try {
    app = await electron.launch({ args: ['.'], env });
    const page = await app.firstWindow(), win = await app.browserWindow(page);
    page.setDefaultTimeout(10000);
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.webContents.setBackgroundThrottling(false); w.setIgnoreMouseEvents(true); w.setFocusable(false); w.show(); });
    const b = name => page.getByRole('button', { name, exact: true });
    const mode = async name => { if (!await b(name).isVisible()) await b('页面操作').click(); await b(name).click(); await page.waitForTimeout(300); };
    const size = async (w, h) => { await win.evaluate((win, size) => { win.unmaximize(); win.setContentSize(...size); }, [w, h]); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(w); };
    const shot = async name => { await page.mouse.move(4, 300); await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, name + '.png') }); };
    const theme = async value => {
      await mode('切换到工作区');
      await page.locator('.sidebar').getByRole('button', { name: '设置与快捷键', exact: true }).click();
      await page.locator('.settings-categories').getByRole('button', { name: /^外观/ }).click();
      await selectOption(page, '外观主题', value);
      await b('关闭弹窗').click();
      await mode('切换到便签区');
      const notice = page.locator('.app-notification-close');
      if (await notice.count()) await notice.evaluate(e => e.click());
    };
    const input = page.locator('.quick-input');
    await page.locator('.quick-title').fill('布局验收便签');
    await input.fill('标题、正文和状态栏按顺序排列。\n最近便签独立于编辑容器。');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await app.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }); }, fixture);
    await b('0 个附件').click();
    const attachments = page.getByRole('dialog', { name: '当前便签附件' });
    await expect(attachments.getByText('暂无附件', { exact: true })).toBeVisible();
    await expect(attachments.getByText('附件保留在当前便签，文件副本可在文件中心管理。')).toBeVisible();
    await attachments.getByRole('button', { name: '本地导入' }).click();
    await expect(b('1 个附件')).toBeVisible();
    const create = page.locator('.quick-title-row').getByRole('button', { name: '新建便笺', exact: true });
    await expect(b('新建便笺')).toHaveCount(1);
    await create.click();
    await expect(input).toBeFocused();
    await expect(page.locator('.quick-title')).toHaveValue('');
    await input.fill('引用文件中心的已有附件。');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await b('0 个附件').click();
    await attachments.getByRole('button', { name: '文件中心引用' }).click();
    await page.getByRole('checkbox', { name: '选择附件 layout-attachment.txt' }).check();
    await b('添加所选（1）').click();
    await expect(b('1 个附件')).toBeVisible();
    await b('布局验收便签').click();
    await expect(input).toHaveValue('标题、正文和状态栏按顺序排列。\n最近便签独立于编辑容器。');
    for (const value of ['light', 'dark']) {
      await theme(value);
      for (const [w, h] of [[1440, 900], [820, 700], [500, 540], [390, 560]]) {
        if (w < 500) await win.evaluate(w => w.setMinimumSize(300, 400));
        await size(w, h);
        const geometry = await page.locator('.quick-panel').evaluate(panel => {
          const rect = selector => panel.querySelector(selector).getBoundingClientRect().toJSON();
          const bar = panel.querySelector('.note-status-bar');
          const nav = document.querySelector('.window-navigation');
          return { width: innerWidth, editor: rect('.quick-content'), body: rect('.quick-input'), bar: rect('.note-status-bar'), recent: rect('.xigra-recent-records'), title: nav.querySelector('h1 span').getBoundingClientRect().toJSON(), nav: nav.getBoundingClientRect().toJSON(), mode: nav.querySelector('.mode-switch-button').getBoundingClientRect().toJSON(), inputTitle: rect('.quick-title'), create: rect('.quick-title-create'), position: getComputedStyle(bar).position, inside: bar.parentElement.classList.contains('quick-content'), states: panel.querySelectorAll('.save-state').length };
        });
        assert.equal(geometry.inside, true); assert.equal(geometry.position, 'static'); assert.equal(geometry.states, 1);
        assert(geometry.bar.y >= geometry.body.bottom - 1);
        assert(geometry.bar.bottom <= geometry.editor.bottom + 1);
        assert(geometry.recent.y >= geometry.editor.bottom);
        const mid = ({ y, height }) => y + height / 2;
        assert(Math.abs(mid(geometry.title) - mid(geometry.mode)) < 2, JSON.stringify(geometry));
        assert(Math.abs(mid(geometry.inputTitle) - mid(geometry.create)) < 2);
        assert.equal(geometry.title.x, geometry.inputTitle.x);
        assert(geometry.inputTitle.right < geometry.create.x && geometry.create.right < geometry.editor.right);
        assert.deepEqual([geometry.create.width, geometry.create.height], [36, 36]);
        assert(geometry.editor.y - geometry.nav.bottom >= 12 && geometry.editor.y - geometry.nav.bottom <= 16);
        checks.push({ theme: value, ...geometry });
        await shot(`${value}-${w}`);
      }
      for (const width of [500, 390]) {
        await size(width, 540);
        await b('1 个附件').click();
        await expect(attachments.getByText('layout-attachment.txt', { exact: true })).toBeVisible();
        for (const action of ['本地导入', '文件中心引用', '查看文件中心']) {
          await expect(attachments.getByRole('button', { name: action }).locator('svg')).toHaveCount(1);
        }
        await shot(`${value}-attachments-${width}`);
        const popup = await attachments.boundingBox(), anchor = await b('1 个附件').boundingBox();
        assert(popup.x >= 19 && popup.x + popup.width <= width - 19);
        assert(popup.y >= 119 && popup.y + popup.height < anchor.y);
        await page.keyboard.press('Escape');
        await expect(attachments).toHaveCount(0);
      }
      await size(620, 700);
      const idleCreate = await create.evaluate(e => getComputedStyle(e).backgroundColor);
      await create.hover();
      await expect(page.getByRole('tooltip')).toHaveText('新建便签');
      const hoverCreate = await create.evaluate(e => ({
        background: getComputedStyle(e).backgroundColor,
        color: getComputedStyle(e).color,
        iconColor: getComputedStyle(e.querySelector('svg')).color,
      }));
      assert.notEqual(hoverCreate.background, idleCreate);
      assert.equal(hoverCreate.color, hoverCreate.iconColor);
      await page.screenshot({ path: path.join(out, `${value}-create-hover.png`) });
      if (process.platform === 'win32') await captureNativeWindow(app, page, path.join(out, `${value}-normal-windows.png`));
      await win.evaluate(w => w.maximize());
      await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
      await shot(`${value}-maximized`);
      if (process.platform === 'win32') await captureNativeWindow(app, page, path.join(out, `${value}-maximized-windows.png`));
      await size(500, 540);
      const search = page.locator('.window-navigation').getByRole('button', { name: '搜索便签', exact: true });
      await search.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      assert.equal(await search.evaluate(e => e.matches(':focus-visible')), true);
      await shot(`${value}-keyboard-focus`);
      await search.click(); await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
      await mode('切换到工作区'); await size(1440, 900);
      await page.locator('.sidebar').getByRole('button', { name: '设备互传', exact: true }).click();
      const close = b('关闭弹窗');
      const style = () => close.evaluate(e => { const c = getComputedStyle(e); return { bg: c.backgroundColor, border: c.borderColor, weight: c.fontWeight, outline: c.outlineStyle, rect: e.getBoundingClientRect().toJSON() }; });
      await page.mouse.move(4, 300); await page.waitForTimeout(200);
      const states = { default: await style() }; await shot(`${value}-device-default`);
      assert.equal(states.default.bg, 'rgba(0, 0, 0, 0)'); assert.equal(states.default.border, 'rgba(0, 0, 0, 0)');
      assert(states.default.rect.width >= 44 && states.default.rect.height >= 44);
      await close.hover(); await page.waitForTimeout(200); states.hover = await style(); await page.screenshot({ path: path.join(out, `${value}-device-hover.png`) });
      await page.mouse.down(); await page.waitForTimeout(200); states.pressed = await style(); await page.screenshot({ path: path.join(out, `${value}-device-pressed.png`) }); await page.mouse.move(4, 300); await page.mouse.up();
      await close.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); states.focus = await style();
      assert.notEqual(states.default.bg, states.hover.bg); assert.notEqual(states.hover.bg, states.pressed.bg); assert.equal(states.default.weight, states.pressed.weight); assert.equal(states.focus.outline, 'solid');
      await shot(`${value}-device-focus`); checks.push({ theme: value, close: states });
      await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.locator('.sidebar').getByRole('button', { name: '便笺列表', exact: true }).click();
      const filters = page.locator('.xigra-record-filters');
      await filters.getByRole('button', { name: '最近', exact: true }).click();
      await expect(filters.getByRole('button', { name: '最近', exact: true })).toHaveAttribute('aria-pressed', 'true');
      await page.mouse.move(4, 300); await page.waitForTimeout(200);
      const filterState = await filters.evaluate(e => [...e.querySelectorAll('button')].map(b => ({ selected: b.getAttribute('aria-pressed'), color: getComputedStyle(b).color, border: getComputedStyle(b).borderColor })));
      assert.notEqual(filterState[0].color, filterState[1].color);
      assert.equal(filterState[0].border, 'rgba(0, 0, 0, 0)');
      const query = page.locator('.xigra-record-search input');
      await query.fill('布局验收');
      await expect(page.locator('.xigra-record-scroll')).toContainText('布局验收便签');
      assert.equal(await query.evaluate(e => getComputedStyle(e).borderWidth), '0px');
      await query.fill('');
      await shot(`${value}-library`);
      await mode('切换到便签区');
    }
    await input.fill('保存与切换回归通过。'); await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await create.click(); await expect(input).toHaveValue('');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('等待输入');
    await shot('empty-note');
    await page.locator('.xigra-record-list.compact button').filter({ hasText: '布局验收便签' }).click();
    await expect(input).toHaveValue('保存与切换回归通过。'); await expect(b('1 个附件')).toBeVisible();
    await b('1 个附件').click();
    await attachments.getByRole('button', { name: '查看文件中心' }).click();
    await expect(page.locator('main .file-station')).toBeVisible();
    await mode('切换到便签区');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(out, 'verification.json'), JSON.stringify({ checks, errors, regression: 'save, attach, keyboard, search, close, switch, new and reopen, reduced motion' }, null, 2));
    console.log('PASS quick layout, four widths, two themes, control states and core interactions');
  } finally { if (app) await app.close(); await fs.rm(root, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
