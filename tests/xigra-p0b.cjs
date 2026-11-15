const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(__dirname, '..');
const output = process.env.ARASN_TEST_SCREENSHOTS || path.join(root, 'docs/screenshots/xigra-p0b');

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'xigra-p0b-'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ['.'], cwd: root, env });
  let app;
  function saved() {
    const db = new DatabaseSync(path.join(data, 'workspace.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT value FROM elements').all().map(row => JSON.parse(row.value)).filter(item => item?.type === 'text').map(item => item.text); }
    finally { db.close(); }
  }
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ shortcut: 'Control+Alt+F13', theme: 'light' }));
    app = await launch();
    let page = await app.firstWindow();
    let win = await app.browserWindow(page);
    const show = () => win.evaluate(window => { window.show(); window.focus(); window.webContents.send('app:focus'); });
    await show();
    const editor = () => page.getByRole('textbox', { name: '便笺文字', exact: true });
    const status = () => page.locator('.xigra-save-state');
    const compactNew = () => page.getByRole('button', { name: '新建便笺', exact: true });
    const expand = () => page.getByRole('button', { name: '打开工作区', exact: true }).click();
    const collapse = () => page.getByRole('button', { name: '切换到便签区', exact: true }).click();
    const list = () => page.getByRole('complementary', { name: '记录列表', exact: true });
    const recent = () => page.getByRole('region', { name: '最近便笺', exact: true });
    const caret = () => editor().evaluate(element => [element.selectionStart, element.selectionEnd]);
    await expect(status()).toHaveText('等待输入');
    for (let i = 0; i < 20; i++) await compactNew().click();
    assert.deepEqual(saved(), []);

    let release;
    const loading = new Promise(resolve => { release = resolve; });
    await page.route('**/api/board*', async route => { await loading; await route.continue(); });
    const first = '甲：会议纪要\n第二行是发票核验。';
    const second = '乙：临时事项\n核对交付日期。';
    await page.reload({ waitUntil: 'domcontentloaded' });
    try {
      await expect(editor()).toBeFocused();
      await editor().fill(first);
      await expect(status()).toHaveText('尚未落盘');
      assert.deepEqual(saved(), []);
      await page.evaluate(() => window.desktop.hide());
      await expect(page.getByText('便笺尚未落盘，请等保存完成后重试，或先复制正文。')).toBeVisible();
      assert.equal(await win.evaluate(window => window.isVisible()), true);
    } finally { release(); }
    await expect(status()).toHaveText('已保存');
    assert.deepEqual(saved(), [first]);
    await compactNew().click();
    await editor().fill(second);
    await expect(status()).toHaveText('已保存');

    await page.getByRole('button', { name: '搜索', exact: true }).click();
    const search = page.getByRole('dialog', { name: '查找便笺', exact: true });
    await expect(search.getByRole('searchbox', { name: '搜索便笺正文' })).toBeFocused();
    await search.getByRole('searchbox', { name: '搜索便笺正文' }).fill('发票核验');
    await search.getByRole('button', { name: /甲：会议纪要/ }).click();
    await expect(search).toBeHidden();
    await expect(editor()).toHaveValue(first);
    await expect(editor()).toBeFocused();
    await editor().press('Control+Home');
    await editor().press('Shift+ArrowRight');
    await editor().press('Shift+ArrowRight');
    assert.deepEqual(await caret(), [0, 2]);
    await expand();
    await expect(page.getByRole('region', { name: '便签工作区', exact: true })).toBeVisible();
    await expect(editor()).toHaveValue(first);
    await expect.poll(caret).toEqual([0, 2]);
    await collapse();
    await expect.poll(caret).toEqual([0, 2]);
    await expand();

    const firstEdit = first + '\n甲已修改。';
    const secondEdit = second + '\n乙已修改。';
    await editor().fill(firstEdit);
    await list().getByRole('button', { name: /乙：临时事项/ }).click();
    await editor().fill(secondEdit);
    await list().getByRole('button', { name: /甲：会议纪要/ }).click();
    await expect(editor()).toHaveValue(firstEdit);
    await expect.poll(() => saved().sort()).toEqual([firstEdit, secondEdit].sort());
    const query = page.getByRole('searchbox', { name: '搜索便笺正文' });
    await query.fill('交付日期');
    await expect(list().getByRole('button', { name: /甲：会议纪要/ })).toHaveCount(0);
    await expect(editor()).toHaveValue(firstEdit);
    await query.fill('');

    const shots = {};
    async function capture(name, width, height, selectors) {
      await win.evaluate((window, size) => { window.setMinimumSize(1, 1); window.setContentSize(...size); }, [width, height]);
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
      const layout = await page.evaluate(list => list.every(selector => {
        const bounds = document.querySelector(selector)?.getBoundingClientRect();
        return bounds && bounds.width > 0 && bounds.height > 0 && bounds.left >= -1 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1;
      }) && document.documentElement.scrollWidth <= innerWidth, selectors);
      assert.equal(layout, true, name);
      let image;
      await expect.poll(async () => {
        image = await page.screenshot({ scale: 'css', animations: 'disabled' });
        return [image.readUInt32BE(16), image.readUInt32BE(20)];
      }).toEqual([width, height]);
      await fs.writeFile(path.join(output, `${name}.png`), image);
      shots[name] = [width, height];
    }
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await page.locator('.sidebar').getByRole('button', { name: '设置与快捷键' }).click();
        await selectOption(page, "外观主题", 'dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.getByRole('button', { name: '关闭弹窗', exact: true }).click();
        await page.locator('.toast').waitFor({ state: 'hidden' });
      }
      await capture(`${theme}-workbench-960x680`, 960, 680, ['.topbar', '.xigra-record-index', '.xigra-record-editor', '.xigra-record-paper footer']);
      await collapse();
      for (const [w, h] of [[480, 560], [400, 460]]) {
        await capture(`${theme}-quick-${w}x${h}`, w, h, ['.quick-header', '.quick-input', '.quick-footer', '.xigra-recent-records']);
        await expect(recent().getByRole('button', { name: /甲：会议纪要/ })).toBeVisible();
      }
      await expand();
    }

    await list().getByRole('button', { name: /乙：临时事项/ }).click();
    await page.getByRole('button', { name: '管理当前便笺', exact: true }).click();
    await page.getByRole('menuitem', { name: '删除便笺', exact: true }).click();
    const confirm = page.getByRole('dialog', { name: '删除便笺', exact: true });
    await confirm.getByRole('button', { name: '确认删除', exact: true }).click();
    await expect(list().getByRole('button', { name: /乙：临时事项/ })).toHaveCount(0);
    await expect.poll(saved).toEqual([firstEdit]);
    await list().getByRole('button', { name: /甲：会议纪要/ }).click();
    await collapse();
    await page.keyboard.press('Escape');
    await expect.poll(() => win.evaluate(window => window.isVisible())).toBe(false);
    await show();
    await expect(editor()).toHaveValue(firstEdit);
    await expect(editor()).toBeFocused();
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    win = await app.browserWindow(page);
    await show();
    await expect(editor()).toHaveValue('');
    await recent().getByRole('button', { name: /甲：会议纪要/ }).click();
    await expect(editor()).toHaveValue(firstEdit);
    assert.deepEqual(saved(), [firstEdit]);
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify({ shots, coldBuffer: true, zeroEmptyRecords: true, bodySearch: true, selectionPreserved: true, crossEdit: true, delete: true, recentAfterRestart: true }, null, 2));
    console.log('PASS P0b: Electron + SQLite, delayed readiness, drafts, search, selection, deletion, six layouts and recent after restart');
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith('xigra-p0b-')) await fs.rm(target, { recursive: true, force: true });
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
