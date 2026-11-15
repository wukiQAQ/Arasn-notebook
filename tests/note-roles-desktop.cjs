const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-note-roles-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/note-roles');
  const baseline = process.env.ARASN_REVIEW_BASELINE === '1';
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const record = randomUUID(), other = randomUUID(), stroke = randomUUID();
  const text = '评审前的准备\n\n把需要讨论的问题收集在这里。\n确认范围，补充材料，再安排下一步。';
  for (const [id, value] of [[record, { type: 'text', text, color: '#9aafff', x: 650, y: 410, topology: { x: -260, y: -100, width: 280, height: 156, kind: 'question', status: 'active' } }], [other, { type: 'text', text: '一个新的想法\n先记录，再慢慢展开。', color: '#8fc8ab', x: 1000, y: 600, topology: { x: 100, y: 120, width: 280, height: 140, kind: 'idea', status: 'open' } }], [stroke, { type: 'stroke', color: '#9aafff', width: 4, points: [[350, 500], [430, 460], [520, 510]] }]]) store.apply({ id, value, expected: 0, opId: randomUUID() });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark', shortcut: 'Control+Alt+F23' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    const page = await app.firstWindow(), win = await app.browserWindow(page), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const b = name => page.getByRole('button', { name, exact: true });
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    const size = async width => { await win.evaluate((w, width) => { w.unmaximize(); w.setResizable(true); w.setMinimumSize(320, 400); w.setContentSize(width, 900); w.show(); w.focus(); }, width); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width); };
    const capture = async name => { await page.screenshot({ path: path.join(shots, `${name}.png`), animations: 'disabled', scale: 'css' }); };
    if (await b('打开工作区').isVisible()) await b('打开工作区').click();
    await size(1440);
    await b('便笺列表').click();
    await page.locator('.xigra-record-list button').filter({ hasText: '评审前的准备' }).click();
    await capture('records-1440');
    await b('打开关系画布').click();
    if (await b('备份并启用关系画布').isVisible()) await b('备份并启用关系画布').click();
    await expect(page.locator('.topology-node')).toHaveCount(2);
    await capture('relations-1440');
    await b('我的随手页').click();
    await expect(page.locator(`[data-note-id="${record}"] textarea`)).toHaveValue(text);
    await capture('free-1440');
    await b('设置与快捷键').first().click();
    await page.getByLabel('外观主题', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByLabel('启动时隐藏窗口', {exact:true}).scrollIntoViewIfNeeded();
    await capture('settings-1440');
    if (!baseline) await require('./note-roles-checks.cjs')({ app, page, win, b, board, capture, size, record, other, stroke, text });
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'result.json'), JSON.stringify({ status: 'passed', baseline, errors }, null, 2));
    console.log('PASS note roles, actual screenshots and data integrity');
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    assert.equal(path.dirname(target), await fs.realpath(os.tmpdir()));
    await fs.rm(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
