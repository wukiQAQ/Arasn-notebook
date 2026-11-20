const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const root = path.resolve(__dirname, '..');
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-glass-'));
  const output = path.join(root, 'docs/screenshots/glass-search', process.env.ARASN_GLASS_PASS || 'final');
  await fs.mkdir(output, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const values = [
    { type: 'text', text: '本周计划\n整理资料，记录想法。\n视觉验收示例', x: 440, y: 300, color: '#4668c6', width: 280, height: 200 },
    { type: 'text', text: '设计讨论\n让重点清晰，让界面安静。\n搜索操作与便笺', x: 780, y: 390, color: '#39796b', width: 280, height: 180 },
    { type: 'stroke', color: '#d49b54', width: 7, points: [[400, 580], [650, 510], [900, 630], [1100, 540]] },
  ];
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [], metrics = [];
  try {
    for (const value of values) store.apply({ id: randomUUID(), value, opId: randomUUID(), expected: 0 });
    app = await electron.launch({ args: ['.'], cwd: root, env });
    page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-title:enabled').waitFor();
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    const button = name => page.getByRole('button', { name, exact: true });
    await button('打开工作区').click();
    await button('我的随手页').click();
    await win.evaluate(w => w.setContentSize(1440, 900));
    const popup = page.getByRole('dialog', { name: '搜索与快捷操作', exact: true });
    const input = page.getByRole('combobox', { name: '搜索命令' });
    const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled', scale: 'css' });
    const frames = () => page.evaluate(() => new Promise(resolve => {
      const intervals = []; let last;
      function frame(t) { if (last) intervals.push(t - last); last = t;
        if (intervals.length < 90) requestAnimationFrame(frame);
        else { const sorted = [...intervals].sort((a,b) => a-b); resolve({ median: sorted[45], p95: sorted[85], over34: intervals.filter(v => v > 34).length, frames: intervals.length }); }
      } requestAnimationFrame(frame);
    }));
    for (const theme of ['dark', 'light']) {
      await button('设置与快捷键').click();
      await selectOption(page, '外观主题', theme);
      await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
      await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
      await shot(`background-${theme}`);
      await button('搜索与快捷操作').click();
      await expect(popup).toBeVisible();
      await expect(input).toBeFocused();
      const style = await popup.evaluate(el => { const s = getComputedStyle(el); return { background: s.backgroundColor, image: s.backgroundImage, blur: s.backdropFilter, radius: s.borderRadius, shadow: s.boxShadow, border: s.borderTopWidth, color: s.color }; });
      assert(style.background.endsWith('0.78)'));
      assert.equal(style.blur, 'blur(10px) saturate(1.2)');
      assert.equal(style.radius, '16px');
      assert(parseFloat(style.border) > 0 && parseFloat(style.border) <= 1);
      assert.notEqual(style.shadow, 'none');
      assert.equal(await popup.locator('.glass-surface').count(), 0);
      assert.equal(await page.locator('.command-backdrop').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      await shot(`search-${theme}`);
      const blurred = await popup.screenshot({ path: path.join(output, `detail-${theme}.png`), animations: 'disabled', scale: 'css' });
      const sampleWithBlur = frames();
      await input.pressSequentially('settings files notes', { delay: 12 });
      const withBlur = await sampleWithBlur;
      await input.fill('');
      const disable = await page.addStyleTag({ content: '.command-popup.glass-surface { backdrop-filter: none !important; }' });
      await shot(`no-blur-${theme}`);
      const unblurred = await popup.screenshot({ path: path.join(output, `detail-no-blur-${theme}.png`), animations: 'disabled', scale: 'css' });
      const changedPixels = await app.evaluate(({ nativeImage }, pair) => {
        const a = nativeImage.createFromBuffer(Buffer.from(pair[0], 'base64'));
        const b = nativeImage.createFromBuffer(Buffer.from(pair[1], 'base64'));
        const { width, height } = a.getSize(), first = a.toBitmap(), second = b.toBitmap();
        let changed = 0;
        // Exclude the input/caret, selected first row, and footer.
        for (let y = 140; y < height - 45; y++) for (let x = 10; x < width - 10; x++) {
          const i = (y * width + x) * 4;
          if (Math.max(...[0,1,2].map(c => Math.abs(first[i+c] - second[i+c]))) > 3) changed++;
        }
        return changed;
      }, [blurred.toString('base64'), unblurred.toString('base64')]);
      assert(changedPixels > 100, `blur must visibly affect the background: ${changedPixels}`);
      const sampleWithoutBlur = frames();
      await input.pressSequentially('settings files notes', { delay: 12 });
      const withoutBlur = await sampleWithoutBlur;
      await input.fill('');
      await disable.evaluate(el => el.remove());
      await page.keyboard.press('ArrowDown');
      await expect(input).toHaveAttribute('aria-activedescendant', 'command-1');
      const started = Date.now();
      await input.fill('不存在的操作');
      await expect(page.getByText('没有匹配的操作，试试“文件”或“设置”。', { exact: true })).toBeVisible();
      const filterMs = Date.now() - started;
      await input.fill('设置');
      await expect(popup.getByRole('option')).toHaveCount(1);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeVisible();
      await button('关闭弹窗').click();
      metrics.push({ theme, style, changedPixels, withBlur, withoutBlur, filterMs });
      // Confirm shortcut, reset, Escape, focus return, and narrow layouts.
      await page.keyboard.press('Control+k');
      await expect(input).toHaveValue('');
      await page.keyboard.press('Escape');
      await expect(popup).toBeHidden();
      for (const [width, height] of [[820, 700], [390, 720]]) {
        await win.evaluate((w, size) => { w.setMinimumSize(350, 460); w.setContentSize(...size); }, [width, height]);
        await page.keyboard.press('Control+k');
        await expect(popup).toBeVisible();
        const bounds = await popup.boundingBox();
        assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height);
        assert(await popup.evaluate(el => el.scrollWidth <= el.clientWidth));
        await shot(`search-${theme}-${width}`);
        await page.keyboard.press('Escape');
      }
      await win.evaluate(w => w.setContentSize(1440, 900));
    }
    await button('搜索与快捷操作').click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    assert(await page.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches));
    assert.equal(await popup.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await popup.evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await page.emulateMedia({ forcedColors: 'active' });
    assert.equal(await popup.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
    await page.keyboard.press('Escape');
    assert.deepEqual(errors, []);
    const gpu = await app.evaluate(({ app }) => app.getGPUFeatureStatus());
    await fs.writeFile(path.join(output, 'metrics.json'), JSON.stringify({ metrics, gpu }, null, 2));
    console.log('PASS glass: single bounded blur, translucent themes, 16px, contrast states, focus/search/filter/Enter/Escape/Ctrl+K, 1440/820/390, reduced motion, forced colors, no renderer errors');
    console.log(JSON.stringify(metrics.map(({ theme, withBlur, withoutBlur, filterMs }) => ({ theme, withBlur, withoutBlur, filterMs }))));
  } catch(e) {
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw e;
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    await fs.rm(target, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
