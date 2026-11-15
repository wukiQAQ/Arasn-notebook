const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-heading-'));
  const phase = process.env.ARASN_HEADING_PHASE || 'after';
  const output = path.resolve('docs/screenshots/workbench-heading', phase);
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const checks = [], errors = [];
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    const page = await app.firstWindow(); const win = await app.browserWindow(page);
    page.on('pageerror', e => errors.push(e.message));
    await win.evaluate(w => { w.show(); w.focus(); });
    await page.getByRole('button', { name: '打开工作区', exact: true }).click();
    const rail = page.getByRole('complementary', { name: '侧边栏' });
    for (const [width, height] of [[1440, 900], [820, 700], [390, 720]]) {
      await win.evaluate((w, s) => { w.setMinimumSize(350, 460); w.setContentSize(...s); }, [width, height]);
      await page.waitForFunction(w => innerWidth === w, width);
      for (const [route, title, file] of [['我的随手页', '自由工作页', 'canvas'], ['打开关系画布', '关系画布', 'relations'], ['便笺列表', '速记', 'records'], ['文件', '文件中心', 'files']]) {
        await rail.getByRole('button', { name: route, exact: true }).click();
        if (phase !== 'before') {
          await expect(page.locator('.topbar h1')).toHaveText(title);
          await expect(page.locator('.topbar')).not.toContainText('Arasn');
          await expect(rail.locator('.xigra-wordmark')).toHaveText('Arasn');
          await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
        }
        await page.screenshot({ path: path.join(output, `${file}-${width}.png`), animations: 'disabled', scale: 'css' });
        const geometry = await page.locator('.topbar').evaluate(el => {
          const title = el.querySelector('h1, .xigra-workbench-wordmark').getBoundingClientRect();
          const actions = el.querySelector('.header-actions').getBoundingClientRect();
          return { noPageOverflow: document.documentElement.scrollWidth <= innerWidth, titleRight: title.right, actionsLeft: actions.left, actionsRight: actions.right, width: innerWidth };
        });
        if (phase !== 'before') assert.ok(geometry.noPageOverflow && geometry.titleRight <= geometry.actionsLeft && geometry.actionsRight <= width + 1, JSON.stringify({ title, ...geometry }));
        checks.push({ width, title, ...geometry });
      }
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log('PASS heading ' + phase + ': 4 modules at 1440/820/390, sidebar brand, route and overflow');
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith('arasn-heading-')) await fs.rm(target, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
