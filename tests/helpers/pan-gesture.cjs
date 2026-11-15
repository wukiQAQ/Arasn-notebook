const assert = require('node:assert/strict');

function assertPanGesture({ before, after, events, request }) {
  const downs = events.filter(e => e.type === 'pointerdown');
  const ups = events.filter(e => e.type === 'pointerup');
  assert.equal(downs.length, 1, 'pan needs exactly one pointerdown');
  assert.equal(ups.length, 1, 'pan needs exactly one pointerup');
  const down = downs[0], up = ups[0], end = events.indexOf(up);
  assert(end > events.indexOf(down), 'pan pointerup must follow pointerdown');
  assert.equal(up.id, down.id, 'pan pointer identity changed');
  assert.equal(down.buttons, 1, 'pan must start with the primary button');
  assert.equal(up.buttons, 0, 'pan must finish with the button released');
  assert(!events.slice(0, end).some(e => ['pointercancel', 'lostpointercapture', 'blur'].includes(e.type)), 'pan interrupted before pointerup');
  assert(Math.abs(down.x - request.x) <= 1 && Math.abs(down.y - request.y) <= 1, 'pan start endpoint differs from request');
  assert(Math.abs(up.x - request.x - request.dx) <= 1 && Math.abs(up.y - request.y - request.dy) <= 1, 'pan end endpoint differs from request');
  assert(Number.isFinite(before.zoom) && before.zoom > 0 && Math.abs(after.zoom - before.zoom) < 1e-6, 'pan camera zoom changed');
  const dx = up.x - down.x, dy = up.y - down.y;
  assert(Math.abs((after.x - before.x) * before.zoom + dx) < 1.2, 'pan camera x did not follow the complete gesture');
  assert(Math.abs((after.y - before.y) * before.zoom + dy) < 1.2, 'pan camera y did not follow the complete gesture');
  return { screenDelta: { x: dx, y: dy }, before, after };
}

module.exports = { assertPanGesture };
