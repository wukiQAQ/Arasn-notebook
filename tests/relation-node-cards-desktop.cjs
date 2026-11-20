const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { selectOption } = require('./helpers/select-option.cjs');

const samples = [
  { layout: { x: -340, y: -140, width: 300, height: 150, kind: 'note', status: 'open', autoSize: true },
    text: '发布评审\n确认首屏的筛选和排序。\n记录本轮验收条件。\n将已确认的反馈归档。' },
  { layout: { x: 82, y: -140, width: 355, height: 174, kind: 'question', status: 'active' },
    text: '<h2>待确认的范围</h2><p><strong>优先处理</strong>桌面端关键路径。</p><p>保留已有的便签与附件引用。</p><p>核对当前视图与窗口大小。</p>' },
  { layout: { x: 82, y: 130, width: 300, height: 150, kind: 'task', status: 'done', autoSize: true },
    text: '发布后检查' },
];

async function seed(data) {
  const engine = new StorageEngine(data);
  try {
    const state = (await engine.call('init')).state;
    const roomId = state.roomId;
    await engine.call('canvasMigration', { dryRun: false, roomId, revision: state.revision });
    for (const sample of samples) {
      sample.nodeId = randomUUID();
      sample.recordId = randomUUID();
      await engine.call('canvasCreate', { ...sample, roomId, opId: randomUUID() });
    }
    const attachmentPath = path.join(data, 'release-checklist.txt');
    await fs.writeFile(attachmentPath, '发布检查表');
    const [file] = await engine.call('import', { paths: [attachmentPath] });
    const edit = (id, value) => engine.call('board', { operation: { id, value, expected: 0, opId: randomUUID() } });
    await edit(randomUUID(), { type: 'content-link', roomId, recordId: samples[0].recordId, targetRef: { kind: 'file', id: file.file.id } });
    const edges = [randomUUID(), randomUUID()];
    for (const [index, id] of edges.entries()) {
      await edit(id, { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: samples[index].nodeId, toNodeId: samples[index + 1].nodeId,
        label: '', direction: 'forward', relationType: index === 0 ? 'dependency' : 'resolves' });
    }
    return edges;
  } finally {
    await engine.close();
  }
}

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-node-cards-'));
  const out = path.resolve(process.env.ARASN_NODE_CARD_SHOTS || 'docs/screenshots/relation-node-cards');
  let app, page, win;
  try {
    const edges = await seed(data);
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F22' }));
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    const button = name => page.getByRole('button', { name, exact: true });
    const card = index => page.locator(`[data-topology-node="${samples[index].nodeId}"]`);
    const summary = index => card(index).locator('.topology-node-summary');
    const edge = index => page.locator(`[data-edge="${edges[index]}"] .relation-line`);
    const shot = name => page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
    const layout = index => card(index).evaluate(el => ['left', 'top', 'width', 'height'].map(key => parseFloat(el.style[key])));
    const board = () => page.evaluate(async () => (await (await fetch('/api/board', { headers: {
      Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`,
    } })).json()).items);
    async function open() {
      app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
      page = await app.firstWindow();
      win = await app.browserWindow(page);
      await page.locator('.quick-title:enabled').waitFor();
      await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
      await page.evaluate(() => window.desktop.layout(true));
      await expect.poll(async () => {
        const width = await page.evaluate(() => innerWidth);
        if (width !== 1360) await win.evaluate(w => {
          if (w.isMaximized()) w.unmaximize();
          w.setContentSize(1360, 860);
        });
        return width;
      }).toBe(1360);
      await button('打开关系画布').click();
      await expect(card(0)).toBeVisible();
      await button('适配节点').click();
    }
    const setMode = async value => {
      await button('画布设置').click();
      await selectOption(page, '节点展示', value);
      await button('画布设置').click();
      await expect(page.getByRole('dialog', { name: '画布设置' })).toHaveCount(0);
      await expect(card(0)).toHaveAttribute('data-display', value);
      await expect.poll(async () => (await page.evaluate(() => window.desktop.info())).canvasOptions?.nodeDisplay).toBe(value);
    };

    await open();
    const before = await board();
    assert.deepEqual(await layout(1), [82, -140, 355, 174]);
    await expect(card(0).locator('strong')).toHaveText('发布评审');
    await expect(card(0).locator('strong')).toHaveCSS('font-size', '16px');
    await expect(card(0).locator('strong')).toHaveCSS('-webkit-line-clamp', '2');
    await expect(summary(0)).toHaveCSS('font-size', '13px');
    await expect(summary(0)).toHaveText(/确认首屏.*记录本轮.*反馈归档/s);
    assert.equal(await summary(0).evaluate(el => el.clientHeight), 54);
    await expect(card(0).getByLabel('1 个附件')).toBeVisible();
    await expect(card(1).locator('strong')).toHaveText('待确认的范围');
    await expect(summary(1)).toHaveText(/优先处理桌面端关键路径/);
    await expect(summary(1)).not.toContainText('<strong>');
    await expect(summary(2)).toHaveCount(0);
    assert.equal((await layout(2))[3], 104);
    await page.mouse.move(2, 54);
    await shot('detailed-light');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
    await shot('detailed-dark');

    await setMode('compact');
    await expect(summary(0)).toHaveCount(0);
    await expect(card(0).getByLabel('1 个附件')).toHaveCount(0);
    await expect(card(1).getByText('进行中')).toBeVisible();
    assert.equal((await layout(1))[3], 104);
    assert.deepEqual((await board())[samples[1].nodeId], before[samples[1].nodeId]);
    await page.mouse.move(2, 54);
    await shot('compact-dark');
    await app.close();
    app = undefined;
    await open();
    await expect(card(0)).toHaveAttribute('data-display', 'compact');
    await setMode('detailed');
    assert.deepEqual(await layout(1), [82, -140, 355, 174]);
    for (const id of edges) assert.deepEqual((await board())[id], before[id]);

    await card(0).locator('strong').dblclick();
    const editor = page.getByRole('textbox', { name: '节点正文' });
    const pathBeforeEdit = await edge(0).getAttribute('d');
    const long = '超长字符串'.repeat(110);
    await editor.fill(`**发布评审**\n# 更新后的摘要\n- 第二行\n第三行\n第四行\n${long}\n第六行`);
    await expect(summary(0)).toContainText('更新后的摘要');
    await expect(summary(0)).not.toContainText('#');
    await expect.poll(async () => (await layout(0))[3]).toBeGreaterThan(150);
    await expect.poll(() => edge(0).getAttribute('d')).not.toBe(pathBeforeEdit);
    assert((await layout(0))[3] <= 208);
    const fit = await summary(0).evaluate(el => {
      const body = el.getBoundingClientRect();
      const footer = el.nextElementSibling.getBoundingClientRect();
      return { height: el.clientHeight, widthFits: el.scrollWidth <= el.clientWidth, clearsFooter: body.bottom <= footer.top };
    });
    assert(fit.height >= 54 && fit.height <= 90 && fit.widthFits && fit.clearsFooter);
    await expect.poll(async () => (await board())[samples[0].recordId].value.text).toContain('**发布评审**');
    await button('关闭详情').click();

    const resizeHandle = card(1).getByRole('button', { name: '调整便签卡片尺寸' });
    const beforeResize = await edge(1).getAttribute('d');
    await resizeHandle.press('Shift+ArrowDown');
    await expect.poll(async () => (await layout(1))[3]).toBe(224);
    await expect.poll(() => edge(1).getAttribute('d')).not.toBe(beforeResize);
    await expect.poll(async () => (await board())[samples[1].nodeId].value.layout.height).toBe(224);
    const grip = await resizeHandle.boundingBox();
    const beforeDragResize = await edge(1).getAttribute('d');
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 30, grip.y + grip.height / 2, { steps: 8 });
    await expect.poll(async () => (await layout(1))[2]).toBe(385);
    assert.equal((await board())[samples[1].nodeId].value.layout.width, 355);
    await expect.poll(() => edge(1).getAttribute('d')).not.toBe(beforeDragResize);
    await page.mouse.up();
    await expect.poll(async () => (await board())[samples[1].nodeId].value.layout.width).toBe(385);

    await button('整理节点').click();
    await button('确认整理').click();
    await button('适配节点').click();
    const boxes = await Promise.all(samples.map((_, index) => layout(index)));
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) {
      assert(a[0] + a[2] <= b[0] || b[0] + b[2] <= a[0] || a[1] + a[3] <= b[1] || b[1] + b[3] <= a[1]);
    }
    for (const id of edges) assert.deepEqual((await board())[id], before[id]);
    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await button('适配节点').click();
    await expect(summary(0)).toBeVisible();
    for (const sample of samples) await expect(page.locator(`[data-topology-node="${sample.nodeId}"]`).getByRole('img', { name: '已保存' })).toBeVisible();
    await page.mouse.move(2, 54);
    await shot('maximized-light');
    await button('新建节点').click();
    await page.getByRole('menuitem', { name: '灵感', exact: true }).click();
    const created = page.locator('[data-topology-node][data-kind="idea"]');
    await expect(created).toHaveCSS('width', '300px');
    await expect(created).toHaveCSS('height', '104px');
    await button('新建节点').click();
    await page.getByRole('menuitem', { name: '自定义颜色…', exact: true }).click();
    const createColor = page.getByRole('dialog', { name: '新建自定义颜色节点' });
    await createColor.getByLabel('节点类型').selectOption('note');
    await createColor.getByLabel('颜色值').fill('invalid');
    await expect(createColor.getByRole('button', { name: '创建节点' })).toBeDisabled();
    await createColor.getByLabel('颜色值').fill('#1b65d8');
    await shot('color-picker-light');
    await createColor.getByRole('button', { name: '创建节点' }).click();
    const colored = page.locator('[data-node-color="#1b65d8"]');
    await expect(colored).toHaveCount(1);
    const coloredId = await colored.getAttribute('data-topology-node');
    await expect.poll(async () => (await board())[coloredId].value.layout.color).toBe('#1b65d8');
    await page.getByRole('textbox', { name: '节点正文' }).fill('配色示例\n节点可以独立设置颜色。');
    await button('关闭详情').click();
    await button('适配节点').click();
    const setNodeColor = async color => {
      await card(0).locator('strong').dblclick();
      await button('节点颜色').click();
      const dialog = page.getByRole('dialog', { name: '节点颜色', exact: true });
      if (color) {
        await dialog.getByLabel('颜色值').fill(color);
        await dialog.getByRole('button', { name: '保存颜色' }).click();
      } else await dialog.getByRole('button', { name: '恢复默认颜色' }).click();
      await button('关闭详情').click();
    };
    const version = await board();
    await setNodeColor('#258d59');
    await expect(card(0)).toHaveAttribute('data-node-color', '#258d59');
    await expect(card(0).locator('.topology-node-footer')).toHaveCSS('border-top-width', '0px');
    await expect(card(1)).not.toHaveAttribute('data-node-color');
    await expect.poll(async () => (await board())[samples[0].nodeId].value.layout.color).toBe('#258d59');
    assert.deepEqual((await board())[samples[0].recordId], version[samples[0].recordId]);
    await page.mouse.move(2, 54);
    await shot('colored-light');
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.style.colorScheme = 'dark'; });
    await shot('colored-dark');
    await setNodeColor(undefined);
    await expect(card(0)).not.toHaveAttribute('data-node-color');
    await button('撤销节点操作').click();
    await expect(card(0)).toHaveAttribute('data-node-color', '#258d59');
    await expect.poll(async () => (await board())[samples[0].nodeId].value.layout.color).toBe('#258d59');
    await app.close();
    app = undefined;
    await open();
    await expect(card(0)).toHaveAttribute('data-node-color', '#258d59');
    await expect.poll(async () => (await board())[coloredId]?.value?.layout?.color).toBe('#1b65d8');
    await expect(page.locator(`[data-topology-node="${coloredId}"]`)).toHaveAttribute('data-node-color', '#1b65d8');
    console.log('PASS Electron per-node colors, default reset, undo, restart persistence and borderless node footer');
    console.log('PASS Electron node cards, three-line preview, plain text, live updates, attachments, bounded growth, modes, resize, relationships, layout and maximized window');
  } finally {
    await app?.close();
    await fs.rm(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
