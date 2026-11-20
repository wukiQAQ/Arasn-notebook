const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-motion-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/relation-motion');
  await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const types = ['related', 'reference', 'dependency', 'resolves', 'attachment', 'source'];
  const titles = ['评审准备', '范围说明', '原始依据', '排期确认', '已解决的问题', '补充材料', '来源记录'];
  const records = titles.map((text, i) => {
    const id = randomUUID();
    store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text: `${text}\n关系帮助理解内容之间的联系。`, color: '#263449', x: 120, y: 140,
      topology: { x: i ? 180 : -400, y: i ? (i - 1) * 155 - 390 : -20, width: 280, height: 132, kind: 'note', status: 'open' } } });
    return id;
  });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const metrics = {};
  try {
    app = await electron.launch({ args: ['.'], cwd: path.resolve(__dirname, '..'), env });
    page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    if (await button('打开工作区').isVisible()) await button('打开工作区').click();
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.setContentSize(1440, 900); w.show(); w.focus(); });
    await button('打开关系画布').click();
    if (await button('备份并启用关系画布').isVisible()) await button('备份并启用关系画布').click();
    await expect(button('新建节点')).toBeEnabled();
    const snapshot = await page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    const nodes = records.map(id => Object.entries(snapshot.items).find(([, item]) => item.value?.type === 'canvas-node' && item.value.contentRef.id === id)[0]);
    const base = snapshot.items[nodes[0]].value;
    const edges = types.map((type, i) => ({ id: randomUUID(), expected: 0, opId: randomUUID(), value: { type: 'canvas-edge', roomId: base.roomId, canvasId: base.canvasId, fromNodeId: nodes[0], toNodeId: nodes[i + 1], relationType: type, label: '', direction: 'forward' } }));
    const apply = operations => page.evaluate(async operations => {
      for (const operation of operations) {
        const response = await fetch('/api/ops', { method: 'POST', headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}`, 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
        if (!response.ok) throw new Error(await response.text());
      }
    }, operations);
    await apply(edges);
    // API fixtures bypass renderer edits; refresh after the final board notification.
    await expect.poll(async () => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:focus'));
      return page.locator('[data-edge]').count();
    }).toBe(6);
    await expect(page.locator('.relation-flow')).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await button('适配节点').click();
    for (const [delta, name] of [[5000, '25'], [-5000, '200']]) {
      await page.locator('.topology-viewport').hover(); await page.keyboard.down('Control'); await page.mouse.wheel(0, delta); await page.keyboard.up('Control');
      await expect(button('复位视图')).toHaveText(`${name}%`);
      const sizes = await page.locator(`[data-edge="${edges[0].id}"] .relation-line`).evaluate(el => {
        const matrix = el.getScreenCTM(), marker = document.getElementById(el.getAttribute('marker-end').slice(5, -1));
        return { arrow: marker.markerWidth.baseVal.value * Math.hypot(matrix.a, matrix.b), label: el.closest('g').querySelector('.relation-label').getBoundingClientRect().height };
      });
      assert(Math.abs(sizes.arrow - 10) < .1); assert(sizes.label >= 24 && sizes.label <= 28);
      await page.screenshot({ path: path.join(shots, `arrows-${name}.png`), scale: 'css', animations: 'disabled' });
    }
    await button('适配节点').click();
    const inspectColors = () => page.evaluate(() => {
      const context = document.createElement('canvas').getContext('2d');
      function rgba(color) { context.clearRect(0, 0, 1, 1); context.fillStyle = color; context.fillRect(0, 0, 1, 1); return [...context.getImageData(0, 0, 1, 1).data]; }
      function lum(rgb) { return rgb.slice(0,3).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055)/1.055) ** 2.4; }).reduce((a,b,i) => a+b*[.2126,.7152,.0722][i],0); }
      const canvas = rgba(getComputedStyle(document.querySelector('.topology-viewport')).backgroundColor);
      return [...document.querySelectorAll('[data-edge]')].map(g => {
        const line = getComputedStyle(g.querySelector('.relation-line')).stroke;
        const label = getComputedStyle(g.querySelector('.relation-label'));
        const background = rgba(label.backgroundColor); const alpha = background[3]/255;
        const bg = background.slice(0,3).map((v,i) => v*alpha+canvas[i]*(1-alpha));
        const a=lum(rgba(label.color)), b=lum(bg);
        const markerId=g.querySelector('.relation-line').getAttribute('marker-end').slice(5,-1);
        const arrow = rgba(getComputedStyle(document.getElementById(markerId).querySelector('path')).stroke);
        const flow=g.querySelector('.relation-flow');
        return { type: g.dataset.relation, color: rgba(line), arrow, label: rgba(label.color), flow: flow ? rgba(getComputedStyle(flow).stroke) : null, contrast: (Math.max(a,b)+.05)/(Math.min(a,b)+.05) };
      });
    });
    metrics.darkColors = await inspectColors();
    assert.equal(new Set(metrics.darkColors.map(row => row.color.join(','))).size, 5);
    for (const row of metrics.darkColors) { assert.deepEqual(row.color,row.label); assert.deepEqual(row.color,row.arrow); assert(row.contrast >= 4.5, `${row.type} dark label contrast ${row.contrast}`); }
    await page.locator('.relation-legend summary').click();
    await page.screenshot({ path: path.join(shots, 'colors-dark-default.png'), scale: 'css', animations: 'disabled' });
    await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; });
    metrics.lightColors = await inspectColors();
    for (const row of metrics.lightColors) { assert.deepEqual(row.color,row.label); assert.deepEqual(row.color,row.arrow); assert(row.contrast >= 4.5, `${row.type} light label contrast ${row.contrast}`); }
    await page.screenshot({ path: path.join(shots, 'colors-light-default.png'), scale: 'css', animations: 'disabled' });
    // Exercise rendered end tangents and marker dimensions in both horizontal directions and vertical offsets.
    const originalTarget = snapshot.items[nodes[1]].value;
    for (const [dx, dy] of [[620, 0], [-620, 0], [0, -360], [0, 360]]) {
      const current = await page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
      const line = page.locator(`[data-edge="${edges[0].id}"] .relation-line`), before = await line.getAttribute('d');
      await apply([{ id: nodes[1], expected: current.items[nodes[1]].version, opId: randomUUID(), value: { ...originalTarget, layout: { ...originalTarget.layout, x: base.layout.x + dx, y: base.layout.y + dy } } }]);
      await expect(line).not.toHaveAttribute('d', before);
      const measured = await line.evaluate(el => {
        const length = el.getTotalLength(), end = el.getPointAtLength(length), near = el.getPointAtLength(length - .05);
        const scale = Math.hypot(el.getScreenCTM().a, el.getScreenCTM().b), marker = document.getElementById(el.getAttribute('marker-end').slice(5, -1));
        return { tx: end.x - near.x, ty: end.y - near.y, arrow: marker.markerWidth.baseVal.value * scale, units: marker.getAttribute('markerUnits') };
      });
      if (dx === 0) {
        assert(Math.abs(measured.tx) < .01);
        assert.equal(Math.sign(measured.ty), Math.sign(dy));
      } else {
        assert(Math.abs(measured.ty) < .01);
        assert.equal(Math.sign(measured.tx), Math.sign(dx));
      }
      assert(Math.abs(measured.arrow - 10) < .1, JSON.stringify(measured)); assert.equal(measured.units, 'userSpaceOnUse');
      if (dx < 0) { await button('适配节点').click(); await page.screenshot({ path: path.join(shots, 'reverse-arrow.png'), scale: 'css', animations: 'disabled' }); }
    }
    const changedTarget = await page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    await apply([{ id: nodes[1], expected: changedTarget.items[nodes[1]].version, opId: randomUUID(), value: originalTarget }]);
    await button('适配节点').click();
    await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
    await page.locator('.relation-legend summary').click();
    const card = page.locator(`[data-topology-node="${nodes[0]}"]`);
    await card.click();
    await expect(page.locator('.relation-flow, .relation-edges animateMotion')).toHaveCount(0);
    for (const row of await inspectColors()) { assert.deepEqual(row.color,row.arrow); }
    // Hover preserves hue and subtly emphasizes the two endpoints.
    await page.locator(`[data-edge="${edges[2].id}"] .relation-hit`).hover();
    await expect(page.locator('[data-topology-node][data-relation-focus]')).toHaveCount(2);
    await page.screenshot({ path: path.join(shots, 'colors-hover.png'), scale: 'css', animations: 'disabled' });
    await card.focus();
    await card.press('Enter');
    const edit = card.getByRole('button', { name: '编辑节点', exact: true });
    const box = await edit.boundingBox(); assert(box.height >= 31.9 && box.width >= 38);
    const anchor = await card.locator('[data-port=right]').boundingBox(); assert(anchor.width >= 31.9);
    const cardBox = await card.boundingBox(); assert(box.y + box.height <= cardBox.y);
    await button('更多节点操作').click(); await expect(card.getByText('节点属性', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape'); await expect(card.getByText('节点属性', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: path.join(shots, 'desktop-selected.png'), scale: 'css', animations: 'disabled' });
    const sample = async () => {
      await win.evaluate(w => { w.show(); w.focus(); });
      return page.evaluate(async () => {
      const deltas = []; let previous = performance.now();
      for (let i = 0; i < 120; i++) { const now = await new Promise(requestAnimationFrame); if (i > 5) deltas.push(now - previous); previous = now; }
      deltas.sort((a,b) => a-b); return { median: deltas[Math.floor(deltas.length / 2)], p95: deltas[Math.floor(deltas.length * .95)], over32ms: deltas.filter(n => n > 32).length, samples: deltas.length, visibility: document.visibilityState, focused: document.hasFocus() };
    }); };
    metrics.full = await sample();
    // Relationship focus is static; endpoint arrows still follow the path tangent.
    const hit = page.locator(`[data-edge="${edges[1].id}"] .relation-hit`);
    await hit.focus(); await page.keyboard.press('Enter');
    await expect(page.getByLabel('关系类型', { exact: true })).toContainText('引用');
    await expect(page.locator('[data-edge][data-muted]')).toHaveCount(5);
    const peer = { ...edges[1], id: randomUUID(), opId: randomUUID(), value: { ...edges[1].value, fromNodeId: nodes[1], toNodeId: nodes[2] } };
    await apply([peer]);
    await expect(page.locator('[data-edge][data-peer]')).toHaveCount(0);
    await expect(page.locator('[data-edge][data-muted]')).toHaveCount(6);
    await expect(page.locator(`[data-edge="${peer.id}"]`)).toHaveAttribute('data-muted', 'true');
    const sameColor = await page.locator(`[data-edge="${peer.id}"] .relation-line`).evaluate(el => getComputedStyle(el).stroke);
    assert.notEqual(sameColor, await page.locator(`[data-edge="${edges[1].id}"] .relation-line`).evaluate(el => getComputedStyle(el).stroke));
    const badge = page.locator('.topology-inspector .relation-type-key');
    const baseline = metrics.darkColors.find(row => row.type === 'reference').color.slice(0,3).join(', ');
    await expect(badge).toHaveCSS('color', `rgb(${baseline})`);
    await button('关闭关系详情').click();
    await page.screenshot({ path: path.join(shots, 'colors-selected-type.png'), scale: 'css', animations: 'disabled' });
    await hit.focus(); await page.keyboard.press('Enter');
    await apply([{ ...peer, value: null, expected: 1, opId: randomUUID() }]);
    await expect(page.locator('[data-edge]')).toHaveCount(6);
    await require('./helpers/select-option.cjs').selectOption(page, '关系方向', 'both');
    await expect(page.locator(`[data-edge="${edges[1].id}"] .relation-line`)).toHaveAttribute('marker-start', /url/);
    await expect(page.locator(`[data-edge="${edges[1].id}"] .relation-line`)).toHaveAttribute('marker-end', /url/);

    await require('./helpers/select-option.cjs').selectOption(page, '关系方向', 'none');
    await expect(page.locator(`[data-edge="${edges[1].id}"] .relation-flow`)).toHaveCount(0);
    await expect(page.locator(`[data-edge="${edges[1].id}"] .relation-line`)).not.toHaveAttribute('marker-end');
    await require('./helpers/select-option.cjs').selectOption(page, '关系方向', 'forward');
    await button('关闭关系详情').click(); await card.click();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(page.locator('.relation-flow')).toHaveCount(0);
    await page.screenshot({ path: path.join(shots, 'reduced-motion.png'), scale: 'css', animations: 'disabled' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const sourceCard = page.locator(`[data-topology-node="${nodes[1]}"]`);
    await sourceCard.click(); await sourceCard.locator('[data-port=right]').press('Enter');
    await page.locator(`[data-topology-node="${nodes[2]}"]`).click();
    await expect(page.locator('[data-edge]')).toHaveCount(7);
    await button('删除连接').click(); await expect(page.locator('[data-edge]')).toHaveCount(6);
    await card.dblclick(); await expect(page.getByLabel('节点正文', { exact: true })).toBeFocused(); await button('关闭详情').click();
    await win.evaluate(w => w.setContentSize(820, 900)); await button('适配节点').click(); await card.click();
    await page.screenshot({ path: path.join(shots, 'intermediate-820.png'), scale: 'css', animations: 'disabled' });
    await win.evaluate(w => { w.setMinimumSize(350, 460); w.setContentSize(390, 844); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390); await button('复位视图').click(); await card.press('Enter');
    // Recenter the selected node via minimap fit, then verify controls stay usable at fit zoom.
    await button('适配节点').click();
    await page.screenshot({ path: path.join(shots, 'mobile-390.png'), scale: 'css', animations: 'disabled' });
    const smallButton = await card.getByRole('button', { name: '编辑节点', exact: true }).boundingBox(); assert(smallButton.height >= 31.9 && smallButton.x >= 0 && smallButton.x + smallButton.width <= 390);
    await win.evaluate(w => w.setContentSize(1440, 900)); await button('复位视图').click();
    const extra = Array.from({ length: 293 }, (_, i) => ({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { ...base, layout: { ...base.layout, x: 1500 + (i % 20) * 320, y: Math.floor(i / 20) * 180 } } }));
    await apply(extra.slice(0, 93));
    await expect(page.locator('.topology-viewport')).toHaveAttribute('data-motion', 'static');
    await card.press('Enter'); await expect(page.locator('.relation-flow')).toHaveCount(0);
    metrics.limited100 = await sample();
    await apply(extra.slice(93));
    const allIds = [...nodes, ...extra.map(node => node.id)];
    await apply(Array.from({ length: 494 }, (_, i) => ({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { ...edges[i % 6].value, fromNodeId: allIds[i % 300], toNodeId: allIds[(i + 7) % 300] } })));
    await expect(page.locator('.topology-viewport')).toHaveAttribute('data-motion', 'static');
    await expect(page.locator('.relation-flow')).toHaveCount(0);
    const fixtureState = await page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    metrics.fixtureCounts = { server: Object.values(fixtureState.items).filter(item => item.value?.type === 'canvas-edge').length, renderedBeforeRefresh: await page.locator('[data-edge]').count() };
    assert.equal(metrics.fixtureCounts.server, 500);
    await expect.poll(async () => {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:focus'));
      return page.locator('[data-edge]').count();
    }).toBe(500);
    metrics.static300nodes500edges = await sample();
    const viewport = page.locator('.topology-viewport');
    const blank = await viewport.evaluate(element => {
      const box = element.getBoundingClientRect();
      for (let y = box.top + 50; y < box.bottom - 140; y += 32) {
        for (let x = box.left + 115; x < box.right - 140; x += 32) {
          if (document.elementFromPoint(x, y) === element) return { x, y };
        }
      }
      throw new Error('No unobstructed canvas point for panning');
    });
    await page.mouse.move(blank.x, blank.y); await page.mouse.down({ button: 'middle' });
    await page.mouse.move(blank.x + 10, blank.y + 10);
    await expect(viewport).toHaveAttribute('data-panning', 'true');
    const panSample = sample();
    await page.mouse.move(blank.x + 120, blank.y + 80, { steps: 120 });
    metrics.panning300nodes500edges = await panSample;
    await page.mouse.up({ button: "middle" });
    await page.screenshot({ path: path.join(shots, 'stress-static.png'), scale: 'css', animations: 'disabled' });
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(shots, 'performance.json'), JSON.stringify(metrics, null, 2));
    console.log('PASS semantic theme colors, label contrast, single-edge selection, same-color endpoint arrows, toolbar sizes, anchors, menu/Escape, type semantics, static feedback, bidirectional/none, reduced motion, 820/390px, 100/300-node static rendering; frame intervals:', metrics);
  } catch (error) { if (page) await page.screenshot({ path: path.join(shots, 'failure.png'), scale: 'css', animations: 'disabled' }).catch(() => {}); throw error; }
  finally { if (app) await app.close(); const resolved = await fs.realpath(data); assert.equal(path.dirname(resolved), await fs.realpath(os.tmpdir())); await fs.rm(resolved, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
