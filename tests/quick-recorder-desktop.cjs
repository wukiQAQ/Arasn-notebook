const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-recorder-'));
  const output = path.resolve('docs/screenshots/quick-recorder', process.env.ARASN_RECORDER_PASS || 'final');
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win;
  const errors = [], layouts = [];
  const launch = async () => {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow(); page.setDefaultTimeout(12000);
    page.on('pageerror', e => errors.push(e.message));
    win = await app.browserWindow(page); await win.evaluate(w => { w.show(); w.focus(); });
    await page.locator('.quick-title:enabled').waitFor();
  };
  const button = name => page.getByRole('button', { name, exact: true });
  const saved = () => expect(page.locator('.save-state')).toHaveText('已保存');
  const capture = async (name, width, height) => {
    await win.evaluate((w, size) => w.setContentSize(...size), [width, height]);
    await page.waitForFunction(w => innerWidth === w, width);
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(output, name + '.png'), scale: 'css', animations: 'disabled' });
    const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
      footerBottom: document.querySelector('.quick-footer').getBoundingClientRect().bottom,
      bodyHeight: document.querySelector('.quick-input').getBoundingClientRect().height,
      createBackground: getComputedStyle(document.querySelector('.xigra-quick-create')).backgroundColor,
    }));
    layouts.push(layout); assert.ok(!layout.overflow && layout.footerBottom <= layout.height && layout.bodyHeight > 150, JSON.stringify(layout));
  };
  try {
    await launch();
    await expect(page.locator('.quick-input')).toBeFocused();
    await capture('empty-620', 620, 700);
    await page.locator('.quick-input').fill('整理今天的想法，先记下来。\n把相关资料放在一起，稍后加入关系画布。');
    await page.locator('.quick-title').fill('产品讨论与后续安排'); await saved();
    await page.locator('.quick-title').evaluate(e => e.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await expect(button('新建便笺')).toBeDisabled();
    await expect(page.locator('.quick-input-state')).toHaveText('正在输入…');
    await page.locator('.quick-title').evaluate(e => e.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: e.value })));
    await saved();
    await page.locator('.quick-title').press('Enter'); await expect(page.locator('.quick-input')).toBeFocused();
    await button('新建便笺').click(); await expect(page.locator('.quick-title')).toHaveValue(''); await expect(page.locator('.quick-input')).toBeFocused();
    await page.locator('.quick-title').fill('周末阅读清单');
    await page.locator('.quick-input').fill('先读收藏的文章，再整理阅读笔记。'); await saved();
    await page.locator('.quick-input').evaluate(e => { e.focus(); e.setSelectionRange(3, 6); e.dispatchEvent(new Event('select', { bubbles: true })); });
    await button('产品讨论与后续安排').click(); await expect(page.locator('.quick-title')).toHaveValue('产品讨论与后续安排');
    await button('周末阅读清单').click(); await expect(page.locator('.quick-input')).toBeFocused();
    assert.equal(await page.locator('.quick-input').evaluate(e => e.selectionStart), 3);
    await page.locator('.quick-title').focus(); await page.locator('.quick-title').evaluate(e => e.setSelectionRange(2, 4));
    await button('产品讨论与后续安排').click(); await button('周末阅读清单').click();
    await expect(page.locator('.quick-title')).toBeFocused();
    assert.equal(await page.locator('.quick-title').evaluate(e => e.selectionStart), 2);
    await button('搜索便签').click();
    await page.getByRole('searchbox').fill('产品讨论'); await page.getByRole('dialog').getByRole('button', { name: /产品讨论与后续安排/ }).click();
    await expect(page.locator('.quick-title')).toHaveValue('产品讨论与后续安排');
    const source = path.join(data, '讨论资料.txt'); await fs.writeFile(source, '附件验收');
    await app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] }); }, source);
    await button('添加文件').click(); await expect(page.locator('.xigra-import-message')).toContainText('已存入 1 个文件');
    await button('加入关系画布').click(); await expect(page.locator('.quick-canvas-result')).toContainText('备份并启用');
    await button('打开工作区').click(); await button('打开关系画布').click();
    await button('备份并启用关系画布').click(); await expect(button('新建节点')).toBeEnabled();
    await expect(page.locator('.topology-node').filter({ hasText: '产品讨论与后续安排' })).toHaveCount(1);
    await button('切换到便签区').click();
    await button('加入关系画布').click(); await expect(page.locator('.quick-canvas-result')).toContainText('已在关系画布中');
    await button('新建便笺').click(); await page.locator('.quick-input').fill('下一次讨论需要确认的事情');
    await button('加入关系画布').click(); await expect(page.locator('.quick-canvas-result')).toContainText('已加入关系画布');
    await button('产品讨论与后续安排').click();
    await capture('note-620', 620, 700);
    await capture('compact-500', 500, 540);
    await win.evaluate(w => w.setMinimumSize(360, 400));
    await capture('narrow-390', 390, 700);
    await capture('wide-1440', 1440, 900);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await capture('medium-820', 820, 650);
    await saved(); await app.close(); app = null;
    await launch();
    // A fresh process may start a blank draft; named records remain available in recents.
    await button('产品讨论与后续安排').click();
    await expect(page.locator('.quick-title')).toHaveValue('产品讨论与后续安排');
    await expect(page.locator('.quick-input')).toHaveValue('整理今天的想法，先记下来。\n把相关资料放在一起，稍后加入关系画布。');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ layouts, errors, focusAndCaret: true, titleSearch: true, fileImport: true, canvas: true, restart: true }, null, 2));
    console.log('PASS recorder: title/body, focus/carets, search, files, canvas, restart, 5 widths');
  } finally {
    if (app) await app.close();
    const resolved = await fs.realpath(data);
    if (path.dirname(resolved) === await fs.realpath(os.tmpdir()) && path.basename(resolved).startsWith('arasn-recorder-')) await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
