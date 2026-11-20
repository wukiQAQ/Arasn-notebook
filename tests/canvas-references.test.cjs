const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createStore, legacySnapshot, startServer } = require('../desktop/server.cjs');

const layout = { x: -50, y: 90, width: 280, height: 140, kind: 'note', status: 'open' };
const text = { type: 'text', text: '唯一正文', x: 100, y: 100, color: '#263449' };
const op = (id, value, expected = 0) => ({ id, value, expected, opId: randomUUID() });
const node = (roomId, id) => ({ type: 'canvas-node', roomId, canvasId: roomId,
  contentRef: { kind: 'record', id }, layout });

test('references preserve one body, independent versions and missing targets', () => {
  const store = createStore(), roomId = store.snapshot().roomId;
  const record = randomUUID(), ref = randomUUID();
  store.apply(op(record, text));
  store.apply(op(ref, node(roomId, record)));
  store.apply(op(ref, { ...node(roomId, record), layout: { ...layout, x: 200 } }, 1));
  store.apply(op(record, { ...text, text: '新正文' }, 1));
  assert.equal(store.snapshot().items[record].version, 2);
  assert.equal(store.snapshot().items[ref].version, 2);
  assert.equal(store.snapshot().items[ref].value.text, undefined);
  store.apply(op(record, null, 2));
  assert.equal(store.snapshot().items[ref].value.contentRef.id, record);
  assert.throws(() => store.apply(op(ref, text, 2)), { status: 409 });
});

test('local references, local records and tombstones never enter old sharing', () => {
  const store = createStore(), roomId = store.snapshot().roomId;
  const record = randomUUID(), a = randomUUID(), b = randomUUID(), edge = randomUUID(), link = randomUUID();
  store.apply(op(record, { ...text, localOnly: true }));
  store.apply(op(a, node(roomId, record)));
  store.apply(op(b, node(roomId, record)));
  store.apply(op(edge, { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: a, toNodeId: b, label: '相关', direction: 'forward' }));
  store.apply(op(link, { type: 'content-link', roomId, recordId: record, targetRef: { kind: 'file', id: randomUUID() } }));
  for (const id of [record, a, b, edge, link]) {
    assert.throws(() => store.apply(op(id, null, 1), { legacyOnly: true }), { status: 403 });
  }
  assert.deepEqual(legacySnapshot(store.snapshot()).items, {});
  store.apply(op(a, null, 1));
  store.apply(op(record, null, 1));
  assert.deepEqual(legacySnapshot(store.snapshot()).items, {});
  assert.throws(() => store.apply(op(randomUUID(), node(roomId, record)), { legacyOnly: true }), { status: 403 });
});

test('reference validation rejects cross-room, malformed refs and invalid edges', () => {
  const store = createStore(), roomId = store.snapshot().roomId, record = randomUUID();
  for (const value of [
    node(randomUUID(), record),
    { ...node(roomId, record), contentRef: { kind: 'path', id: '../file' } },
    { ...node(roomId, record), layout: { ...layout, x: Infinity } },
    { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: record, toNodeId: record, label: '', direction: 'forward' },
  ]) assert.throws(() => store.apply(op(randomUUID(), value)), { status: 400 });
  const id = randomUUID();
  store.apply(op(id, { ...text, localOnly: true }));
  assert.throws(() => store.apply(op(id, text, 1)), { status: 409 });
});

test('migration plans are stable, preserve hidden layout, never copy bodies and detect collisions', () => {
  const { planCanvasMigration } = require('../desktop/engines/canvas-migration.cjs');
  const store = createStore(), record = randomUUID(), oldNode = randomUUID();
  store.apply(op(record, text));
  store.apply(op(oldNode, { type: 'node', text: '旧节点', topology: { ...layout, hidden: true } }));
  const before = store.dump(), plan = planCanvasMigration(before);
  assert.equal(plan.operations.length, 2);
  assert.deepEqual(plan, planCanvasMigration(before));
  for (const operation of plan.operations) store.apply(operation);
  assert.deepEqual(store.snapshot().items[record], before.items[record]);
  assert.deepEqual(store.snapshot().items[oldNode], before.items[oldNode]);
  assert.equal(plan.operations.find(o => o.value.contentRef.id === oldNode).value.layout.hidden, true);
  assert(plan.operations.every(o => !('text' in o.value)));
  assert.equal(planCanvasMigration(store.dump()).operations.length, 0);
  const collision = structuredClone(before);
  collision.items[plan.operations[0].id] = { version: 1, value: text };
  assert.throws(() => planCanvasMigration(collision), /冲突/);
});

test('selectors resolve deleted records and purged files without dropping the reference', () => {
  const { resolveContent, nodesForContent, relatedContent } = require('../src/content-links.ts');
  const store = createStore(), roomId = store.snapshot().roomId, record = randomUUID(), refId = randomUUID();
  store.apply(op(record, text)); store.apply(op(refId, node(roomId, record)));
  assert.equal(resolveContent(store.snapshot().items, { kind: 'record', id: record }).text, text.text);
  store.apply(op(record, null, 1));
  assert.equal(resolveContent(store.snapshot().items, { kind: 'record', id: record }).state, 'deleted');
  assert.equal(nodesForContent(store.snapshot().items, roomId, { kind: 'record', id: record }).length, 1);
  assert.equal(nodesForContent(store.snapshot().items, randomUUID(), { kind: 'record', id: record }).length, 0);
  assert.deepEqual(relatedContent(store.snapshot().items, roomId, record), []);
  assert.equal(resolveContent({}, { kind: 'file', id: 'x' }, [{ id: 'x', status: 'purged', deleted_at: 'now' }]).state, 'purged');
});

test('migration checks capacity before writing and rejects cross-canvas edges', () => {
  const { planCanvasMigration } = require('../desktop/engines/canvas-migration.cjs');
  const store = createStore(), state = store.dump();
  for (let index = 0; index < 5000; index++) state.items[index.toString(16).padStart(32, '0')] = {
    version: 1, value: index === 0 ? text : { type: 'stroke', color: '#263449', width: 2, points: [[0, 0]] },
  };
  assert.throws(() => planCanvasMigration(state), { status: 413 });
  const a = randomUUID(), b = randomUUID();
  store.apply(op(a, node(state.roomId, randomUUID())));
  store.apply(op(b, { ...node(state.roomId, randomUUID()), canvasId: randomUUID() }));
  assert.throws(() => store.apply(op(randomUUID(), { type: 'canvas-edge', roomId: state.roomId, canvasId: state.roomId,
    fromNodeId: a, toNodeId: b, label: '', direction: 'none' })), { status: 400 });
});

test('legacy HTTP clients cannot read, create or delete private references', async () => {
  const store = createStore(), roomId = store.snapshot().roomId, record = randomUUID(), ref = randomUUID();
  store.apply(op(record, { ...text, localOnly: true }));
  store.apply(op(ref, node(roomId, record)));
  const service = await startServer({ store, token: 'test-canvas-token', legacyOnly: true });
  const url = `http://127.0.0.1:${service.port}`;
  const headers = { Authorization: 'Bearer test-canvas-token', 'Content-Type': 'application/json' };
  try {
    assert.deepEqual((await (await fetch(`${url}/api/board`, { headers })).json()).items, {});
    for (const operation of [op(ref, null, 1), op(record, null, 1), op(randomUUID(), node(roomId, record))]) {
      assert.equal((await fetch(`${url}/api/ops`, { method: 'POST', headers, body: JSON.stringify(operation) })).status, 403);
    }
    store.apply(op(ref, null, 1));
    assert.deepEqual((await (await fetch(`${url}/api/board`, { headers })).json()).items, {});
  } finally { await service.close(); }
});
test('relation geometry follows horizontal port tangents and keeps screen-space endpoint clearance', () => {
  const { relationGeometry } = require('../src/topology.ts');
  const a = { x: 0, y: 0, width: 280, height: 140 };
  for (const zoom of [.25, 1, 2]) for (const [x, y] of [[600, 0], [-600, 0], [600, -400], [-600, 400]]) {
    const b = { ...a, x, y }, g = relationGeometry(a, b, zoom);
    assert.equal(g.start.y, g.c1.y); assert.equal(g.end.y, g.c2.y);
    assert.equal(Math.sign(g.end.x - g.c2.x), g.direction);
    const targetPort = g.direction > 0 ? b.x : b.x + b.width;
    const sourcePort = g.direction > 0 ? a.x + a.width : a.x;
    const gap = (targetPort - sourcePort) * g.direction;
    const clearance = gap > 0 ? Math.min(1, gap * zoom / 32) : 1;
    assert(Math.abs(Math.abs(g.end.x - targetPort) * zoom - 10 * clearance) < .001);
    assert(!/NaN|Infinity/.test(g.path));
  }
});

test('short separated relation curves do not reverse or overlap their ports at any zoom', () => {
  const { relationGeometry } = require('../src/topology.ts');
  for (const zoom of [.25, .5, 1, 2]) for (const gap of [2, 8, 16, 24, 60]) for (const sign of [-1, 1]) {
    const a = { x: 0, y: 0, width: 240, height: 144 };
    const b = { ...a, x: sign > 0 ? 240 + gap : -240 - gap };
    const g = relationGeometry(a, b, zoom);
    const xs = [g.start.x, g.c1.x, g.c2.x, g.end.x].map(x => x * sign);
    assert(xs.every((x, i) => i === 0 || x >= xs[i-1]));
    assert.equal(g.start.y, g.c1.y); assert.equal(g.end.y, g.c2.y);
    assert(!/NaN|Infinity/.test(g.path));
  }
});

test('short relation labels remain outside both endpoint cards', () => {
  const { relationGeometry, overlaps } = require('../src/topology.ts');
  const a = { x: -80, y: 50, width: 240, height: 144 };
  const b = { ...a, x: 184 };
  for (const zoom of [.25, .5, 1, 2]) {
    const geometry = relationGeometry(a, b, zoom);
    assert(!overlaps(geometry.labelBounds, a));
    assert(!overlaps(geometry.labelBounds, b));
  }
});
