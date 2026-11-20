const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const phase = process.env.ARASN_SPACE_PHASE || 'after';
  const output = path.resolve('docs/screenshots/space-economy', phase);
  await fs.mkdir(output, { recursive: true });
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-space-'));
  const fixtures = ['项目备忘.txt', '会议议程.txt', '交付清单.txt'].map(name => path.join(data, name));
  await Promise.all(fixtures.map(file => fs.writeFile(file, '会议资料\n保留真实文件副本与便签引用。')));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app; const errors = [], checks = [];
  try {
    app = await electron.launch({ args: ['.'], env });
    const page = await app.firstWindow(), win = await app.browserWindow(page);
    page.on('pageerror', e => errors.push(e.message));
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
    const b = name => page.getByRole('button', { name, exact: true });
    const nav = name => page.locator('.sidebar').getByRole('button', { name, exact: true });
    const shot = name => page.screenshot({ path: path.join(output, name + '.png'), animations: 'disabled', scale: 'css' });
    await app.evaluate(({ dialog }, files) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: files }); }, fixtures);
    await page.locator('.quick-title').fill('会议资料'); await page.locator('.quick-input').fill('核对附件来源，再整理到工作页。');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await b('添加文件').click();
    if (phase === 'before') await expect(page.locator('.xigra-import-message')).toContainText('已存入 3 个文件');
    else { await expect(b('3 个附件')).toBeVisible(); await expect(page.locator('.app-notification')).toContainText('已添加'); }
    await shot('quick-import');
    if (phase !== 'before') {
      const editorHeight = await page.locator('.quick-content').evaluate(e => e.clientHeight);
      await page.locator('.app-notification').hover(); await page.waitForTimeout(3800); await expect(page.locator('.app-notification')).toBeVisible();
      await page.mouse.move(1, 1); await expect(page.locator('.app-notification')).toHaveCount(0, { timeout: 5000 });
      assert.equal(await page.locator('.quick-content').evaluate(e => e.clientHeight), editorHeight);
      await b('3 个附件').click(); await expect(page.locator('.attachment-popover')).toBeVisible();
      await expect(page.locator('.attachment-popover')).toContainText('本地导入'); await shot('quick-attachments');
      await page.locator('.attachment-popover').getByRole('button', { name: '发送到工作页', exact: true }).first().click();
      await expect.poll(() => page.evaluate(async () => { const data = await (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json(); return Object.values(data.items).filter(item => item.value?.type === 'free-file').length; })).toBe(1);
      await page.keyboard.press('Escape'); await expect(page.locator('.attachment-popover')).toHaveCount(0);
    }
    await b('切换到工作区').click(); await page.waitForTimeout(350);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
      for (const width of [1440, 720]) {
        await win.evaluate((w, width) => w.setContentSize(width, 900), width);
        await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
        await nav('文件').click(); await expect(page.locator('.file-row')).toHaveCount(3); await shot(`files-${theme}-${width}`);
        if (phase !== 'before') {
          await expect(page.locator('.file-row').first()).toContainText('本地导入');
          await expect(page.locator('.topbar .header-actions button:visible')).toHaveCount(1);
        }
        await nav('我的随手页').click(); await page.waitForTimeout(300);
        if (phase !== 'before' && width === 720) await expect(page.locator('.toolbar')).toHaveAttribute('data-dock-mode', 'fixed');
        await shot(`tools-${theme}-${width}`);
        checks.push({ theme, width, actualWidth: await page.evaluate(() => innerWidth) });
      }
      if (phase !== 'before') {
        await b('切换到便签区').click(); await page.waitForTimeout(350); await shot(`quick-status-${theme}`);
        await b('3 个附件').click(); await expect(page.locator('.attachment-popover')).toBeVisible(); await shot(`attachments-${theme}`);
        await page.keyboard.press('Escape'); await b('切换到工作区').click(); await page.waitForTimeout(350);
      }
    }
    if (phase !== 'before') {
      await win.evaluate(w => w.setContentSize(1440, 900)); await page.waitForTimeout(350);
      await page.evaluate(() => { window.spacePaper = document.querySelector('.paper'); });
      const handle = b('拖动工具板'); const rect = await handle.boundingBox();
      await page.mouse.move(rect.x + 15, rect.y + 15); await page.mouse.down(); await page.mouse.move(1400, 400, { steps: 18 }); await page.mouse.up();
      await expect(page.locator('.toolbar')).toHaveAttribute('data-dock-side', 'right'); await shot('tools-snapped-right');
      assert(await page.evaluate(() => window.spacePaper === document.querySelector('.paper')));
      const toolbarRect = await page.locator('.toolbar').boundingBox(), canvasRect = await page.locator('.paper-scroll').boundingBox();
      assert(toolbarRect.x >= canvasRect.x && toolbarRect.y >= canvasRect.y && toolbarRect.x + toolbarRect.width <= canvasRect.x + canvasRect.width + 1 && toolbarRect.y + toolbarRect.height <= canvasRect.y + canvasRect.height + 1);
      await page.reload(); await page.locator('.quick-title:enabled').waitFor({ state: 'attached' });
      if (await b('切换到工作区').isVisible()) await b('切换到工作区').click();
      await nav('我的随手页').click(); await page.waitForTimeout(350);
      await expect(page.locator('.toolbar')).toHaveAttribute('data-dock-side', 'right');
      await handle.dblclick(); await expect(page.locator('.toolbar')).toHaveAttribute('data-dock-side', 'left');
      await b('固定工具板').click(); await expect(handle).toHaveAttribute('aria-disabled', 'true');
      await b('解锁工具板').click();
      const persisted = await page.evaluate(async () => (await (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json()).items);
      assert.equal(Object.values(persisted).filter(item => item.value?.type === 'content-link').length, 3);
      assert(Object.values(persisted).some(item => item.value?.text === '核对附件来源，再整理到工作页。'));
      await b('切换到便签区').click(); await b('新建便笺').click();
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, fixtures[0]);
      await b('添加文件').click(); await expect(b('1 个附件')).toBeVisible();
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS ' + phase + ': imports, layouts, themes' + (phase !== 'before' ? ', attachment provenance, toast pause and tool docking' : ''));
  } finally { await app?.close(); await fs.rm(data, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
