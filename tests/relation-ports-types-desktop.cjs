const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'test-results'), { recursive: true });
  const data = await fs.mkdtemp(path.join(root, 'test-results', 'relation-upgrade-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/relation-ports-types');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const sides = ['top', 'right', 'bottom', 'left'];
  const dense = process.env.ARASN_RELATION_DENSE === '1';
  const cards = [['评审准备', -120, -30], ['范围说明', -142, -258], ['原始依据', 240, -30],
    ['排期确认', -143, 206], ['补充材料', -490, -30]];
  const ids = cards.map(([title, x, y], index) => {
    const id = randomUUID();
    store.apply({ id, opId: randomUUID(), expected: 0, value: {
      type: 'text', text: `${title}\n确认前记录要点，保留每条关系的来龙去脉。`, color: '#263449', x: 120, y: 140,
      topology: { x, y, width: 270, height: 120, kind: 'note', status: 'open', ...(index === 4 && { locked: true }) },
    } });
    return id;
  });
  if (dense) {
    const roomId = store.snapshot().roomId;
    const insert = value => {
      const id = randomUUID();
      store.apply({ id, opId: randomUUID(), expected: 0, value });
      return id;
    };
    const nodes = Array.from({ length: 120 }, (_, index) => {
      const id = insert({ type: 'text', text: `验证节点 ${index + 1}\n画布密集场景`, color: '#263449', x: 0, y: 0 });
      return insert({ type: 'canvas-node', roomId, canvasId: roomId, contentRef: { kind: 'record', id },
        layout: { x: index % 12 * 265, y: Math.floor(index / 12) * 124, width: 220, height: 104, kind: 'note', status: 'open' } });
    });
    for (const [index, fromNodeId] of nodes.entries()) {
      for (const gap of [1, 12]) {
        const toNodeId = nodes[index + gap];
        if (toNodeId) insert({ type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId, toNodeId,
          label: '', relationType: 'related', direction: 'forward' });
      }
    }
  }
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const card = title => page.locator('[data-topology-node]').filter({ has: page.getByText(title, { exact: true }) });
  const shot = name => page.screenshot({ path: path.join(shots, `${name}.png`), scale: 'css' });
  const board = () => page.evaluate(async () => (await fetch('/api/board', {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` },
  })).json());
  const values = async type => Object.values((await board()).items).map(item => item.value).filter(value => value?.type === type);
  async function open() {
    app = await electron.launch({ args: ['.'], cwd: root, env });
    page = await app.firstWindow();
    page.on('pageerror', error => errors.push(error.message));
    if (await button('打开工作区').isVisible()) await button('打开工作区').click();
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.setContentSize(1440, 900); w.show(); w.focus(); });
    await button('打开关系画布').click();
    const upgrade = button('备份并启用关系画布');
    await expect(button('新建节点').or(upgrade)).toBeEnabled();
    if (await upgrade.isVisible()) await upgrade.click();
    await expect(button('新建节点')).toBeEnabled();
    await button('适配节点').click();
    return win;
  }
  const center = async locator => {
    const box = await locator.boundingBox();
    return [box.x + box.width / 2, box.y + box.height / 2];
  };
  const menu = async name => {
    await button('新建节点').click();
    await page.getByRole('menuitem', { name, exact: true }).click();
  };
  try {
    const win = await open();
    if (dense) {
      await expect(page.locator('[data-edge]')).toHaveCount(227);
      await button('整理节点').click();
      await page.evaluate(() => {
        const started = performance.now();
        const intervals = [];
        let previous = started;
        function frame(now) {
          intervals.push(now - previous);
          previous = now;
          if (now - started < 390) requestAnimationFrame(frame);
        }
        window.arrangementIntervals = intervals;
        document.querySelector('.relation-arrange-popup button.arasn-button-primary').click();
        requestAnimationFrame(frame);
      });
      await expect(page.getByText(/已整理 \d+ 个节点/)).toBeVisible();
      const intervals = (await page.evaluate(() => window.arrangementIntervals)).slice(1).sort((a, b) => a - b);
      assert(intervals.length >= 3);
      assert.equal((await values('canvas-edge')).length, 227);
      assert.deepEqual(errors, []);
      console.log(`120 nodes, 227 legacy edges: ${intervals.length} sampled frames, p50 ${intervals[Math.floor(intervals.length / 2)].toFixed(1)} ms`);
      return;
    }
    let source = card(cards[0][0]);
    const ports = source.locator('[data-port]');
    await expect(page.locator('[data-port]')).toHaveCount(0);
    await expect(button('创建连接')).toHaveCount(0);
    await shot('01-idle');
    await source.locator('strong').click();
    await expect(ports).toHaveCount(4);
    await page.mouse.move(125, 80);
    await shot('02-selected');

    for (const [index, side] of sides.entries()) {
      const destination = card(cards[index + 1][0]);
      const [portX, portY] = await center(source.locator(`[data-port="${side}"]`));
      await page.mouse.move(portX, portY);
      await page.mouse.down();
      if (index === 0) { await page.mouse.move(portX - 24, portY - 48, { steps: 5 }); await shot('03-drag-start'); }
      const [x, y] = await center(destination);
      const box = await destination.boundingBox();
      const offset = [[0, box.height / 2 - 6], [-box.width / 2 + 6, 0], [0, -box.height / 2 + 6], [box.width / 2 - 6, 0]][index];
      await page.mouse.move(x + offset[0], y + offset[1], { steps: 14 });
      await expect(destination).toHaveAttribute('data-connectable', 'true');
      await expect(destination.locator('[data-highlighted]')).toHaveAttribute('data-port', sides[(index + 2) % 4]);
      if (index === 0) await shot('04-drag-snap');
      await page.mouse.up();
      await expect.poll(async () => (await values('canvas-edge')).length).toBe(index + 1);
      const edge = (await values('canvas-edge')).find(value => value.fromPort === side);
      assert.equal(edge.toPort, sides[(index + 2) % 4]);
      await button('关闭关系详情').click();
      await source.locator('strong').click();
    }
    await page.mouse.move(...await center(source.locator('[data-port=right]')));
    await page.mouse.down();
    await page.mouse.move(...await center(card(cards[2][0])));
    await expect(page.locator('[data-connectable]')).toHaveCount(0);
    await page.mouse.up();
    assert.equal((await values('canvas-edge')).length, 4);
    await button('撤销节点操作').click();
    await expect.poll(async () => (await values('canvas-edge')).length).toBe(3);
    await button('重做节点操作').click();
    await expect.poll(async () => (await values('canvas-edge')).length).toBe(4);

    const locked = card(cards[4][0]);
    const before = await locked.getAttribute('style');
    const original = await source.evaluate(element => [element.style.left, element.style.top]);
    await button('整理节点').click();
    const popup = page.locator('.relation-arrange-popup');
    await expect(popup).toBeVisible();
    assert.equal(await popup.evaluate(element => getComputedStyle(element).transitionDuration.split(',')[0]), '0.18s');
    await page.waitForTimeout(210);
    await shot('05-arrange-popup');
    await page.evaluate(() => {
      document.querySelector('.relation-arrange-popup .dialog-actions button').click();
      window.arrangeExit = !!document.querySelector('.relation-arrange-popup');
    });
    assert(await page.evaluate(() => window.arrangeExit));
    await expect(popup).toHaveCount(0);
    await button('整理节点').click();
    await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('.relation-arrange-popup button')).find(item => item.textContent === '确认整理');
      const source = [...document.querySelectorAll('[data-topology-node]')].find(card => card.querySelector('strong').textContent === '评审准备');
      const samples = [];
      const start = performance.now();
      function sample(now) {
        if (now - start < 390) requestAnimationFrame(sample);
        const { left, top, width } = source.style;
        const path = [...document.querySelectorAll('[data-edge] .relation-line')].map(line => line.getAttribute('d'))
          .find(d => Math.abs(Number(d.split(' ')[1]) - parseFloat(left) - parseFloat(width) / 2) < .02 &&
            Math.abs(Number(d.split(' ')[2]) - parseFloat(top)) < .02);
        samples.push({ left, top, attached: !!path });
      }
      window.arrangeSamples = samples;
      button.click();
      requestAnimationFrame(sample);
    });
    await shot('06-arrange-in-motion');
    await expect(page.getByText(/已整理 \d+ 个节点/)).toBeVisible();
    const samples = await page.evaluate(() => window.arrangeSamples);
    assert(new Set(samples.map(sample => `${sample.left},${sample.top}`)).size >= 3);
    assert(samples.every(sample => sample.attached));
    assert.equal(await locked.getAttribute('style'), before);
    assert.equal((await values('canvas-edge')).length, 4);
    await shot('07-arranged');
    await button('撤销节点操作').click();
    await expect.poll(() => source.evaluate(element => [element.style.left, element.style.top])).toEqual(original);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await button('整理节点').click();
    assert.equal(await popup.evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    await button('确认整理').click();
    await expect(popup).toHaveCount(0);
    await button('撤销节点操作').click();
    await expect.poll(() => source.evaluate(element => [element.style.left, element.style.top])).toEqual(original);
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    await menu('自定义类型');
    await page.getByLabel('类型名称', { exact: true }).fill('里程碑');
    await page.getByLabel('图标', { exact: true }).selectOption('target');
    await page.getByLabel('自定义类型颜色', { exact: true }).fill('#bc3d70');
    await page.getByLabel('描述（可选）', { exact: true }).fill('记录需要验收的关键节点');
    await shot('08-type-create');
    await button('保存类型').click();
    await expect(page.getByRole('dialog', { name: '新建自定义类型' })).toHaveCount(0);
    await source.locator('strong').dblclick();
    await page.getByLabel('节点类型', { exact: true }).click();
    await page.getByRole('option', { name: '里程碑', exact: true }).click();
    await expect.poll(async () => (await values('canvas-node')).find(value => value.contentRef.id === ids[0])?.layout.customTypeId).toBeTruthy();
    await expect(source.locator('.topology-node-kind')).toHaveText('里程碑');
    await button('关闭详情').click();
    await menu('管理自定义类型…');
    await page.getByLabel('类型名称', { exact: true }).fill('验收里程碑');
    await button('保存类型').click();
    await expect(source.locator('.topology-node-kind')).toHaveText('验收里程碑');
    await expect(page.locator('.topology-type-dialog')).toHaveCount(0);
    await shot('09-type-light');
    await page.evaluate(async () => {
      await window.desktop.settings({ theme: 'dark' });
      document.documentElement.dataset.theme = 'dark';
    });
    await page.waitForTimeout(300);
    await shot('10-type-dark');
    await win.evaluate(w => w.setContentSize(390, 760));
    await button('适配节点').click();
    await shot('11-narrow');
    console.log('Narrow Electron viewport:', await page.evaluate(() => innerWidth));

    await app.close();
    await open();
    source = card(cards[0][0]);
    await expect(source.locator('.topology-node-kind')).toHaveText('验收里程碑');
    await expect(page.locator('[data-edge]')).toHaveCount(4);
    await menu('管理自定义类型…');
    await button('删除类型…').click();
    await expect(page.getByText(/用于 1 个节点/)).toBeVisible();
    await page.getByLabel('将节点迁移到').selectOption('task');
    await shot('12-type-migration');
    await button('确认删除类型').click();
    await expect(source.locator('.topology-node-kind')).toHaveText('待办');
    await expect(source).toContainText('确认前记录要点');
    await button('撤销节点操作').click();
    await expect(source.locator('.topology-node-kind')).toHaveText('验收里程碑');
    await button('重做节点操作').click();
    await expect(source.locator('.topology-node-kind')).toHaveText('待办');
    await expect(page.locator('[data-edge]')).toHaveCount(4);
    assert.deepEqual(errors, []);
    console.log(`Electron relation upgrade passed with ${samples.length} layout samples`);
  } finally {
    if (app) await app.close();
    await fs.rm(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
