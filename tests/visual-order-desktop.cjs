const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
const fixture = [
  ['整理研究线索', '把零散资料转成可追溯的内容关系。\n先明确问题，再连接已有记录。', -430, -170, 'note', 'active'],
  ['哪些内容值得保留？', '判断资料是否回答了当前问题。\n避免重复收集，把注意力留给正文。', -50, -170, 'question', 'open'],
  ['建立清晰的阅读路径', '从核心问题到依据，再到下一步行动。\n让连接解释内容，而不遮挡内容。', 330, -170, 'idea', 'open'],
  ['核对来源与结论', '确认引用来源，检查结论的适用范围。\n保留原文，区分事实与推断。', -240, 110, 'task', 'done'],
  ['准备下一轮讨论', '汇总待确认的问题与后续任务。\n在同一个内容空间继续推进。', 140, 110, 'note', 'open'],
];
const phase = process.env.ARASN_ORDER_PHASE || 'after';
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-order-'));
  const shots = path.resolve('docs/screenshots/visual-order', phase); await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const records = fixture.map(([title, body, x, y, kind, status]) => { const id = randomUUID(); store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text: `${title}\n${body}`, color: '#263449', x: 120, y: 140, topology: { x, y, width: 280, height: 176, kind, status } } }); return id; });
  const camera = { roomId: store.snapshot().roomId, x: 90, y: 30, zoom: 1 };
  const engine = new StorageEngine(data);
  let nodes;
  try {
    const initial = (await engine.call('init')).state;
    await engine.call('canvasMigration', { dryRun: false, roomId: initial.roomId, revision: initial.revision });
    const state = (await engine.call('init')).state;
    nodes = records.map(id => Object.keys(state.items).find(key => state.items[key].value?.type === 'canvas-node' && state.items[key].value.contentRef.id === id));
    for (const [from, to, relationType] of [[0, 1, 'related'], [1, 2, 'reference'], [0, 3, 'dependency'], [1, 4, 'resolves']]) await engine.call('board', { operation: { id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'canvas-edge', roomId: camera.roomId, canvasId: camera.roomId, fromNodeId: nodes[from], toNodeId: nodes[to], relationType, label: '', direction: 'forward' } } });
  } finally { await engine.close(); }
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', topologyViewport: camera }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page; const errors = [], results = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const shot = async name => {
    await page.mouse.move(210, 20);
    await page.screenshot({ path: path.join(shots, `${name}.png`), scale: 'css', animations: 'disabled' });
    const colors = await page.evaluate(() => {
      const rgba = color => { const c = document.createElement('canvas').getContext('2d'); c.fillStyle = color; c.fillRect(0, 0, 1, 1); return [...c.getImageData(0, 0, 1, 1).data]; };
      const luminance = rgb => rgb.slice(0, 3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
      const ratio = (a, b) => { a = luminance(rgba(a)); b = luminance(rgba(b)); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
      const card = getComputedStyle(document.querySelector('.topology-node')), title = getComputedStyle(document.querySelector('.topology-node > strong')), body = getComputedStyle(document.querySelector('.topology-node-summary')), primary = getComputedStyle(document.querySelector('.topology-primary'));
      return { titleContrast: ratio(title.color, card.backgroundColor), bodyContrast: ratio(body.color, card.backgroundColor), actionContrast: ratio(primary.color, primary.backgroundColor), titleSize: title.fontSize, bodySize: body.fontSize, card: card.backgroundColor, canvas: getComputedStyle(document.querySelector('.topology-viewport')).backgroundColor };
    });
    if (phase !== 'before') for (const key of ['titleContrast', 'bodyContrast', 'actionContrast']) assert(colors[key] >= 4.5, `${name} ${key} ${colors[key]}`);
    results.push({ name, viewport: await page.evaluate(() => [innerWidth, innerHeight]), zoom: await button('复位视图').innerText(), world: await page.locator('.topology-world').getAttribute('style'), colors });
  };
  try {
    app = await electron.launch({ ...(process.env.ARASN_ORDER_EXE ? { executablePath: process.env.ARASN_ORDER_EXE, args: [] } : { args: ['.'] }), cwd: path.resolve(__dirname, '..'), env }); page = await app.firstWindow(); page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page); await win.evaluate(w => { w.show(); w.focus(); });
    await button('打开工作区').click(); await win.evaluate(w => w.setContentSize(1440, 900)); await button('打开关系画布').click();
    if (await button('备份并启用关系画布').isVisible()) await button('备份并启用关系画布').click();
    await expect(page.locator('.topology-node')).toHaveCount(5);
    await expect(page.locator('[data-edge]')).toHaveCount(4);
    await expect(button('复位视图')).toHaveText('100%');
    await shot('light-1440-100');
    const node = page.locator(`[data-topology-node="${nodes[1]}"]`);
    await node.click({ position: { x: 110, y: 65 } }); await expect(node).toHaveAttribute('data-selected'); await shot('light-selected-100');
    await button('编辑节点').click(); await expect(page.getByRole('textbox', { name: '节点正文' })).toBeVisible(); await shot('light-inspector-100');
    await page.keyboard.press('Escape');
    await button('设置与快捷键').click(); await selectOption(page, '外观主题', 'dark'); await button('关闭弹窗').click(); await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
    await shot('dark-selected-100');
    await button('缩小画布').click(); await button('缩小画布').click(); await shot('dark-selected-zoomed');
    await button('复位视图').click(); await expect(button('复位视图')).toHaveText('100%');
    await button('设置与快捷键').click(); await selectOption(page, '外观主题', 'light'); await button('关闭弹窗').click(); await expect(page.getByText('设置已保存', { exact: true })).toBeHidden();
    await button('打开关系画布').focus(); await shot('keyboard-focus');
    for (const [width, height] of [[820, 700], [390, 720]]) {
      await win.evaluate((w, size) => { w.setMinimumSize(350, 460); w.setContentSize(...size); }, [width, height]); await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await expect(button('新建节点')).toBeVisible(); assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot(`light-${width}-100`);
    }
    if (phase !== 'before') {
      const compact = await node.evaluate(element => {
        element.style.height = '140px';
        const rect = element.getBoundingClientRect();
        const parts = ['.topology-node-meta', 'strong', '.topology-node-summary', '.topology-node-footer'].map(selector => { const r = element.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
        return { top: rect.top, bottom: rect.bottom, parts };
      });
      assert(compact.parts.every(part => part.top >= compact.top && part.bottom <= compact.bottom + 1), '140px node content must fit');
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'comparison.json'), JSON.stringify({ fixture, fixtureHash: createHash('sha256').update(JSON.stringify(fixture)).digest('hex'), camera: { x: 90, y: 30, zoom: 1 }, results }, null, 2));
    console.log(`PASS ${phase}: fixed fixture, 1440/820/390, light/dark, selection, inspector, keyboard, zoom; no page errors`);
  } catch (e) { if (page && !page.isClosed()) await page.screenshot({ path: path.join(shots, 'failure.png'), scale: 'css' }).catch(() => {}); throw e; }
  finally { if (app) await app.close(); const target = await fs.realpath(data); assert.equal(path.dirname(target), await fs.realpath(os.tmpdir())); await fs.rm(target, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
