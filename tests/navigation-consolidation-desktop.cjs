const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-navigation-'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const shots = path.resolve('docs/screenshots/navigation-consolidation'); await fs.mkdir(shots, { recursive: true });
  let app, page;
  const button = name => page.getByRole('button', { name, exact: true });
  try {
    app = await electron.launch({ ...(process.env.ARASN_TEST_EXE ? { executablePath: process.env.ARASN_TEST_EXE, args: [] } : { args: ['.'] }), cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); const errors = []; page.on('pageerror', error => errors.push(error.message));
    const win = await app.browserWindow(page); await win.evaluate(w => { w.show(); w.focus(); });
    await page.locator('.quick-panel textarea').fill('入口整合验证\n切换界面保留同一条记录。');
    await expect(button('展开工作站')).toHaveCount(0); await expect(button('打开工作区')).toHaveCount(1);
    await page.screenshot({ path: path.join(shots, 'quick-single-entry.png'), scale: 'css', animations: 'disabled' });
    await button('打开工作区').click(); await win.evaluate(w => w.setContentSize(1440, 900));
    await button('我的随手页').click();
    await expect(button('设备互传')).toHaveCount(1); await expect(button('文件')).toHaveCount(1);
    await expect(button('局域网共享')).toHaveCount(0); await expect(button('局域网传送')).toHaveCount(0);
    await expect(page.locator('.lagoon-tray')).toHaveCount(0);
    await page.screenshot({ path: path.join(shots, 'workspace-clean.png'), scale: 'css', animations: 'disabled' });
    await button('设备互传').click();
    await expect(page.getByRole('dialog', { name: '设备互传', exact: true })).toBeVisible();
    await expect(button('打开便签互传')).toBeVisible(); await expect(button('打开白板共享')).toBeVisible();
    await page.screenshot({ path: path.join(shots, 'device-hub.png'), scale: 'css', animations: 'disabled' });
    await page.evaluate(async () => { await window.desktop.settings({ theme: 'dark' }); document.documentElement.dataset.theme = 'dark'; });
    await page.screenshot({ path: path.join(shots, 'device-hub-dark.png'), scale: 'css', animations: 'disabled' });
    await button('打开便签互传').click(); await expect(button('关闭便签互传')).toBeVisible();
    await button('关闭便签互传').click();
    await button('设备互传').click(); await button('打开白板共享').click();
    await expect(page.getByRole('dialog', { name: '白板实时共享', exact: true })).toBeVisible();
    await button('关闭弹窗').click();
    await button('文件').click();
    for (const name of ['中转站', '面板文件', '回收站']) { await expect(button(name)).toBeVisible(); await button(name).click(); }
    await button('返回工作区').click();
    await button('切换到便签区').click(); await expect(page.locator('.quick-panel textarea')).toHaveValue('入口整合验证\n切换界面保留同一条记录。');
    await button('打开工作区').click();
    await win.evaluate(w => { w.setMinimumSize(350, 460); w.setContentSize(390, 720); });
    await button('设备互传').click();
    await expect(button('打开便签互传')).toBeVisible();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(shots, 'device-hub-390.png'), scale: 'css', animations: 'disabled' });
    assert.deepEqual(errors, []);
    console.log('PASS unique navigation, removed duplicate tray/buttons, two LAN flows, all file views, retained note, 1440/390px');
  } catch (error) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png') }).catch(() => {}); throw error; }
  finally { if (app) await app.close(); const target = await fs.realpath(data); assert.equal(path.dirname(target), await fs.realpath(os.tmpdir())); await fs.rm(target, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
