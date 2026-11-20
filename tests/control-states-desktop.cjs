const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-states-'));
  const shots = path.resolve('docs/screenshots/control-states', process.env.ARASN_STATES_PASS || 'final');
  await fs.mkdir(shots, { recursive: true });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page; const errors = [], metrics = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page);
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    const b = name => page.getByRole('button', { name, exact: true });
    const snap = name => page.screenshot({ path: path.join(shots, name + '.png'), animations: 'disabled', scale: 'css' });
    const state = loc => loc.evaluate(el => { const s = getComputedStyle(el), r = el.getBoundingClientRect(); return {
      bg: s.backgroundColor, color: s.color, border: s.borderColor, outline: s.outlineStyle, outlineWidth: s.outlineWidth,
      shadow: s.boxShadow, font: s.fontWeight, opacity: s.opacity, duration: s.transitionDuration,
      x: r.x, y: r.y, w: r.width, h: r.height, focus: el.matches(':focus-visible'),
      svg: el.querySelector('svg') ? getComputedStyle(el.querySelector('svg')).transform : null,
    }; });
    const probe = async (loc, name) => {
      await loc.scrollIntoViewIfNeeded();
      await page.mouse.move(1, 1);
      const initial = await state(loc);
      await loc.hover();
      await expect.poll(async () => (await state(loc)).bg).not.toBe(initial.bg);
      await loc.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      const hover = await state(loc);
      await snap(name + '-hover');
      await page.mouse.down();
      await expect.poll(async () => (await state(loc)).bg).not.toBe(hover.bg);
      await loc.evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
      const pressed = await state(loc);
      await snap(name + '-pressed');
      await page.mouse.move(1, 1); await page.mouse.up();
      await page.evaluate(() => getSelection()?.removeAllRanges());
      assert.equal(initial.font, hover.font); assert.equal(hover.font, pressed.font);
      assert.deepEqual([initial.w, initial.h], [hover.w, hover.h]);
      assert.deepEqual([hover.w, hover.h], [pressed.w, pressed.h]);
      assert(!hover.svg || hover.svg === 'none');
      assert(hover.duration.split(',').every(d => parseFloat(d) >= .12 && parseFloat(d) <= .18));
      metrics.push({ name, initial, hover, pressed });
    };
    const keyboardFocus = async loc => {
      // Programmatically focus a temporary predecessor, then Tab through the real order.
      await loc.evaluate(el => { const prior = document.createElement('button'); prior.id = 'focus-predecessor'; prior.textContent = 'test'; el.before(prior); prior.focus(); });
      await page.keyboard.press('Tab');
      await page.locator('#focus-predecessor').evaluate(el => el.remove());
      await expect(loc).toBeFocused();
      assert.equal(await loc.evaluate(el => el.matches(':focus-visible')), true);
    };
    await page.locator('.quick-title').fill('交互状态验收草稿');
    await page.locator('.quick-input').fill('保留正文与光标，第一批只修组件状态。');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await b('打开工作区').click();
    await win.evaluate(w => w.setContentSize(1440, 900));
    for (const theme of ['light', 'dark']) {
      await page.locator('.sidebar').getByRole('button', { name: '设置与快捷键', exact: true }).click();
      await selectOption(page, '外观主题', theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const settingButton = page.locator('.modal .trigger-settings .button:enabled').first();
      if (await settingButton.count()) await probe(settingButton, `settings-${theme}`);
      const checkbox = page.locator('.modal .setting-toggle input:enabled').first();
      await keyboardFocus(checkbox);
      assert.equal((await state(checkbox)).outline, 'none');
      assert.equal(await checkbox.locator('..').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      await snap(`settings-${theme}-focus`);
      await b('关闭弹窗').click();
      await page.locator('.sidebar [aria-label="我的随手页"]').click();
      await probe(page.locator('.header-actions .new-note'), `toolbar-primary-${theme}`);
      await probe(b('搜索与快捷操作'), `toolbar-secondary-${theme}`);
      await page.locator('.sidebar [aria-label="文件"]').click();
      await probe(page.locator('.file-primary'), `file-primary-${theme}`);
      await probe(page.locator('.file-secondary-action').first(), `file-secondary-${theme}`);
      const selected = b('列表视图');
      const beforeFont = (await state(selected)).font;
      await b('网格视图').click();
      await selected.click();
      await expect(selected).toHaveAttribute('aria-pressed', 'true');
      assert.equal((await state(selected)).font, beforeFont);
      const disabled = page.locator('.file-pagination button:disabled').first();
      assert(await disabled.count());
      const disabledBefore = await state(disabled);
      await disabled.hover({ force: true });
      assert.equal((await state(disabled)).bg, disabledBefore.bg);
      assert.equal(await disabled.getAttribute('disabled'), '');
      await snap(`files-${theme}-selected-disabled`);
      const query = page.getByRole('textbox', { name: '搜索文件' });
      await query.click();
      assert.equal((await state(query)).outline, 'none');
      assert.equal(await query.locator('..').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await snap(`file-search-${theme}-mouse`);
      await keyboardFocus(query);
      assert.equal((await state(query)).outline, 'none');
      assert.equal(await query.locator('..').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
      assert.equal(await query.locator('..').evaluate(el => getComputedStyle(el).boxShadow), 'none');
      await snap(`file-search-${theme}-keyboard`);
      for (const zoom of [1.25, 1.5]) {
        await win.evaluate((w, factor) => w.webContents.setZoomFactor(factor), zoom);
        assert.equal((await state(query)).outline, 'none');
        assert.equal(await query.locator('..').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
        await snap(`file-search-${theme}-zoom${zoom}`);
      }
      await win.evaluate(w => w.webContents.setZoomFactor(1));
      for (const [width, height] of [[820, 700], [390, 720]]) {
        await win.evaluate((w, size) => { w.setMinimumSize(350, 460); w.setContentSize(...size); }, [width, height]);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await snap(`file-search-${theme}-${width}`);
      }
      await win.evaluate(w => w.setContentSize(1440, 900));
      await page.getByRole('combobox', { name: '文件分类', exact: true }).click();
      const option = page.getByRole('option').nth(1);
      await probe(option, `file-menu-${theme}`);
      // Select accepts on pointer-up; await its exit before opening a fresh keyboard pass.
      await expect(page.locator('.file-popover')).toBeHidden();
      await page.getByRole('combobox', { name: '文件分类', exact: true }).click();
      await expect(page.getByRole('listbox')).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await snap(`file-menu-${theme}-keyboard`);
      await page.keyboard.press('Escape');
      await b('返回工作区').click();
      await page.locator('.sidebar [aria-label="便笺列表"]').click();
      const record = page.locator('.xigra-record-workspace .xigra-record-list button').filter({ hasText: '交互状态验收草稿' }).first();
      await record.click();
      await probe(record, `record-${theme}`);
      await expect(page.locator('.xigra-record-editor')).toHaveValue('保留正文与光标，第一批只修组件状态。');
      await b('搜索与快捷操作').click();
      const command = page.getByRole('option').first();
      await probe(command, `command-${theme}`);
      await page.keyboard.press('Escape');
      await b('切换到便签区').click();
      await expect(page.locator('.quick-title')).toHaveValue('交互状态验收草稿');
      const title = page.locator('.quick-title');
      await title.click();
      assert.equal((await state(title)).outline, 'none');
      assert.equal((await state(title)).shadow, 'none');
      await snap(`title-${theme}-mouse`);
      await keyboardFocus(title);
      await title.evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
      assert.equal((await state(title)).outline, 'none');
      assert.notEqual((await state(title)).shadow, 'none');
      assert.equal(await page.locator('.quick-content').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
      await snap(`title-${theme}-keyboard`);
      for (const zoom of [1.25, 1.5]) {
        await win.evaluate((w, factor) => w.webContents.setZoomFactor(factor), zoom);
        assert.equal((await state(title)).outline, 'none');
        assert.notEqual((await state(title)).shadow, 'none');
        await snap(`title-${theme}-zoom${zoom}`);
      }
      await win.evaluate(w => w.webContents.setZoomFactor(1));
      await keyboardFocus(page.locator('.quick-input'));
      assert.equal(await page.locator('.quick-content').evaluate(el => getComputedStyle(el).boxShadow), 'none');
      await snap(`body-${theme}-keyboard`);
      await probe(b('搜索便签'), `quick-button-${theme}`);
      await b('打开工作区').click();
      await win.evaluate(w => w.setContentSize(1440, 900));
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert((await state(b('搜索与快捷操作'))).duration.split(',').every(v => parseFloat(v) === 0));
    await page.emulateMedia({ forcedColors: 'active' });
    await page.locator('.sidebar [aria-label="文件"]').click();
    await keyboardFocus(page.getByRole('textbox', { name: '搜索文件' }));
    await snap('forced-colors-file-focus');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(`PASS states: ${metrics.length} controls with distinct default/hover/pressed, stable weight and geometry; selected/disabled semantics, single title/search/checkbox focus owner, keyboard, both themes, reduced motion, forced colors, draft retained`);
  } catch(e) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data); assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    await fs.rm(target, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
