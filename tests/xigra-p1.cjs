const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'test-results/xigra-p1');

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'xigra-p1-'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page, win;
  async function launch() {
    app = await electron.launch({ args: ['.'], cwd: root, env });
    page = await app.firstWindow();
    win = await app.browserWindow(page);
    await win.evaluate(window => { window.show(); window.focus(); window.webContents.send('app:focus'); });
  }
  function stored() {
    const db = new DatabaseSync(path.join(data, 'workspace.sqlite'), { readOnly: true });
    try { return db.prepare('SELECT id, value FROM elements').all().map(row => ({ id: row.id, value: JSON.parse(row.value) })); }
    finally { db.close(); }
  }
  const editor = () => page.getByRole('textbox', { name: '便笺文字', exact: true });
  const exactButton = name => page.getByRole('button', { name, exact: true });
  const list = () => page.getByRole('complementary', { name: '记录列表', exact: true });
  const pinned = () => list().getByRole('region', { name: '置顶', exact: true });
  const manage = () => exactButton('管理当前便笺');
  const restore = () => exactButton('恢复为新便签');
  const title = text => text.split('\n')[0];
  const select = text => list().getByRole('button', { name: new RegExp(title(text)) }).click();
  const expand = () => exactButton('打开工作区').click();
  async function menuAction(name) {
    await manage().click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  }
  async function deleteCurrent() {
    await menuAction('删除便笺');
    await page.getByRole('dialog', { name: '删除便笺', exact: true }).getByRole('button', { name: '确认删除' }).click();
  }
  async function capture(name, width, height, selector) {
    await win.evaluate((window, size) => { window.setMinimumSize(1, 1); window.setContentSize(...size); }, [width, height]);
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
    const box = await page.locator(selector).boundingBox();
    assert.ok(box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height, name);
    await page.screenshot({ path: path.join(output, name + '.png'), scale: 'css', animations: 'disabled' });
  }

  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ shortcut: 'Control+Alt+F13', theme: 'light' }));
    await launch();
    const first = '甲单 · 资料整理\n  第二行含空格\n末尾也有空格  \n';
    const second = '乙单 · 下周事项\n跟进回执';
    await editor().fill(first);
    await expect(page.locator('.xigra-save-state')).toHaveText('已保存');
    await exactButton('新建便笺').click();
    await editor().fill(second);
    await expect(page.locator('.xigra-save-state')).toHaveText('已保存');
    await expand();
    await select(first);
    await app.evaluate(async ({ clipboard, ClipboardItem }) => {
      globalThis.clipboardBefore = await Promise.all(
        (await clipboard.read()).filter(item => item.types.length).map(async item =>
          new ClipboardItem(Object.fromEntries(await Promise.all(
            item.types.map(async type => [type, await item.getType(type)]),
          )))),
      );
    });
    const probe = 'XIGRA P1 剪贴板校验';
    try {
      await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), probe);
      await exactButton('复制正文').click();
      await expect.poll(() => app.evaluate(async ({ clipboard }) => (await clipboard.readText()).replace(/\r\n/g, '\n'))).toBe(first);
    } finally {
      await app.evaluate(async ({ clipboard }, testValues) => {
        if (!testValues.includes((await clipboard.readText()).replace(/\r\n/g, '\n'))) return;
        if (globalThis.clipboardBefore.length) await clipboard.write(globalThis.clipboardBefore);
        else clipboard.clear();
      }, [first, probe]);
    }

    await manage().focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: '置顶便笺', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '删除便笺', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(manage()).toBeFocused();
    await menuAction('置顶便笺');
    await expect(pinned().getByRole('button')).toHaveCount(1);
    await select(second);
    await menuAction('置顶便笺');
    await expect(pinned().locator('strong')).toHaveText([title(second), title(first)]);
    await page.getByRole('searchbox', { name: '搜索便笺正文' }).fill('含空格');
    await expect(pinned().getByRole('button')).toHaveCount(1);
    await page.getByRole('searchbox', { name: '搜索便笺正文' }).clear();
    await exactButton('最近').click();
    await expect(pinned()).toHaveCount(0);
    await expect(list().getByRole('button', { name: /甲单/ })).toBeVisible();
    await app.close();

    await launch();
    await expand();
    await expect(pinned().getByRole('button')).toHaveCount(2);
    assert.deepEqual(await pinned().getByRole('button').locator('strong').allTextContents(), [title(second), title(first)]);
    await select(second);
    await menuAction('取消置顶');
    await expect(pinned().getByRole('button')).toHaveCount(1);
    await expect(list().getByRole('button', { name: /乙单/ })).toHaveCount(1);
    await select(first);
    await manage().click();
    await capture('light-menu', 960, 680, '.xigra-record-menu');
    await page.keyboard.press('Escape');

    const oldId = stored().find(row => row.value?.text === first).id;
    await page.route('**/api/ops', route => route.fulfill({ status: 409, json: { error: '测试：版本冲突' } }));
    await deleteCurrent();
    await expect(page.getByText(/删除未保存/)).toBeVisible();
    await expect(restore()).toHaveCount(0);
    await expect(pinned().getByRole('button', { name: /甲单/ })).toBeVisible();
    assert.equal(stored().find(row => row.id === oldId).value.text, first);
    await page.unroute('**/api/ops');

    let releaseDelete;
    const held = new Promise(resolve => { releaseDelete = resolve; });
    let dropDelete = true;
    await page.route('**/api/ops', async route => {
      if (!dropDelete || route.request().postDataJSON().value !== null) return route.continue();
      dropDelete = false;
      const response = await route.fetch({ maxRetries: 0 });
      if (!response.ok()) return route.fulfill({ response });
      await held;
      await route.abort('connectionreset');
    });
    await select(first);
    try {
      await deleteCurrent();
      await expect.poll(() => stored().find(row => row.id === oldId).value).toBeNull();
      await expect(restore()).toBeDisabled();
    } finally { releaseDelete(); }
    await expect(restore()).toBeEnabled();
    await expect(page.getByText(/删除未保存/)).toHaveCount(0);
    assert.equal(stored().find(row => row.id === oldId).value, null);
    assert.ok(!(await pinned().count()));
    await page.locator('.sidebar').getByRole('button', { name: '设置与快捷键' }).click();
    await selectOption(page, "外观主题", 'dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await exactButton('关闭弹窗').click();
    await page.locator('.toast').waitFor({ state: 'hidden' });
    await capture('dark-recovery-narrow', 500, 560, '.xigra-record-undo');
    const rowFits = await list().getByRole('button', { name: /乙单/ }).evaluate(row =>
      row.getBoundingClientRect().bottom <= row.closest('.xigra-record-scroll').getBoundingClientRect().bottom);
    assert.ok(rowFits, 'the first record fits in the narrow list');
    await restore().focus();
    await page.keyboard.press('Enter');
    await expect(editor()).toHaveValue(first);
    await expect(editor()).toBeFocused();
    await expect(restore()).toHaveCount(0);
    await expect.poll(() => stored().filter(row => row.value?.text === first).length).toBe(1);
    const recovered = stored().find(row => row.value?.text === first);
    assert.notEqual(recovered.id, oldId);
    assert.equal(stored().find(row => row.id === oldId).value, null);
    await app.close();
    await launch();
    await expand();
    await expect(list().getByRole('button', { name: /甲单/ })).toHaveCount(1);
    await expect(pinned()).toHaveCount(0);
    assert.equal(stored().find(row => row.id === recovered.id).value.text, first);
    console.log('PASS P1: clipboard payload, keyboard menu, pin ordering and restart, rejected deletion, and new-ID recovery in Electron + SQLite');
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith('xigra-p1-')) await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
