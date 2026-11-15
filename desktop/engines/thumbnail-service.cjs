const fs = require("node:fs/promises");
const path = require("node:path");
class ThumbnailService {
  constructor(storage, root, nativeImage) {
    this.storage = storage;
    this.root = root;
    this.nativeImage = nativeImage;
    this.pending = new Map();
  }
  get(id) {
    if (this.pending.has(id)) return this.pending.get(id);
    const task = this.generate(id)
      .catch(() => null)
      .finally(() => this.pending.delete(id));
    this.pending.set(id, task);
    return task;
  }
  async generate(id) {
    const source = await this.storage.call("thumbnailSource", { id });
    if (!source) return null;
    const cache = path.join(this.root, "thumbnails");
    await fs.mkdir(cache, { recursive: true });
    const target = path.join(cache, id + ".png");
    try {
      return (
        "data:image/png;base64," +
        (await fs.readFile(target)).toString("base64")
      );
    } catch {}
    const decode = path.join(cache, id + ".source." + source.extension);
    await fs.copyFile(source.path, decode);
    try {
      const image = await this.nativeImage.createThumbnailFromPath(decode, {
        width: 160,
        height: 120,
      });
      const bytes = image.toPNG();
      if (bytes.length > 256 * 1024) return null;
      await fs.writeFile(target, bytes);
      return "data:image/png;base64," + bytes.toString("base64");
    } finally {
      await fs.rm(decode, { force: true });
    }
  }
}
module.exports = { ThumbnailService };
