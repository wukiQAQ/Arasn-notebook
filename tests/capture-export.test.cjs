const { test } = require('node:test');
const assert = require('node:assert/strict');
const { copyImage } = require('../desktop/engines/copy-image.cjs');
test('selection uses logical pixels after pan/zoom and export never applies DPR twice', async () => {
  const { selectionToWorld, exportSize } = await import('../src/canvas-export.ts');
  for (const zoom of [.25, .8, 1, 1.25, 4]) {
    const region = selectionToWorld({ x: 20, y: 30, width: 420, height: 240 }, { x: -300 - 500 / zoom, y: 200 - 300 / zoom, width: 1000 / zoom, height: 600 / zoom }, zoom);
    assert.equal(region.x, -300 - 480 / zoom); assert.equal(region.y, 200 - 270 / zoom);
    for (const multiplier of [1, 2, 4]) {
      const size = exportSize(region, 0, multiplier, zoom);
      assert.equal(size.width, 420 * multiplier); assert.equal(size.height, 240 * multiplier);
    }
  }
  for (const padding of [-1, 513, NaN]) assert.throws(() => exportSize({ width: 20, height: 20 }, padding, 1));
  for (const multiplier of [1,2,4]) assert.equal(exportSize({ width: 300 / 2.2290251120639994, height: 100 }, 0, multiplier, 2.2290251120639994).width, 300 * multiplier);
  assert.throws(() => exportSize({ width: -1, height: 20 }, 24, 1));
});
test('clipboard checks PNG bytes and pixel limits before native decode', async () => {
  let decodes = 0, writes = 0;
  const bytes = Buffer.alloc(33); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  bytes.writeUInt32BE(13, 8); bytes.write('IHDR', 12); bytes.writeUInt32BE(600, 16); bytes.writeUInt32BE(400, 20);
  const clipboard = { write: async items => { assert(items[0].data['image/png'] instanceof Blob); writes++; } };
  class ClipboardItem { constructor(data) { this.data = data; } }
  const nativeImage = { createFromBuffer: () => { decodes++; return { isEmpty: () => false, getSize: () => ({ width: 600, height: 400 }) }; } };
  for (const invalid of [null, 'data:image/png', [], Buffer.alloc(40)]) await assert.rejects(copyImage(clipboard, nativeImage, ClipboardItem, invalid));
  const bomb = Buffer.from(bytes); bomb.writeUInt32BE(32000, 16);
  await assert.rejects(copyImage(clipboard, nativeImage, ClipboardItem, bomb), /像素/); assert.equal(decodes, 0);
  await copyImage(clipboard, nativeImage, ClipboardItem, bytes); assert.equal(writes, 1);
  await assert.rejects(copyImage(clipboard, { createFromBuffer: () => ({ isEmpty: () => true }) }, ClipboardItem, bytes), /解码/);
  assert.equal(writes, 1);
});
