const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-canvas-nav-'));
  const out = path.resolve(process.env.ARASN_CANVAS_NAV_SHOTS || 'docs/screenshots/relation-toolbar-integration');
  let app;
  try {
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark', shortcut: 'Control+Alt+F22' }));
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const button = name => page.getByRole('button', { name, exact: true });
    const shot = name => page.screenshot({ path: path.join(out, name + '.png'), animations: 'disabled' });
    await page.locator('.quick-title:enabled').waitFor();
    await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    await page.evaluate(() => window.desktop.layout(true));
    const resize = async (width, height) => {
      await expect.poll(async () => {
        const actual = await page.evaluate(() => [innerWidth, innerHeight]);
        if (actual[0] !== width || actual[1] !== height) {
          await win.evaluate((w, size) => {
            w.setMinimumSize(500, 540);
            w.setContentSize(...size);
          }, [width, height]);
        }
        return actual;
      }).toEqual([width, height]);
    };
    await resize(1240, 860);
    await button('我的随手页').click();
    const free = page.getByRole('toolbar', { name: '编辑工具' });
    const exportButton = target => target.getByRole('button', { name: '截图 / 导出' });
    const checkFullToolbar = async (rail, labels) => {
      await expect(rail).toHaveCSS('width', '112px');
      await expect(rail).toHaveCSS('border-radius', '15px');
      await expect(rail.locator('.free-tool-label,.free-tool-section,hr,[role="separator"]')).toHaveCount(0);
      await expect(rail.locator('.tool > span')).toHaveText(labels);
      const rows = await rail.locator('.tool:has(>span)').evaluateAll(tools => tools.map(tool => {
        const { top, bottom, height } = tool.getBoundingClientRect();
        const icon = tool.querySelector('svg').getBoundingClientRect();
        const text = tool.querySelector('span').getBoundingClientRect();
        return { top, bottom, height, iconX: icon.left, textX: text.left, iconWidth: icon.width, gap: text.left - icon.right, fontSize: getComputedStyle(tool).fontSize };
      }));
      for (const [index, row] of rows.entries()) {
        assert.equal(row.iconX, rows[0].iconX);
        assert.equal(row.textX, rows[0].textX);
        assert.deepEqual([row.height, row.iconWidth, row.gap, row.fontSize], [36, 18, 10, '14px']);
        if (index) assert.equal(row.top - rows[index - 1].bottom, 3);
      }
    };
    const checkNarrowToolbar = rail => expect.poll(() => rail.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.scrollWidth <= el.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
    })).toBe(true);
    const themeShots = async prefix => {
      await page.mouse.move(1, 1);
      for (const theme of ['light', 'dark']) {
        await page.evaluate(theme => {
          document.documentElement.dataset.theme = theme;
          document.documentElement.style.colorScheme = theme;
        }, theme);
        await shot(prefix + '-' + theme);
      }
    };
    await expect(exportButton(free)).toBeVisible();
    await expect(button('截图 / 导出')).toHaveCount(1);
    const metrics = () => page.locator('.sidebar :is(.nav-item-icon > svg, .sidebar-bottom .space > svg)').evaluateAll(icons =>
      icons.map(icon => {
        const { x, y, width, height } = icon.getBoundingClientRect();
        return [x + width / 2, y + height / 2].map(value => Math.round(value * 4) / 4);
      }));
    const openExport = async target => {
      await exportButton(target).click();
      await expect(page.getByRole('dialog', { name: '截图 / 导出' })).toBeVisible();
      await button('关闭截图导出').click();
    };
    for (const [width, height, name] of [[1240, 860, 'dark'], [820, 620, 'light-narrow']]) {
      await resize(width, height);
      await page.evaluate(theme => {
        document.documentElement.dataset.theme = theme;
        document.documentElement.style.colorScheme = theme;
      }, name === 'dark' ? 'dark' : 'light');
      const full = await metrics();
      assert(full.every(([x]) => Math.abs(x - 32) < 0.5), JSON.stringify(full));
      if (width === 820) {
        const rail = free.locator('.free-tool-rail[data-mode="compact"]');
        assert(await rail.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      }
      for (let repeat = 0; repeat < 2; repeat++) {
        await button('紧凑导航').click();
        await expect(page.locator('.sidebar')).toHaveCSS('width', '64px');
        assert.deepEqual(await metrics(), full);
        await button('展开导航').click();
        await expect(page.locator('.sidebar')).toHaveCSS('width', '200px');
        assert.deepEqual(await metrics(), full);
      }
    }
    await resize(1240, 860);
    await page.evaluate(() => {
      document.documentElement.dataset.theme = 'dark';
      document.documentElement.style.colorScheme = 'dark';
    });
    await openExport(free);
    await free.getByRole('button', { name: '添加图片或附件' }).click();
    await expect(page.getByRole('dialog', { name: '选择附件' })).toBeVisible();
    await button('关闭文件选择').click();
    await resize(540, 560);
    await checkNarrowToolbar(free.locator('.free-tool-rail[data-mode="minimal"]'));
    await free.getByRole('button', { name: '更多工具', exact: true }).click();
    await openExport(page.locator('.free-more-popup'));
    await resize(1240, 860);
    await button('紧凑导航').click();
    await expect(page.locator('.sidebar')).toHaveCSS('width', '64px');
    await checkFullToolbar(free.locator('.free-tool-rail'), ['选择', '画笔', '橡皮擦', '文字', '图形', '附件', '截图', '撤销', '重做', '删除']);
    const handle = button('拖动工具板');
    const grip = await handle.boundingBox();
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
    await page.mouse.down();
    await page.mouse.move(1200, 220, { steps: 14 });
    await page.mouse.up();
    await expect(free).toHaveAttribute('data-dock-side', 'right');
    await button('固定工具板').click();
    await expect(handle).toHaveAttribute('aria-disabled', 'true');
    await button('解锁工具板').click();
    await handle.dblclick();
    await expect(free).toHaveAttribute('data-dock-side', 'left');
    const pen = free.getByRole('button', { name: '自由绘图' });
    await pen.click();
    await pen.click();
    await expect(page.locator('.tool-settings-popup')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.tool-settings-popup')).toHaveCount(0);
    const canvas = await page.locator('.paper-scroll').boundingBox();
    const drawX = canvas.x + canvas.width / 2;
    const drawY = canvas.y + canvas.height / 2;
    await page.mouse.move(drawX, drawY);
    await page.mouse.down();
    await page.mouse.move(drawX + 60, drawY + 20, { steps: 10 });
    await page.mouse.up();
    const strokes = page.getByTestId('stroke');
    await expect(strokes).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(strokes).toHaveCount(0);
    await free.getByRole('button', { name: '重做上次操作' }).click();
    await expect(strokes).toHaveCount(1);
    await button('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    const relation = page.getByRole('complementary', { name: '关系画布工具' });
    await expect(upgrade.or(relation)).toBeVisible();
    if (await upgrade.isVisible()) await upgrade.click();
    await checkFullToolbar(relation, ['选择', '节点', '连线', '搜索', '截图', '整理', '设置']);
    await expect(page.locator('.relation-auxiliary')).toHaveCount(0);
    const remove = relation.getByRole('button', { name: '删除选中对象' });
    await expect(remove).toBeDisabled();
    const relationGrip = relation.getByRole('button', { name: '拖动工具板' });
    const relationGripBox = await relationGrip.boundingBox();
    await page.mouse.move(relationGripBox.x + relationGripBox.width / 2, relationGripBox.y + relationGripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(1200, 220, { steps: 14 });
    await page.mouse.up();
    await expect(relation).toHaveAttribute('data-dock-side', 'right');
    await relation.getByRole('button', { name: '搜索节点' }).click();
    const dockedSearch = page.getByRole('dialog', { name: '搜索节点' });
    await expect(dockedSearch).toBeVisible();
    const dockedPopup = await dockedSearch.boundingBox();
    assert(dockedPopup.x + dockedPopup.width <= (await relation.boundingBox()).x);
    await page.keyboard.press('Escape');
    await relation.getByRole('button', { name: '固定工具板' }).click();
    await expect(relationGrip).toHaveAttribute('aria-disabled', 'true');
    await relation.getByRole('button', { name: '解锁工具板' }).click();
    await relationGrip.dblclick();
    await expect(relation).toHaveAttribute('data-dock-side', 'left');
    await expect(button('截图 / 导出')).toHaveCount(1);
    await openExport(relation);
    const notification = button('关闭通知');
    if (await notification.isVisible()) await notification.click();
    await expect(notification).toHaveCount(0);
    await resize(540, 560);
    await checkNarrowToolbar(relation);
    for (const [width, height] of [[540, 560], [1240, 860]]) {
      await resize(width, height);
      const settings = relation.getByRole('button', { name: '画布设置' });
      await settings.focus();
      await page.keyboard.press('Enter');
      const grid = page.getByRole('checkbox', { name: '显示网格' });
      await expect(grid).toBeInViewport();
      const checked = await grid.isChecked();
      await grid.click();
      await expect(grid).toBeChecked({ checked: !checked });
      await page.keyboard.press('Escape');
      await expect(grid).toHaveCount(0);
    }
    const nodes = page.locator('[data-topology-node]');
    const create = relation.getByRole('button', { name: '新建节点' });
    const createKind = async label => {
      await create.click();
      await page.getByRole('menuitem', { name: label, exact: true }).click();
    };
    await createKind('便签');
    await expect(nodes).toHaveCount(1);
    const firstNode = page.locator(`[data-topology-node="${await nodes.first().getAttribute('data-topology-node')}"]`);
    await page.getByRole('textbox', { name: '节点正文' }).fill('迭代计划\n核对键盘搜索及恢复。');
    await expect(firstNode).toContainText('迭代计划');
    await createKind('问题');
    await expect(nodes).toHaveCount(2);
    await relation.locator('[data-selected] [data-port=right]').press('Enter');
    await expect(relation.locator('.relation-draft')).toHaveCount(1);
    await firstNode.locator('[data-drag-handle]').click();
    const edges = page.locator('.relation-edges [data-edge]');
    await expect(edges).toHaveCount(1);
    await relation.getByRole('button', { name: '撤销节点操作' }).click();
    await expect(edges).toHaveCount(0);
    await relation.getByRole('button', { name: '重做节点操作' }).click();
    await expect(edges).toHaveCount(1);
    await edges.locator('.relation-hit').press('Enter');
    await remove.click();
    let confirmation = page.getByRole('alertdialog', { name: '删除连接' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: '取消' }).click();
    await expect(edges).toHaveCount(1);
    await remove.click();
    await confirmation.getByRole('button', { name: '确认删除' }).click();
    await expect(edges).toHaveCount(0);
    await relation.getByRole('button', { name: '撤销节点操作' }).click();
    await expect(edges).toHaveCount(1);
    const positions = () => nodes.evaluateAll(cards => cards.map(card => [card.style.left, card.style.top]));
    const initialPositions = await positions();
    const nodeGrip = await firstNode.locator('[data-drag-handle]').boundingBox();
    const x = nodeGrip.x + nodeGrip.width / 2;
    const y = nodeGrip.y + nodeGrip.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 60, { steps: 10 });
    await page.mouse.up();
    await expect.poll(positions).not.toEqual(initialPositions);
    const beforeArrange = await positions();
    await relation.getByRole('button', { name: '整理节点' }).click();
    await button('确认整理').click();
    await expect.poll(positions).not.toEqual(beforeArrange);
    await relation.getByRole('button', { name: '选择与平移' }).click();
    const world = page.locator('.topology-world');
    const transform = () => world.evaluate(el => el.style.transform);
    const beforePan = await transform();
    const viewport = await page.getByRole('region', { name: '节点画布' }).boundingBox();
    const panX = viewport.x + viewport.width * 0.7;
    const panY = viewport.y + viewport.height * 0.2;
    await page.mouse.move(panX, panY);
    await page.mouse.down();
    await page.mouse.move(panX + 55, panY + 25, { steps: 10 });
    await page.mouse.up();
    await expect.poll(transform).not.toBe(beforePan);
    const beforeZoom = await transform();
    await button('放大画布').click();
    await expect.poll(transform).not.toBe(beforeZoom);
    for (const [label, kind] of [['灵感', 'idea'], ['待办', 'task']]) {
      await createKind(label);
      await expect(nodes.locator(`xpath=self::*[@data-kind="${kind}"]`)).toHaveCount(1);
    }
    await relation.getByRole('button', { name: '选择与平移' }).click();
    await button('适配节点').click();
    await themeShots('relation');
    await create.click();
    await expect(page.getByRole('menuitem')).toHaveText(['便签', '问题', '灵感', '待办', '自定义颜色…']);
    await shot('node-types-dark');
    await page.keyboard.press('Escape');

    const canvasViewport = page.getByRole('region', { name: '节点画布' });
    await canvasViewport.focus();
    const viewportBeforeSearch = await canvasViewport.boundingBox();
    await page.keyboard.press('Control+f');
    const search = page.getByRole('combobox', { name: '搜索节点' });
    await expect(search).toBeFocused();
    await search.fill('键盘搜索');
    await expect(page.getByRole('option')).toHaveText('迭代计划');
    assert.deepEqual(await canvasViewport.boundingBox(), viewportBeforeSearch);
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option', { selected: true })).toHaveText('迭代计划');
    await shot('search-dark');
    await page.keyboard.press('Enter');
    await expect(search).toHaveCount(0);
    await expect(firstNode).toHaveAttribute('data-selected', 'true');

    await remove.click();
    confirmation = page.getByRole('alertdialog', { name: '移除 1 个节点' });
    await expect(confirmation).toContainText('原始便签仍会保留');
    await shot('delete-confirmation-dark');
    await confirmation.getByRole('button', { name: '确认删除' }).click();
    await expect(firstNode).toHaveCount(0);
    await relation.getByRole('button', { name: '撤销节点操作' }).click();
    await expect(firstNode).toBeVisible();
    await relation.getByRole('button', { name: '重做节点操作' }).click();
    await expect(firstNode).toHaveCount(0);
    await relation.getByRole('button', { name: '画布设置' }).click();
    await button('已移除节点').click();
    await button('恢复 迭代计划').click();
    await expect(firstNode).toBeVisible();

    await resize(540, 560);
    await checkNarrowToolbar(relation);
    await expect(page.locator('.window-page-title')).toHaveText('关系画布');
    const railBox = await relation.boundingBox();
    const zoomBox = await page.locator('.topology-zoom').boundingBox();
    assert(railBox.y + railBox.height <= zoomBox.y, 'The narrow toolbar must leave a gap above zoom controls');
    await button('适配节点').click();
    await expect(relationGrip).toHaveAttribute('aria-disabled', 'true');
    await relation.getByRole('button', { name: '搜索节点' }).click();
    await search.fill('迭代计划');
    await expect(page.getByRole('option')).toHaveText('迭代计划');
    const popup = await page.getByRole('dialog', { name: '搜索节点' }).boundingBox();
    assert(popup.x >= 0 && popup.y >= 0 && popup.x + popup.width <= 540 && popup.y + popup.height <= 560);
    await themeShots('search-narrow');
    await page.keyboard.press('Escape');
    await expect(search).toHaveCount(0);
    console.log('PASS canvas toolbar layout, docking, node types, search, confirmed deletion, recovery, undo/redo, connection, arrangement, pan and zoom');
  } finally {
    await app?.close();
    await fs.rm(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
