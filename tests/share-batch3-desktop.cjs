const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-share3-'));
  const output = path.resolve('docs/screenshots/share-batch3', process.env.ARASN_SHARE_PASS || 'pass1');
  await fs.mkdir(output, { recursive: true });
  const store = createStore(path.join(data, 'board.json')), id = randomUUID();
  store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text: '共享关闭后保留这张便签与工作位置', x: 100, y: 100, color: '#263449' } });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F22' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win; const errors = [], checks = [], contrasts = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const shareState = () => page.locator('[data-share-state]');
  const shot = name => page.screenshot({ path: path.join(output, `${name}.png`), scale: 'css', animations: 'disabled' });
  const open = async () => { await button('设备互传').click(); await button('打开白板共享').click(); await expect(shareState()).toBeVisible(); };
  const size = async width => {
    await win.evaluate((w, width) => { w.unmaximize(); w.setMinimumSize(350, 460); w.setContentSize(width, 900); }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
  };
  const info = () => page.evaluate(() => window.desktop.info());
  const mode = value => app.evaluate((_, value) => { globalThis.__share3Mode = value; }, value);
  function contrast(foreground, background) {
    const luminance = value => value.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }
  async function stateThemes(name) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
      const colors = await page.locator('.share-status-line').evaluate(el => ({ theme: document.documentElement.dataset.theme, state: el.parentElement.dataset.shareState, text: getComputedStyle(el).color, background: getComputedStyle(el.parentElement).backgroundColor }));
      colors.ratio = contrast(colors.text, colors.background); assert(colors.ratio >= 4.5, JSON.stringify(colors)); contrasts.push(colors);
      await shot(`${theme}-${name}`);
    }
  }
  async function matrix(state) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
      for (const width of [1440, 820, 390]) {
        await size(width);
        await expect(page.getByRole('dialog')).toBeVisible();
        assert(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await button(state === 'active' ? '停止共享' : '开启共享').scrollIntoViewIfNeeded();
        await shot(`${theme}-${state}-${width}`);
      }
      await size(1440); await button('返回设备互传').scrollIntoViewIfNeeded();
      if (state === 'active') await captureNativeWindow(app, page, path.join(output, `${theme}-active-windows.png`));
      const colors = await page.locator('.share-status-line').evaluate(el => ({ theme: document.documentElement.dataset.theme, state: el.parentElement.dataset.shareState, text: getComputedStyle(el).color, background: getComputedStyle(el.parentElement).backgroundColor }));
      colors.ratio = contrast(colors.text, colors.background); assert(colors.ratio >= 4.5, JSON.stringify(colors)); contrasts.push(colors);
      if (state === 'off') {
        const primary = await button('开启共享').evaluate(el => ({ theme: document.documentElement.dataset.theme, state: 'primary', text: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor }));
        primary.ratio = contrast(primary.text, primary.background); assert(primary.ratio >= 4.5, JSON.stringify(primary)); contrasts.push(primary);
      }
    }
  }
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.setDefaultTimeout(12000); page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-title:enabled').waitFor();
    win = await app.browserWindow(page); await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    await app.evaluate(async ({ clipboard, ClipboardItem, ipcMain }) => {
      globalThis.__share3Clipboard = await Promise.all((await clipboard.read()).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
      const os = process.getBuiltinModule('node:os');
      globalThis.__share3Networks = [['Wi-Fi 办公网络', '127.0.0.1'], ['vEthernet 测试虚拟网卡', '127.0.0.2']];
      os.networkInterfaces = () => Object.fromEntries(globalThis.__share3Networks.map(([name, address]) => [name, [{ address, family: 'IPv4', internal: false }]]));
      const original = ipcMain._invokeHandlers.get('app:share');
      ipcMain.removeHandler('app:share'); ipcMain.handle('app:share', async (event, enabled, host) => {
        if (globalThis.__share3Mode === 'gate' && enabled) await new Promise(resolve => { globalThis.__share3Release = resolve; });
        if (globalThis.__share3Mode === 'fail-start' && enabled) throw Error('验收：网络暂时不可用，请检查网卡后重试');
        if (globalThis.__share3Mode === 'fail-stop' && !enabled) throw Error('验收：停止共享失败，服务仍在运行');
        return original(event, enabled, host);
      });
      const originalInfo = ipcMain._invokeHandlers.get('app:info');
      ipcMain.removeHandler('app:info'); ipcMain.handle('app:info', async event => {
        if (globalThis.__share3Mode === 'gate-refresh') await new Promise(resolve => { globalThis.__share3Release = resolve; });
        if (globalThis.__share3Mode === 'fail-refresh') throw Error('验收：网络列表刷新失败');
        return originalInfo(event);
      });
    });
    await page.evaluate(() => window.desktop.layout(true)); await button('我的随手页').click(); await size(1440);
    await page.locator('.paper-scroll').waitFor();
    await page.evaluate(() => { window.__share3Paper = document.querySelector('.paper-scroll'); });
    await open(); await expect(shareState()).toHaveAttribute('data-share-state', 'off');
    await expect(page.locator('.xigra-share .primary')).toHaveCount(1);
    await expect(page.locator('.share-device-icon svg')).toHaveClass(/lucide-network/);
    await expect(button('开启共享')).toBeEnabled(); await matrix('off');
    checks.push('off/active hierarchy and no overflow at 1440/820/390 in both themes');
    await mode('gate'); await button('开启共享').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'starting');
    await expect(button('正在开启…')).toBeDisabled(); await expect(button('刷新网络')).toBeDisabled();
    await stateThemes('starting'); await mode(''); await app.evaluate(() => globalThis.__share3Release());
    await expect(shareState()).toHaveAttribute('data-share-state', 'active');
    assert.equal((await info()).sharing, true);
    await expect(page.getByRole('combobox', { name: '共享网卡', exact: true })).toBeDisabled();
    await expect(page.locator('.xigra-share .primary')).toHaveCount(0);
    await matrix('active');
    await expect(page.locator('.share-privacy')).toContainText('本机文件、附件和关系画布不共享');
    await win.evaluate(w => { w.setContentSize(390, 700); }); await expect.poll(() => page.evaluate(() => innerHeight)).toBe(700);
    await button('停止共享').scrollIntoViewIfNeeded(); await shot('dark-active-390x700');
    await page.locator('.share-privacy').scrollIntoViewIfNeeded(); await shot('dark-active-390x700-bottom');
    assert(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await size(1440);
    const link = await page.getByRole('textbox', { name: '共享链接', exact: true }).inputValue();
    await button('复制共享链接').click();
    assert.equal(await app.evaluate(async ({ clipboard }) => {
      const item = (await clipboard.read()).find(item => item.types.includes('text/plain'));
      return item ? (await item.getType('text/plain')).text() : '';
    }), link);
    await expect(page.locator('.app-notification-message')).toHaveText('已复制');
    await mode('gate-refresh'); await button('刷新网络').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'active'); await expect(shareState()).toContainText('正在刷新网络');
    await expect(button('正在刷新…')).toBeDisabled(); await shot('refreshing');
    await mode(''); await app.evaluate(() => globalThis.__share3Release());
    await expect(button('刷新网络')).toBeEnabled();
    await mode('fail-refresh'); await button('刷新网络').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'failed'); await expect(page.getByRole('alert')).toContainText('网络列表刷新失败');
    await mode(''); assert.equal((await info()).sharing, true); await button('重试').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'active');
    checks.push('explicit starting state, disabled busy controls, shared service, native clipboard and refresh');
    await mode('fail-stop'); await button('停止共享').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'failed');
    await expect(page.getByRole('alert')).toContainText('停止共享失败');
    await expect(shareState()).toContainText('共享服务仍在运行'); assert.equal((await info()).sharing, true);
    await stateThemes('stop-failed'); await mode(''); await button('重试').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'off'); assert.equal((await info()).sharing, false);
    await mode('fail-start'); await button('开启共享').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'failed'); await expect(page.getByRole('alert')).toContainText('检查网卡');
    await stateThemes('start-failed'); await mode(''); await button('重试').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'active');
    await app.evaluate(() => { globalThis.__share3Networks = []; }); await button('刷新网络').click();
    await expect(shareState()).toHaveAttribute('data-share-state', 'failed'); await expect(page.getByRole('alert')).toContainText('监听地址已不可用');
    await shot('address-lost'); await button('停止共享').click(); await expect(button('开启共享')).toBeDisabled();
    await app.evaluate(() => { globalThis.__share3Networks = [['Wi-Fi 办公网络', '127.0.0.1']]; });
    await button('刷新网络').click(); await expect(button('开启共享')).toBeEnabled();
    checks.push('start/stop failure reason and retry, running service truth, lost address and no-network safety');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await button('开启共享').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
    await button('返回设备互传').focus();
    await page.keyboard.press('Tab'); await expect(button('使用说明')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(page.locator('.network-help-popup')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('.network-help-popup')).toBeHidden();
    await expect(button('使用说明')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(page.getByRole('combobox', { name: '共享网卡', exact: true })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(button('刷新网络')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(button('开启共享')).toBeFocused();
    assert.equal(await button('开启共享').evaluate(el => el.matches(':focus-visible')), true);
    assert.equal(await button('开启共享').evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
    await shot('keyboard-focus'); await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.mouse.move(10, 10);
    await expect.poll(() => button('刷新网络').evaluate(el => el.matches(':hover'))).toBe(false);
    const idle = await button('刷新网络').evaluate(el => { getComputedStyle(el).backgroundColor; el.getAnimations().forEach(animation => animation.finish()); return getComputedStyle(el).backgroundColor; });
    await button('刷新网络').hover();
    await expect.poll(() => button('刷新网络').evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(idle);
    await page.mouse.down();
    assert.equal(await button('刷新网络').evaluate(el => el.matches(':active')), true); await shot('secondary-pressed');
    await page.mouse.up(); await expect(button('刷新网络')).toBeEnabled();
    for (const method of ['close', 'escape', 'back', 'switch']) {
      if (method !== 'close') await open();
      await page.evaluate(() => { window.__share3Frames = []; window.__share3Observer = new MutationObserver(() => window.__share3Frames.push([...document.querySelectorAll('[role="dialog"]')].map(el => el.getAttribute('aria-label')))); window.__share3Observer.observe(document.body, { subtree: true, childList: true, attributes: true }); });
      if (method === 'close') await button('关闭弹窗').click();
      if (method === 'escape') await page.keyboard.press('Escape');
      if (method === 'back') { await button('返回设备互传').click(); await expect(page.getByRole('dialog', { name: '设备互传', exact: true })).toBeVisible(); await button('关闭弹窗').click(); }
      if (method === 'switch') { await page.evaluate(() => window.desktop.layout(false)); await expect(page.getByRole('dialog')).toBeHidden(); await page.evaluate(() => window.desktop.layout(true)); }
      await expect(page.getByRole('dialog')).toBeHidden();
      const frames = await page.evaluate(() => { window.__share3Observer.disconnect(); return window.__share3Frames.flat(); });
      assert(!frames.includes('设置'), `${method}: intermediate settings frame`);
      assert(await page.evaluate(() => window.__share3Paper === document.querySelector('.paper-scroll')));
    }
    checks.push('keyboard focus/reduced motion and close/Esc/back/native-switch preserve canvas DOM without settings frame');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'results.json'), JSON.stringify({ checks, contrasts, errors }, null, 2));
    console.log(`PASS share batch3: ${checks.length} groups; light/dark/responsive/states/retry/clipboard/keyboard/window return`);
  } catch (error) { if (page && !page.isClosed()) await shot('failure').catch(() => {}); throw error; }
  finally {
    if (app) {
      await app.evaluate(async ({ clipboard }) => { if (globalThis.__share3Clipboard) await clipboard.write(globalThis.__share3Clipboard); }).catch(() => {});
      await app.close();
    }
    const resolved = await fs.realpath(data); assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir()));
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
