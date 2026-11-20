const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function verify() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-lan-desktop-'));
  const apps = [];
  const output = process.env.ARASN_TEST_SCREENSHOTS;
  async function launch(name, shortcut) {
    const directory = path.join(root, name);
    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'settings.json'), JSON.stringify({ theme: 'light', shortcut }));
    const env = { ...process.env, ARASN_DATA_DIR: directory, ARASN_SMOKE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({ args: ['.'], env, cwd: path.resolve(__dirname, '..') });
    apps.push(app);
    // Keep both instances on loopback and prevent any mDNS traffic during automation.
    await app.evaluate(({ Notification }, deviceName) => {
      const os = process.getBuiltinModule('node:os');
      os.networkInterfaces = () => ({ test: [{ address: '127.0.0.1', internal: false }] });
      os.hostname = () => deviceName;
      Notification.isSupported = () => false;
    }, name === 'sender' ? '发送测试机' : '接收测试机');
    const page = await app.firstWindow();
    const window = await app.browserWindow(page);
    page.setDefaultTimeout(8000);
    await window.evaluate(window => { window.show(); window.focus(); });
    await expect(page.getByRole('textbox', { name: '便签标题' })).toBeVisible();
    return { page, window };
  }

  try {
    const sender = await launch('sender', 'Control+Alt+F13');
    const receiver = await launch('receiver', 'Control+Alt+F14');
    for (const { page } of [sender, receiver]) {
      await page.getByRole('button', { name: '设备互传', exact: true }).click();
      await page.getByRole('button', { name: '打开便签互传', exact: true }).click();
      await page.getByRole('button', { name: '开启局域网', exact: true }).click();
      await expect(page.getByRole('button', { name: '关闭局域网', exact: true })).toBeVisible();
    }
    await expect(sender.page.evaluate(() => window.desktop.share(true))).rejects.toThrow('先关闭便签传送');
    const invitation = device => device.page.evaluate(() => window.desktop.lan.invite());
    const [a, b] = await Promise.all([invitation(sender), invitation(receiver)]);
    for (const [{ page }, peer] of [[sender, b], [receiver, a]]) {
      await page.getByText('设备配对与撤销', { exact: true }).click();
      await page.getByLabel('对方的配对信息').fill(peer.code);
      await page.getByLabel('已核对的对方 SHA-256 指纹').fill(peer.fingerprint);
      await page.getByRole('button', { name: '保存配对', exact: true }).click();
      await expect(page.getByRole('button', { name: '撤销配对', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '关闭便签互传', exact: true }).click();
    }
    await receiver.window.evaluate(window => window.setSize(740, 526));
    await receiver.page.waitForFunction(() => innerWidth < 760 && innerHeight < 530);
    await expect.poll(() => receiver.page.locator('.sidebar-bottom').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight)).toBe(true);
    const editor = page => page.locator('.xigra-record-editor');
    const note = '会后确认\n周三前发出版本。';
    await editor(sender.page).fill(note);
    await expect(sender.page.locator('.xigra-record-workspace .save-state')).toHaveText('已保存');
    await sender.page.getByRole('button', { name: '管理当前便笺' }).click();
    await sender.page.getByRole('menuitem', { name: '发送到局域网设备' }).click();
    await sender.page.getByRole('button', { name: '发送便签', exact: true }).click();
    await expect(sender.page.getByText('等待对方确认')).toBeVisible();

    await receiver.window.evaluate(window => window.focus());
    const inboxButton = receiver.page.getByRole('button', { name: '待接收便签，1 条', exact: true });
    await expect(inboxButton).toBeVisible();
    await expect.poll(() => receiver.page.locator('.window-navigation').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await inboxButton.click();
    const inbox = receiver.page.getByRole('region', { name: '待接收便签' });
    await expect(inbox.getByText('文字便签')).toBeVisible();
    await expect(inbox).not.toContainText('会后确认');
    await expect(editor(receiver.page)).toHaveValue('');
    if (output) {
      await fs.mkdir(output, { recursive: true });
      await receiver.page.screenshot({ path: path.join(output, 'incoming.png'), animations: 'disabled' });
    }
    await receiver.page.getByRole('button', { name: '接收便签', exact: true }).click();
    await expect(receiver.page.getByText('已保存到便签')).toBeVisible({ timeout: 10000 });
    await expect(sender.page.getByText('对方已保存')).toBeVisible({ timeout: 10000 });
    await receiver.page.getByRole('button', { name: '关闭便签互传', exact: true }).click();
    const openLibrary = receiver.page.getByRole('button', { name: '展开便签库', exact: true });
    if (await openLibrary.isVisible()) await openLibrary.click();
    await receiver.page.locator('#record-library').getByRole('button', { name: /^会后确认/ }).click();
    await expect(editor(receiver.page)).toHaveValue(note);
    console.log('PASS two Electron processes: DPAPI identities, paired send, explicit accept, durable ACK and received text');
  } finally {
    for (const app of apps.reverse()) await app.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
