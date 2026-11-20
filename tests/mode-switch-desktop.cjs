const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-mode-switch-'));
  const shots = path.resolve(process.env.ARASN_SCREENSHOTS || 'docs/screenshots/unified-topbar');
  await fs.mkdir(shots, { recursive: true });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const errors = [], metrics = [];
  try {
    app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
    const page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page);
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const bar = page.locator('.window-navigation');
    const actions = bar.locator('.window-navigation-actions button');
    const layout = () => actions.evaluateAll(buttons => {
      const bar = document.querySelector('.window-navigation');
      const overlay = navigator.windowControlsOverlay.getTitlebarAreaRect();
      return { barHeight: bar.offsetHeight, captionEdge: overlay.x + overlay.width,
        buttons: buttons.map(button => {
          const rect = button.getBoundingClientRect();
          const icon = button.querySelector('svg').getBoundingClientRect();
          return { icon: button.querySelector('svg').getAttribute('class'), text: button.textContent, width: rect.width, height: rect.height,
            iconWidth: icon.width, iconHeight: icon.height, top: rect.top, right: rect.right, left: rect.left,
            drag: getComputedStyle(button).webkitAppRegion };
        }) };
    });
    const checkLayout = async () => {
      const geometry = await layout();
      assert.equal(geometry.barHeight, 48);
      assert.deepEqual(geometry.buttons.map(button => button.icon.split(' ').at(-1)), ['lucide-search', 'lucide-arrow-left-right', 'lucide-command', 'lucide-share-2']);
      for (const [index, button] of geometry.buttons.entries()) {
        assert.deepEqual([button.width, button.height, button.iconWidth, button.iconHeight, button.top], [36, 36, 18, 18, 6]);
        assert.equal(button.text, ''); assert.equal(button.drag, 'no-drag');
        if (index) assert.equal(button.left - geometry.buttons[index - 1].right, 4);
      }
      assert.equal(geometry.captionEdge - geometry.buttons.at(-1).right, 12);
      assert.equal(await bar.evaluate(el => getComputedStyle(el).webkitAppRegion), 'drag');
      return geometry;
    };
    const switcher = () => page.locator('.mode-switch-button:visible');
    const state = () => switcher().evaluate(el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect(), icon = getComputedStyle(el.querySelector('svg'));
      return { height: r.height, width: r.width, radius: s.borderRadius, border: s.borderWidth, borderColor: s.borderColor,
        bg: s.backgroundColor, weight: s.fontWeight, size: s.fontSize, padding: s.paddingInline, gap: s.gap,
        outline: s.outlineWidth, shadow: s.boxShadow, icon: icon.width, iconTransform: icon.transform,
        inBounds: r.x >= 0 && r.right <= innerWidth, label: el.getAttribute('aria-label') };
    });
    const settle = () => switcher().evaluate(el => Promise.all(el.getAnimations().map(a => a.finished.catch(() => {}))));
    const capture = name => captureNativeWindow(app, page, path.join(shots, `${name}.png`));
    const resize = async width => {
      await win.evaluate((w, width) => { w.setMinimumSize(320, 400); w.setContentSize(width, 680); }, width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    };
    const tooltip = async (button, label) => {
      await button.hover();
      const tip = page.getByRole('tooltip').filter({ hasText: label });
      await expect(tip).toHaveText(label);
      assert((await tip.boundingBox()).y >= 48);
    };
    const close = async target => {
      if (await target.getByRole('button', { name: 'Esc', exact: true }).count()) {
        await target.getByRole('button', { name: 'Esc', exact: true }).click();
      } else {
        await page.keyboard.press('Escape');
      }
      await expect(target).toBeHidden();
      await expect(page.locator('.desk-backdrop, .command-popup')).toHaveCount(0);
    };
    const waitForMode = async label => {
      await expect(switcher()).toHaveAttribute('aria-label', label);
      await expect.poll(() => win.evaluate(w => w.isVisible() && w.getOpacity() === 1)).toBe(true);
    };
    const changeMode = async label => { await switcher().click(); await waitForMode(label); };
    await page.locator('.quick-title').fill('模式切换验收');
    await page.locator('.quick-input').fill('切换模式后保留草稿。');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(async theme => { document.documentElement.dataset.theme = theme; await window.desktop.settings({ theme }); }, theme);
      await expect(page.locator('.quick-header .xigra-note-actions')).toHaveCount(0);
      const enabledLayout = await checkLayout();
      await page.locator('.quick-title').dispatchEvent('compositionstart');
      await expect(switcher()).toBeDisabled();
      await expect(actions.first()).toBeDisabled();
      assert.equal(await switcher().evaluate(el => getComputedStyle(el).opacity), '0.45');
      assert.deepEqual(await checkLayout(), enabledLayout);
      await page.locator('.quick-title').dispatchEvent('compositionend');
      await expect(switcher()).toBeEnabled();
      for (const width of [1440, 820, 390]) {
        await resize(width);
        const pair = [];
        for (const mode of ['quick', 'workspace']) {
          const destination = mode === 'quick' ? '切换到工作区' : '切换到便签区';
          await expect(switcher()).toHaveAttribute('aria-label', mode === 'quick' ? '切换到工作区' : '切换到便签区');
          const geometry = await checkLayout();
          await page.mouse.move(1, 1); await settle();
          const initial = await state();
          assert.equal(initial.bg, 'rgba(0, 0, 0, 0)'); assert(initial.inBounds);
          if (width === 820) {
            await tooltip(actions.nth(0), '搜索便签');
            await actions.nth(0).click(); await expect(page.getByRole('dialog')).toBeVisible(); await close(page.getByRole('dialog'));
            await tooltip(switcher(), destination);
            await tooltip(actions.nth(2), '快捷操作 · Ctrl+K');
            await actions.nth(2).click();
            const commands = page.locator('.command-popup');
            await expect(commands).toBeVisible();
            if (mode === 'workspace') {
              const input = commands.getByRole('combobox', { name: '搜索命令' });
              await expect(input).toHaveAttribute('placeholder', '搜索操作…');
              await input.fill('便笺');
              await expect(commands.getByRole('option')).toHaveCount(0);
              await input.fill('设置');
              await expect(commands.getByRole('option', { name: /设置与快捷键/ })).toBeVisible();
            } else {
              await expect(commands.getByRole('option', { name: /写一张便笺/ })).toBeVisible();
            }
            await close(commands);
            await tooltip(actions.nth(3), '共享与设备');
            await actions.nth(3).click(); await expect(page.getByRole('dialog')).toBeVisible(); await close(page.getByRole('dialog'));
            await page.keyboard.press('Control+k'); await expect(page.locator('.command-popup')).toBeVisible();
            await waitForMode('切换到便签区');
            await close(page.locator('.command-popup'));
            if (mode === 'quick') { await changeMode('切换到工作区'); await resize(width); }
          }
          await switcher().hover(); await settle(); const hover = await state();
          assert.notEqual(initial.bg, hover.bg);
          await page.mouse.down(); await settle(); const pressed = await state();
          assert.notEqual(hover.bg, pressed.bg); assert.equal(pressed.shadow, 'none');
          assert.equal(initial.width, pressed.width); assert.equal(initial.weight, pressed.weight);
          await page.mouse.move(1, 65); await page.mouse.up();
          await switcher().evaluate(el => { const p = document.createElement('button'); p.id = 'prior'; el.before(p); p.focus(); });
          await page.keyboard.press('Tab'); await page.locator('#prior').evaluate(el => el.remove());
          await expect(switcher()).toBeFocused();
          assert.equal((await state()).outline, '2px');
          metrics.push({ theme, width, mode, geometry, initial, hover, pressed }); pair.push(geometry);
          const originalButton = await switcher().elementHandle();
          await page.keyboard.press('Enter');
          await waitForMode(mode === 'quick' ? '切换到便签区' : '切换到工作区');
          assert(await originalButton.evaluate(el => el === document.querySelector('.mode-switch-button')));
          await originalButton.dispose();
          await resize(width);
        }
        assert.deepEqual(pair[0], pair[1], `${theme}/${width}: action layout changed after mode switch`);
      }
      for (const mode of ['quick', 'workspace']) {
        await resize(mode === 'quick' ? 620 : 1160);
        await page.evaluate(() => document.activeElement.blur());
        await page.mouse.move(1, 65);
        await checkLayout(); await capture(`${mode}-${theme}-normal`);
        await win.evaluate(w => w.maximize());
        await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
        await checkLayout(); await capture(`${mode}-${theme}-maximized`);
        if (mode === 'quick') {
          await win.evaluate(w => w.unmaximize());
          await changeMode('切换到便签区');
        } else {
          await changeMode('切换到工作区');
          await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
          await changeMode('切换到便签区');
          await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
          await win.evaluate(w => w.unmaximize());
          await changeMode('切换到工作区');
        }
      }
    }
    await expect(page.locator('.quick-title')).toHaveValue('模式切换验收');
    await expect(page.locator('.quick-input')).toHaveValue('切换模式后保留草稿。');
    await changeMode('切换到便签区'); await resize(1160);
    await page.locator('.sidebar').getByRole('button', { name: '我的随手页', exact: true }).click();
    const paper = page.getByTestId('paper');
    await expect(paper).toBeVisible();
    const camera = () => paper.evaluate(el => el.style.transform);
    const transform = await camera();
    await changeMode('切换到工作区'); await changeMode('切换到便签区');
    await expect(paper).toBeVisible();
    await expect.poll(camera).toBe(transform);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'metrics.json'), JSON.stringify(metrics, null, 2));
    console.log(`PASS: ${metrics.length} mode/theme/width combinations, states, shortcuts, native captures, draft and canvas retention`);
  } finally { await app?.close(); await fs.rm(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
