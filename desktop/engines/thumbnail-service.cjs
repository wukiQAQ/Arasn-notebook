
const fs = require("node:fs/promises");
const { pipeline } = require("node:stream/promises");
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");

const MiB = 1024 * 1024;
const MAX_ENTRY = 2 * MiB;
const formats = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", ico: "image/x-icon", svg: "image/svg+xml",
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  avi: "video/x-msvideo", mkv: "video/x-matroska",
  mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", ogg: "audio/ogg", m4a: "audio/mp4",
};
const textTypes = new Set("txt md json csv log xml yaml yml js jsx ts tsx py html htm css scss sql sh ps1 ini toml rst c cpp h cs java go rs rb php".split(" "));
const binaryTypes = new Set("psd psb tif tiff pdf docx pptx xlsx xls".split(" "));
const fallback = extension => ({ kind: "unsupported", extension });

function identify(bytes, name) {
  const hex = bytes.toString("hex");
  const ascii = bytes.toString("ascii");
  if (hex.startsWith("89504e470d0a1a0a")) return "png";
  if (hex.startsWith("ffd8ff")) return "jpg";
  if (ascii.startsWith("GIF87a") || ascii.startsWith("GIF89a")) return "gif";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "webp";
  if (ascii.startsWith("BM")) return "bmp";
  if (hex.startsWith("00000100")) return "ico";
  if (hex.startsWith("49492a00") || hex.startsWith("4d4d002a")) return "tiff";
  if (ascii.startsWith("8BPS")) return bytes.readUInt16BE(4) === 2 ? "psb" : "psd";
  if (ascii.includes("%PDF-")) return "pdf";
  return path.extname(name).slice(1).toLowerCase();
}

class ThumbnailService {
  constructor(storage, root, BrowserWindow) {
    this.storage = storage;
    this.directory = path.join(root, "previews-v1");
    this.BrowserWindow = BrowserWindow;
    this.pending = new Map();
    this.queue = [];
    this.grants = new Map();
    this.generation = 0;
    this.writes = 0;
    void this.prune(true).catch(() => {});
  }

  get(id, mode = "card", page = 1) {
    if (typeof id !== "string" || !/^[a-f0-9-]{32,36}$/.test(id) ||
        !["card", "small", "detail"].includes(mode) || !Number.isSafeInteger(page) || page < 1 || page > 100000)
      return Promise.resolve(null);
    if (mode !== "detail") page = 1;
    const key = [id, mode, page].join("/");
    if (this.pending.has(key)) return this.pending.get(key);
    if (this.pending.size >= 160) return Promise.resolve(null);
    const task = this.generate({ id, mode, page, generation: this.generation })
      .catch(() => null).finally(() => this.pending.delete(key));
    this.pending.set(key, task);
    return task;
  }

  decode(input, priority) {
    return new Promise(resolve => {
      const job = { input, resolve };
      if (priority) this.queue.unshift(job);
      else this.queue.push(job);
      void this.drain();
    });
  }

  async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        job.resolve(await this.decodeInWindow(job.input).catch(() => null));
      }
    } finally {
      this.running = false;
    }
  }

  grant(id, source, mime, limit = source.size) {
    const token = randomUUID();
    if (this.grants.size >= 192) this.grants.delete(this.grants.keys().next().value);
    this.grants.set(token, { id, source, mime, limit, expires: Date.now() + 2 * 60 * 60_000 });
    return { token, url: this.origin + "/preview-content/" + token };
  }

  async serve(req, res, token) {
    const grant = this.grants.get(token);
    const stop = status => { res.statusCode = status; res.end(); };
    if (!grant || grant.expires < Date.now() || !["GET", "HEAD"].includes(req.method)) return stop(404);
    const current = await this.storage.call("previewSource", { id: grant.id }).catch(() => null);
    if (!current || current.size !== grant.source.size || current.ctime !== grant.source.ctime ||
        current.mtime !== grant.source.mtime || current.sha256 !== grant.source.sha256) return stop(404);
    const size = Math.min(current.size, grant.limit);
    if (!size) return stop(404);
    let start = 0, end = size - 1;
    res.setHeader("Accept-Ranges", "bytes");
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (match && (match[1] || match[2])) {
        if (match[1]) {
          start = Number(match[1]);
          if (match[2]) end = Math.min(Number(match[2]), end);
        } else {
          start = Math.max(0, size - Number(match[2]));
        }
      } else {
        start = size;
      }
      if (start > end) {
        res.setHeader("Content-Range", "bytes */" + size);
        return stop(416);
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + size);
    }
    res.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Content-Type", grant.mime);
    res.setHeader("Content-Length", end - start + 1);
    if (req.method === "HEAD") return res.end();
    const handle = await fs.open(current.path, "r").catch(() => null);
    if (!handle) {
      res.removeHeader("Content-Length");
      return stop(404);
    }
    try {
      const stat = await handle.stat();
      if (stat.size !== current.size || stat.ctimeMs !== current.ctime || stat.mtimeMs !== current.mtime) {
        res.removeHeader("Content-Length");
        return stop(404);
      }
      await pipeline(handle.createReadStream({ start, end, autoClose: false }), res);
    } catch {
      res.destroy();
    } finally {
      await handle.close().catch(() => {});
    }
  }

  async generate({ id, mode, page, generation }) {
    const source = await this.storage.call("previewSource", { id });
    if (!source?.size) return null;
    const bytes = Buffer.alloc(128);
    const handle = await fs.open(source.path, "r");
    try { await handle.read(bytes, 0, bytes.length, 0); } finally { await handle.close(); }
    const extension = identify(bytes, source.name);
    const mime = formats[extension];
    const media = /^(audio|video)\//.test(mime || "");
    const text = textTypes.has(extension);
    const binary = binaryTypes.has(extension);
    if (!mime && !binary && !text) return fallback(extension);
    if (!text && source.size > (media ? 4 * 1024 * MiB : 48 * MiB)) return fallback(extension);
    if (extension === "png" && bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 32_000_000)
      return fallback(extension);
    const detail = mode === "detail";
    const key = createHash("sha256").update(JSON.stringify([
      3, extension, source.sha256, source.size, source.mtime, source.ctime,
    ])).digest("hex");
    const target = path.join(this.directory, id + "-" + key + "-" + (media && detail ? "card" : mode) + ".json");
    let result;
    const reusable = !detail || media;
    if (reusable) {
      try {
        if ((await fs.stat(target)).size > MAX_ENTRY) throw new Error("Oversized preview");
        const stored = JSON.parse(await fs.readFile(target, "utf8"));
        const image = typeof stored?.image === "string" && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/.test(stored.image);
        if (stored?.extension === extension && (
          (["image", "video"].includes(stored.kind) && image) ||
          (stored.kind === "audio" && Number.isFinite(stored.duration)) ||
          (["document", "text"].includes(stored.kind) && (image || typeof stored.text === "string")) ||
          (stored.kind === "table" && Array.isArray(stored.table) && stored.table.every(row =>
            Array.isArray(row) && row.every(cell => typeof cell === "string")))
        ))
          result = stored;
      } catch {}
    }
    if (!result) {
      const resource = this.grant(id, source, mime || "application/octet-stream", text ? 64 * 1024 : source.size);
      try {
        const max = mode === "small" ? 160 : detail && !media ? 1600 : 640;
        result = await this.decode({
          url: resource.url, extension, mime, text, size: source.size, max, page,
          original: detail && mime?.startsWith("image/") && extension !== "svg",
        }, detail);
      } finally {
        this.grants.delete(resource.token);
      }
      if (!result) return fallback(extension);
      result.extension = extension;
      if (reusable && result.kind !== "unsupported" && generation === this.generation) {
        const json = JSON.stringify(result);
        if (Buffer.byteLength(json) <= MAX_ENTRY) {
          await this.write(target, json).catch(() => {});
          if (++this.writes % 16 === 0) await this.prune().catch(() => {});
        }
      }
    }
    if (detail && (media || result.original))
      result = { ...result, url: this.grant(id, source, mime).url };
    return result;
  }

  async decodeInWindow(input) {
    const worker = new this.BrowserWindow({
      show: false,
      webPreferences: {
        partition: "arasn-file-previews",
        sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false,
      },
    });
    worker.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    worker.webContents.on("will-navigate", event => event.preventDefault());
    let timeout;
    try {
      return await Promise.race([
        (async () => {
          await worker.loadURL(this.origin + "/file-preview-worker.html");
          return worker.webContents.executeJavaScript("window.generateFilePreview(" + JSON.stringify(input) + ")");
        })(),
        new Promise(resolve => { timeout = setTimeout(resolve, 12_000, null); }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (!worker.isDestroyed()) worker.destroy();
    }
  }

  async write(target, json) {
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = target + "." + randomUUID() + ".tmp";
    try {
      await fs.writeFile(temporary, json, { flag: "wx" });
      await fs.rename(temporary, target);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async clear() {
    this.generation++;
    this.grants.clear();
    const names = await fs.readdir(this.directory).catch(() => []);
    await Promise.all(names.filter(name => /\.json$/.test(name)).map(name =>
      fs.rm(path.join(this.directory, name), { force: true })));
    return true;
  }

  async invalidate(id) {
    if (typeof id !== "string" || !/^[a-f0-9-]{32,36}$/.test(id)) return false;
    this.generation++;
    const names = await fs.readdir(this.directory).catch(() => []);
    await Promise.all(names.filter(name => name.startsWith(id + "-") && name.endsWith(".json"))
      .map(name => fs.rm(path.join(this.directory, name), { force: true })));
    return true;
  }

  async openOriginal(id, shell) {
    const source = await this.storage.call("previewSource", { id });
    if (!source) throw new Error("原文件不可用");
    const extension = path.extname(source.name).slice(1).toLowerCase();
    if ((!Object.hasOwn(formats, extension) && !binaryTypes.has(extension) && !["doc", "ppt", "txt", "md", "csv", "log"].includes(extension)) ||
        extension === "svg" || source.size > 512 * MiB)
      throw new Error("请先导出原文件，再选择合适的程序打开");
    const root = path.join(this.directory, "open");
    await fs.mkdir(root, { recursive: true });
    const directory = await fs.mkdtemp(path.join(root, "preview-"));
    const name = path.basename(source.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_");
    const destination = path.join(directory, name);
    try {
      await fs.copyFile(source.path, destination);
      await fs.chmod(destination, 0o444);
      const error = await shell.openPath(destination);
      if (error) throw new Error("系统无法打开此格式，可导出原文件");
      return true;
    } catch (error) {
      await fs.chmod(destination, 0o644).catch(() => {});
      await fs.rm(destination, { force: true }).catch(() => {});
      await fs.rmdir(directory).catch(() => {});
      throw error;
    }
  }

  async prune(checkSources = false) {
    const names = await fs.readdir(this.directory).catch(() => []);
    const entries = [];
    const sources = new Map();
    for (const name of names) {
      const match = /^([a-f0-9-]{32,36})-([a-f0-9]{64})-(card|small|detail)\.json$/.exec(name);
      if (!match) continue;
      const file = path.join(this.directory, name);
      const stat = await fs.stat(file).catch(() => null);
      if (!stat) continue;
      if (checkSources && !sources.has(match[1]))
        sources.set(match[1], await this.storage.call("previewSource", { id: match[1] }).catch(() => null));
      if (checkSources && !sources.get(match[1])) await fs.rm(file, { force: true });
      else entries.push({ file, stat });
    }
    let total = 0;
    for (const { file, stat } of entries.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)) {
      total += stat.size;
      if (total > 96 * MiB || stat.size > MAX_ENTRY || Date.now() - stat.mtimeMs > 30 * 24 * 60 * 60_000)
        await fs.rm(file, { force: true });
    }
    const opening = path.join(this.directory, "open");
    for (const name of await fs.readdir(opening).catch(() => [])) {
      if (!/^preview-[a-zA-Z0-9]+$/.test(name)) continue;
      const directory = path.join(opening, name);
      const info = await fs.lstat(directory).catch(() => null);
      if (!info?.isDirectory() || Date.now() - info.mtimeMs < 24 * 60 * 60_000) continue;
      for (const name of await fs.readdir(directory)) {
        const file = path.join(directory, name);
        const stat = await fs.lstat(file).catch(() => null);
        if (!stat?.isFile()) continue;
        await fs.chmod(file, 0o644).catch(() => {});
        await fs.rm(file, { force: true }).catch(() => {});
      }
      await fs.rmdir(directory).catch(() => {});
    }
  }
}
module.exports = { ThumbnailService, identify };
