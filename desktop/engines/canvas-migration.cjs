const { createHash } = require('node:crypto');
const { createStore } = require('../server.cjs');

const stableId = (room, kind, id) => createHash('sha256').update(`arasn-canvas-v1:${room}:${kind}:${id}`).digest('hex').slice(0, 32);

function planCanvasMigration(state) {
  const operations = [];
  for (const [sourceId, item] of Object.entries(state.items)) {
    const value = item.value;
    if (value?.type !== 'text' && value?.type !== 'node') continue;
    const id = stableId(state.roomId, 'node', sourceId);
    const existing = state.items[id];
    if (existing) {
      if ((existing.value === null && existing.scope === 'topology') ||
          (existing.value?.type === 'canvas-node' && existing.value.roomId === state.roomId &&
           existing.value.canvasId === state.roomId && existing.value.contentRef.kind === 'record' && existing.value.contentRef.id === sourceId)) continue;
      throw new Error('迁移节点编号冲突，未修改原内容');
    }
    const layout = value.topology ?? { x: value.x, y: value.y, width: 280, height: 140, kind: 'note', status: 'open' };
    operations.push({ id, opId: stableId(state.roomId, 'operation', sourceId), expected: 0,
      value: { type: 'canvas-node', roomId: state.roomId, canvasId: state.roomId, contentRef: { kind: 'record', id: sourceId }, layout } });
  }
  // Exercise exactly the same validation/capacity limits before any backup or write.
  const candidate = createStore(undefined, state);
  for (const operation of operations) candidate.apply(operation);
  return { version: 1, roomId: state.roomId, revision: state.revision, canvasId: state.roomId, operations };
}

module.exports = { planCanvasMigration };
