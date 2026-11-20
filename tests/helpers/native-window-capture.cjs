// Capture only the test's HWND, including Windows chrome. No desktop capture.
async function captureNativeWindow(app, page, file) {
  const window = await app.browserWindow(page);
  const id = await window.evaluate(w => w.id);
  const result = await app.evaluate(({ BrowserWindow, nativeImage }, { id, modulePath }) => {
    const koffi = process.mainModule.require(modulePath);
    const user = koffi.load('user32.dll'), gdi = koffi.load('gdi32.dll');
    const rect = user.func('int __stdcall GetWindowRect(intptr_t hwnd, void *rect)');
    const getDC = user.func('intptr_t __stdcall GetWindowDC(intptr_t hwnd)');
    const release = user.func('int __stdcall ReleaseDC(intptr_t hwnd, intptr_t dc)');
    const print = user.func('int __stdcall PrintWindow(intptr_t hwnd, intptr_t dc, uint flags)');
    const compatibleDC = gdi.func('intptr_t __stdcall CreateCompatibleDC(intptr_t dc)');
    const bitmap = gdi.func('intptr_t __stdcall CreateCompatibleBitmap(intptr_t dc, int width, int height)');
    const select = gdi.func('intptr_t __stdcall SelectObject(intptr_t dc, intptr_t object)');
    const bits = gdi.func('int __stdcall GetDIBits(intptr_t dc, intptr_t bitmap, uint start, uint lines, void *bits, void *info, uint usage)');
    const deleteDC = gdi.func('int __stdcall DeleteDC(intptr_t dc)');
    const deleteObject = gdi.func('int __stdcall DeleteObject(intptr_t object)');
    const w = BrowserWindow.fromId(id), handle = w.getNativeWindowHandle();
    const hwnd = handle.length === 8 ? handle.readBigInt64LE() : handle.readInt32LE();
    const bounds = Buffer.alloc(16); if (!rect(hwnd, bounds)) throw Error('GetWindowRect failed');
    const width = bounds.readInt32LE(8) - bounds.readInt32LE(0), height = bounds.readInt32LE(12) - bounds.readInt32LE(4);
    const dc = getDC(hwnd), memory = compatibleDC(dc), image = bitmap(dc, width, height), old = select(memory, image);
    try {
      if (!print(hwnd, memory, 2)) throw Error('PrintWindow failed');
      select(memory, old);
      const info = Buffer.alloc(40); info.writeUInt32LE(40); info.writeInt32LE(width, 4); info.writeInt32LE(-height, 8); info.writeUInt16LE(1, 12); info.writeUInt16LE(32, 14);
      const pixels = Buffer.alloc(width * height * 4);
      if (!bits(memory, image, 0, height, pixels, info, 0)) throw Error('GetDIBits failed');
      for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
      return { png: nativeImage.createFromBitmap(pixels, { width, height }).toPNG().toString('base64'), width, height };
    } finally { select(memory, old); deleteObject(image); deleteDC(memory); release(hwnd, dc); }
  }, { id, modulePath: require.resolve('koffi') });
  await require('node:fs/promises').writeFile(file, Buffer.from(result.png, 'base64'));
  return { width: result.width, height: result.height };
}
module.exports = { captureNativeWindow };
