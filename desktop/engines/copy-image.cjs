async function copyImage(clipboard, nativeImage, ClipboardItem, input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 33 || input.byteLength > 64 * 1024 * 1024)
    throw new Error('PNG 数据无效或超过 64MB，请降低倍率后重试');
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR')
    throw new Error('只支持有效的 PNG 图片');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 16384 || height > 16384 || width * height > 32_000_000)
    throw new Error('图片超过安全像素上限，请降低倍率后重试');
  const image = nativeImage.createFromBuffer(bytes);
  if (image.isEmpty()) throw new Error('PNG 解码失败，请重新生成图片');
  const decoded = image.getSize();
  if (decoded.width !== width || decoded.height !== height) throw new Error('PNG 尺寸校验失败');
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
}
module.exports = { copyImage };
