const { selectOption } = require("./helpers/select-option.cjs");
// Isolated in-memory host: review never touches the user's saved notebook.
const { chromium } = require('@playwright/test');
const { createStore, startServer } = require('../desktop/server.cjs');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const round = process.argv[2] || 'final';
  const isFinal = round.includes('final');
  const output = path.resolve(__dirname, '../docs/screenshots/redesign', round);
  fs.mkdirSync(output, { recursive: true });
  const host = await startServer({ store: createStore(), token: 'visual-review', host: '127.0.0.1', port: 0, staticDir: path.resolve(__dirname, '../dist') });
  const browser = await chromium.launch();
  const errors = [];
  const report = [];
  try {
    for (const [name, width, height] of [['desktop', 1440, 960], ['tablet', 820, 1000], ['mobile', 390, 844]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${host.port}/#visual-review`);
      await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
      await page.screenshot({ path: path.join(output, `${name === 'desktop' ? 'desktop-empty' : name + '-initial'}.png`), animations: 'disabled' });
      if (name === 'desktop') {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(output, 'mobile-empty.png'), animations: 'disabled' });
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: /写一张便笺/ }).first().click();
        await page.getByRole('textbox', { name: '便笺文字' }).first().fill('会议随手记\n确认方案，整理本周交付。\n下次例会前同步进展。');
        await page.getByRole('button', { name: '自由绘图', exact: true }).click();
        const paper = await page.getByTestId('paper').boundingBox();
        await page.mouse.move(paper.x + 380, paper.y + 160);
        await page.mouse.down();
        await page.mouse.move(paper.x + 500, paper.y + 210, { steps: 12 });
        await page.mouse.up();
        await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
      }
      await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, toolbar: document.querySelector('.toolbar').scrollWidth, toolbarWidth: document.querySelector('.toolbar').clientWidth }));
      report.push({ name, ...dimensions });
      if (isFinal) assert.ok(dimensions.document <= width, `${name}: page overflow`);
      const settings = page.getByRole('button', { name: '设置与快捷键', exact: true });
      if (await settings.isVisible()) {
        await settings.click();
        if (isFinal) {
          await page.waitForFunction(() => document.querySelector('.modal')?.contains(document.activeElement));
          await page.getByRole('button', { name: '导出完整备份' }).focus();
          await page.keyboard.press('Tab');
          await page.waitForFunction(() => document.querySelector('.modal')?.contains(document.activeElement));
        }
        await selectOption(page, "外观主题", "dark");
        await page.getByRole('button', { name: '关闭弹窗' }).click();
        await page.locator('.toast').waitFor({ state: 'hidden' });
        await page.screenshot({ path: path.join(output, `${name}-dark.png`), animations: 'disabled' });
      }
      if (name === 'desktop' && round.startsWith('desk')) {
        await page.keyboard.press('Control+k');
        await page.getByRole('combobox', { name: '搜索命令' }).waitFor();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.getByRole('option').nth(1).getAttribute('aria-selected'), 'true');
        await page.screenshot({ path: path.join(output, 'command.png'), animations: 'disabled' });
        await page.getByRole('combobox', { name: '搜索命令' }).fill('设置');
        await page.keyboard.press('Enter');
        await page.getByRole('dialog', { name: '设置', exact: true }).waitFor();
        await page.getByRole('button', { name: '关闭弹窗' }).click();
        await page.keyboard.press('Control+k');
        await page.getByRole('combobox', { name: '搜索命令' }).fill('不存在的命令');
        assert.equal(await page.getByRole('option').count(), 0);
        await page.keyboard.press('Escape');
        await page.getByRole('button', { name: '会议随手记', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '便笺文字');
      }
      if (name === 'mobile' && isFinal) {
        await page.getByRole('button', { name: '写一张便笺', exact: true }).click();
        await page.getByRole('textbox', { name: '便笺文字' }).last().fill('手机端新增与编辑检查');
        await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
        await page.locator('.reader-note').last().getByRole('button', { name: '删除便笺' }).click();
        await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
        await page.setViewportSize({ width: 320, height: 720 });
        await page.screenshot({ path: path.join(output, 'mobile-320.png'), animations: 'disabled' });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px page fits');
      }
      await context.close();
    }
    // Render the actual QuickPanel with the Electron bridge substituted; no native lifecycle claims.
    const context = await browser.newContext({ viewport: { width: 520, height: 640 } });
    await context.addInitScript(() => {
      const info = { expanded: false, shortcut: 'Control+Alt+N', shortcutOk: true, sharing: false, links: [], dataPath: '', theme: 'light', alwaysOnTop: false, startMinimized: true, openAtLogin: false, autoStartSupported: false };
      window.desktop = { info: async () => info, onLayout: () => () => {}, onBoard: () => () => {}, onFocus: () => () => {}, recovery: async () => null, saveRecovery: async () => {}, hide: async () => {}, settings: async patch => Object.assign(info, patch), layout: async () => info };
    });
    const quick = await context.newPage();
    quick.on('pageerror', error => errors.push(error.message));
    await quick.goto(`http://127.0.0.1:${host.port}/#visual-review`);
    await quick.getByRole('textbox', { name: '便笺文字' }).waitFor();
    await quick.screenshot({ path: path.join(output, 'quick-text.png') });
    await quick.getByRole('tab', { name: '画图' }).click();
    await quick.screenshot({ path: path.join(output, 'quick-draw.png') });
    await quick.getByRole('tab', { name: '打字' }).click();
    assert.match(await quick.getByRole('textbox', { name: '便笺文字' }).inputValue(), /会议随手记/);
    await context.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ report, errors }, null, 2));
    console.log(JSON.stringify({ output, report, errors }));
  } finally {
    await browser.close();
    await host.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
