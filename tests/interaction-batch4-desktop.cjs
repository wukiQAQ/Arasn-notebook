const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-interaction4-'));
  const shots = path.resolve('docs/screenshots/interaction-batch4', process.env.ARASN_B4_PASS || 'pass1');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const publicId = randomUUID(), privateId = randomUUID();
  const text = { type: 'text', text: '共享正文', x: 100, y: 100, color: '#263449' };
  store.apply({ id: publicId, opId: randomUUID(), expected: 0, value: text });
  store.apply({ id: privateId, opId: randomUUID(), expected: 0, value: { type: 'node', text: '本机私有节点', topology: { x: 0, y: 0, width: 240, height: 140, kind: 'note', status: 'open' } } });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F19' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win; const errors = [];
  const btn = name => page.getByRole('button', { name, exact: true });
  const capture = name => page.screenshot({ path: path.join(shots, `${name}.png`), animations: 'disabled', scale: 'css' });
  const ipcInfo = () => page.evaluate(() => window.desktop.info());
  const networks = async rows => app.evaluate((_, rows) => {
    const os = process.getBuiltinModule('node:os');
    os.networkInterfaces = () => Object.fromEntries(rows.map(([name, address]) => [name, [{ address, family: 'IPv4', internal: false }]]));
  }, rows);
  const normalNetworks = [['vEthernet (WSL · 测试虚拟网卡)', '127.0.0.2'], ['Wi-Fi 办公网络', '127.0.0.1']];
  async function sized(width, name) {
    await win.evaluate((w, width) => { w.setMinimumSize(350, 460); w.setContentSize(width, 900); }, width);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    await capture(name);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert(await page.getByRole('dialog').evaluate(e => e.scrollWidth <= e.clientWidth + 1));
  }
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
    win = await app.browserWindow(page); await win.evaluate(w => { w.setContentSize(1440, 900); w.show(); w.focus(); });
    await networks(normalNetworks);
    await btn('打开工作区').click(); await btn('设备互传').click(); await btn('打开便签互传').click();
    const network = page.getByRole('combobox', { name: '私有网卡', exact: true });
    await expect(network).toContainText('Wi-Fi 办公网络');
    await network.focus(); await page.keyboard.press('Space'); await expect(page.getByRole('listbox')).toBeVisible();
    await capture('network-options'); await page.keyboard.press('Escape'); await expect(network).toBeFocused();
    await sized(1440, 'lan-light-1440');
    for (const width of [820, 390]) await sized(width, `lan-light-${width}`);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); await capture('lan-dark-390');
    await btn('开启局域网').click(); await expect(btn('关闭局域网')).toBeVisible(); await expect(network).toBeDisabled();
    await expect(page.getByRole('region', { name: '局域网状态' })).toContainText('切换网卡需先关闭');
    await networks([]); await btn('刷新网络').click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('监听地址已不可用'); await capture('lan-address-lost');
    await btn('关闭局域网').click(); await expect(btn('开启局域网')).toBeDisabled();
    await networks(normalNetworks); await btn('刷新网络').click(); await expect(network).toContainText('Wi-Fi');
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);

    await btn('设备互传').click(); await btn('打开白板共享').click();
    await expect(page.getByRole('combobox', { name: '共享网卡', exact: true })).toContainText('Wi-Fi');
    await expect(page.getByRole('dialog')).toContainText('无需设备批准');
    await selectOption(page, '共享网卡', '127.0.0.2'); await btn('开启共享').click();
    await expect(btn('停止共享')).toBeVisible(); await expect(page.getByRole('combobox', { name: '共享网卡', exact: true })).toBeDisabled();
    let info = await ipcInfo(); assert.equal(info.shareHost, '127.0.0.2'); assert.equal(info.links.length, 1);
    const link = new URL(info.links[0]), base = link.origin, token = link.hash.slice(1);
    for (const auth of ['', 'Bearer wrong']) assert.equal((await fetch(`${base}/api/board`, { headers: { Authorization: auth } })).status, 401);
    const response = await fetch(`${base}/api/board`, { headers: { Authorization: `Bearer ${token}` } }); assert.equal(response.status, 200);
    const snapshot = await response.json(); assert(snapshot.items[publicId]); assert(!snapshot.items[privateId]);
    const post = body => fetch(`${base}/api/ops`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ id: privateId, expected: 1, opId: randomUUID(), value: null })).status, 403);
    assert.equal((await post({ id: publicId, expected: 1, opId: randomUUID(), value: { ...text, text: '远端已修改' } })).status, 200);
    await expect(page.evaluate(() => window.desktop.share(true, '127.0.0.1'))).rejects.toThrow('先停止共享');
    await expect(page.evaluate(() => window.desktop.lan.start('127.0.0.1'))).rejects.toThrow('先关闭旧白板共享');
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      for (const width of [1440, 820, 390]) await sized(width, `share-${theme}-${width}`);
    }
    await networks([['Wi-Fi 办公网络', '127.0.0.1']]); await btn('刷新网络').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('监听地址已不可用'); assert.equal((await ipcInfo()).links.length, 0);
    await capture('share-address-lost');
    // Stop failure stays active; injection affects only this process and only the isolated server.
    await app.evaluate((_, port) => {
      const server = process._getActiveHandles().find(handle => handle.address?.()?.port === port);
      global.b4Server = server; global.b4Close = server.close;
      server.close = callback => { callback(new Error('fixture: 停止共享失败')); };
    }, Number(link.port));
    await btn('停止共享').click(); await expect(page.getByRole('dialog').getByRole('alert').filter({ hasText: '停止共享失败' })).toBeVisible(); assert.equal((await ipcInfo()).sharing, true);
    await app.evaluate(() => { global.b4Server.close = global.b4Close; });
    await btn('停止共享').click(); await expect(btn('开启共享')).toBeVisible();
    await assert.rejects(fetch(`${base}/api/board`, { headers: { Authorization: `Bearer ${token}` } }));
    await btn('开启共享').click(); await expect(btn('停止共享')).toBeVisible(); info = await ipcInfo(); assert.notEqual(new URL(info.links[0]).hash.slice(1), token);
    assert.equal((await fetch(`${new URL(info.links[0]).origin}/api/board`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    await btn('停止共享').click();
    await networks([['未绑定的测试网卡', '10.253.254.253']]); await btn('刷新网络').click(); await btn('开启共享').click();
    await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible(); assert.equal((await ipcInfo()).sharing, false); await capture('share-bind-error');
    await networks(normalNetworks); await btn('刷新网络').click(); await page.keyboard.press('Escape');

    await btn('设置与快捷键').click(); await expect(page.getByLabel('开机自启动', { exact: true })).toBeDisabled(); await capture('startup-development');
    // Mock Electron's system adapter, never the real Windows startup registry.
    await app.evaluate(({ app }) => {
      Object.defineProperty(app, 'isPackaged', { configurable: true, get: () => true });
      delete process.env.PORTABLE_EXECUTABLE_FILE; delete process.env.PORTABLE_EXECUTABLE_DIR;
      global.b4Login = { openAtLogin: false, executableWillLaunchAtLogin: false }; global.b4Writes = [];
      app.getLoginItemSettings = () => global.b4Login;
      app.setLoginItemSettings = value => {
        global.b4Writes.push(value);
        if (!global.b4Silent) global.b4Login = { openAtLogin: value.openAtLogin, executableWillLaunchAtLogin: value.openAtLogin && value.enabled };
      };
    });
    await btn('刷新系统状态').click(); const startup = page.getByLabel('开机自启动', { exact: true }); await expect(startup).toBeEnabled();
    await startup.check(); await expect(page.locator('[data-startup-status]')).toHaveAttribute('data-startup-status', 'enabled');
    await capture('startup-verified');
    await app.evaluate(() => { global.b4Login = { openAtLogin: true, executableWillLaunchAtLogin: false }; });
    await btn('刷新系统状态').click(); await expect(page.locator('[data-startup-status]')).toHaveAttribute('data-startup-status', 'blocked'); await capture('startup-system-disabled');
    await startup.uncheck(); await expect(page.locator('[data-startup-status]')).toHaveAttribute('data-startup-status', 'disabled');
    await app.evaluate(() => { global.b4Silent = true; }); await startup.click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('核验失败'); await expect(startup).not.toBeChecked(); await capture('startup-write-error');
    await app.evaluate(() => { global.b4Silent = false; });
    // A failure after OS registration must undo the registration too.
    await app.evaluate((_, filename) => {
      const { StorageEngine } = process.mainModule.require(filename);
      global.b4Storage = StorageEngine.prototype; global.b4StorageCall = StorageEngine.prototype.call;
      StorageEngine.prototype.call = function(method, ...args) { if (method === 'setSetting') return Promise.reject(new Error('fixture: 设置持久化失败')); return global.b4StorageCall.call(this, method, ...args); };
    }, path.resolve('desktop/engines/storage-engine.cjs'));
    await startup.click(); await expect(page.getByRole('dialog').getByRole('alert')).toContainText('设置持久化失败'); await expect(startup).not.toBeChecked(); assert.equal((await ipcInfo()).openAtLogin, false);
    await app.evaluate(() => { global.b4Storage.call = global.b4StorageCall; process.env.PORTABLE_EXECUTABLE_FILE = 'C:\\Fixture\\Arasn-Portable.exe'; });
    await btn('刷新系统状态').click(); await expect(startup).toBeDisabled(); await expect(page.locator('[data-startup-status]')).toContainText('便携版'); await capture('startup-portable');
    for (const width of [1440, 820, 390]) await sized(width, `settings-dark-${width}`);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); await capture('settings-light-390');
    await app.evaluate(() => { delete process.env.PORTABLE_EXECUTABLE_FILE; global.b4Login = { openAtLogin: false, executableWillLaunchAtLogin: false }; });
    await page.keyboard.press('Escape'); await btn('设置与快捷键').click(); await expect(startup).toBeEnabled();
    await expect(page.locator('[data-startup-status]')).toHaveAttribute('data-startup-status', 'disabled');
    assert.deepEqual(errors, []);
    console.log('PASS batch4: network names/options/keyboard/vanished address, scoped binding/auth/read-write isolation/token rotation/failure states, mocked startup readback/external disable/write failure/storage rollback/portable, 1440/820/390 light+dark');
  } catch (error) { if (page && !page.isClosed()) await capture('failure').catch(() => {}); throw error; }
  finally {
    if (app) await app.close();
    const resolved = await fs.realpath(data); assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir())); await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
