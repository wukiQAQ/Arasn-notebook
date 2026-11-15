// Real Chromium, isolated in-memory host. No user notebook or native window state.
const { chromium } = require('@playwright/test');
const { startServer, createStore } = require('../desktop/server.cjs');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const output = path.resolve(__dirname, '../docs/screenshots/redesign/motion');
  fs.mkdirSync(output, { recursive: true });
  const host = await startServer({ store: createStore(), token: 'motion', staticDir: path.resolve(__dirname, '../dist') });
  const browser = await chromium.launch();
  const errors = [], proof = {};
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => localStorage.setItem('arasn-theme', 'dark'));
    await page.goto(`http://127.0.0.1:${host.port}/#motion`);
    await page.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
    proof.fontLoaded = await page.evaluate(async () => (await document.fonts.load('540 20px "Arasn Manrope"')).length > 0);
    assert.equal(proof.fontLoaded, true, 'Bundled variable font loads');
    const letter = page.locator('.brand .proximity-letter').first();
    const before = await letter.boundingBox();
    await letter.hover();
    await page.waitForFunction(() => Number(document.querySelector('.brand .proximity-letter').style.getPropertyValue('--letter-weight')) > 600);
    proof.nearWeight = await letter.evaluate(el => el.style.getPropertyValue('--letter-weight'));
    await page.screenshot({ path: path.join(output, 'brand-proximity.png'), animations: 'disabled' });
    const after = await letter.boundingBox();
    assert.equal(after.width, before.width, 'Variable weight does not shift letter slots');
    await page.mouse.move(600, 500);
    await page.waitForFunction(() => document.querySelector('.brand .proximity-letter').style.getPropertyValue('--letter-weight') === '540');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await letter.hover();
    assert.equal(await letter.evaluate(el => el.style.getPropertyValue('--letter-weight')), '540');
    proof.reducedMotion = await letter.evaluate(el => getComputedStyle(el).transitionDuration);
    assert.equal(proof.reducedMotion, '0s');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.getByRole('button', { name: /写一张便笺/ }).first().click();
    await page.getByRole('textbox', { name: '便笺文字' }).fill('动效体验\n图标与操作相互呼应。');
    await page.getByRole('button', { name: '自由绘图', exact: true }).hover();
    await page.screenshot({ path: path.join(output, 'toolbar-hover.png'), animations: 'disabled' });
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: '搜索命令' }).waitFor();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('option').nth(1).getAttribute('aria-selected'), 'true');
    await page.screenshot({ path: path.join(output, 'command-icons.png'), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await page.close();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const mobile = await touch.newPage();
    await mobile.goto(`http://127.0.0.1:${host.port}/#motion`);
    await mobile.waitForFunction(() => document.querySelector('.save-state')?.textContent === '已保存');
    assert.equal(await mobile.evaluate(() => matchMedia('(pointer: coarse)').matches), true);
    await mobile.screenshot({ path: path.join(output, 'touch-mobile.png'), animations: 'disabled' });
    await touch.close();
    const context = await browser.newContext({ viewport: { width: 520, height: 640 } });
    await context.addInitScript(() => {
      const info = { expanded: false, shortcut: 'Control+Alt+N', shortcutOk: true, theme: 'light', sharing: false, links: [] };
      window.desktop = { info: async () => info, onLayout: () => () => {}, onBoard: () => () => {}, onFocus: () => () => {}, recovery: async () => null, saveRecovery: async () => {} };
    });
    const quick = await context.newPage();
    quick.on('pageerror', error => errors.push(error.message));
    await quick.goto(`http://127.0.0.1:${host.port}/#motion`);
    await quick.locator('.mode-indicator').waitFor();
    await quick.evaluate(() => {
      window.__tabTransitions = [];
      document.querySelector('.mode-indicator').addEventListener('transitionrun', event => window.__tabTransitions.push(event.propertyName));
    });
    await quick.getByRole('tab', { name: '画图' }).click();
    await quick.waitForFunction(() => {
      const indicator = document.querySelector('.mode-indicator').getBoundingClientRect();
      const tab = document.querySelector('.quick-tabs [aria-selected="true"]').getBoundingClientRect();
      return Math.abs(indicator.x - tab.x) < 1 && Math.abs(indicator.width - tab.width) < 1;
    });
    proof.tabIndicatorAligned = true;
    proof.tabTransitionProperties = await quick.evaluate(() => window.__tabTransitions);
    assert.ok(proof.tabTransitionProperties.includes('left'), 'Pointer switch runs slide transition');
    await quick.screenshot({ path: path.join(output, 'quick-slide-tabs.png'), animations: 'disabled' });
    await context.close();
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify({ proof, errors }, null, 2));
    console.log(JSON.stringify({ output, proof, errors }));
  } finally { await browser.close(); await host.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
