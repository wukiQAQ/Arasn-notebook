const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
class ClipboardService {
  constructor(clipboard, storage, root) {
    this.clipboard = clipboard;
    this.storage = storage;
    this.root = root;
    this.busy = false;
  }
  async paste() {
    if (this.busy) throw new Error("正在处理粘贴");
    this.busy = true;
    try {
      const items = await this.clipboard.read();
      for (const item of items)
        if (item.types.includes("text/uri-list")) {
          const blob = await item.getType("text/uri-list");
          const lines = (await blob.text())
            .split(/\r?\n/)
            .filter((line) => line.trim() && !line.startsWith("#"));
          const paths = lines.map((line) => {
            const url = new URL(line.trim());
            if (
              url.protocol !== "file:" ||
              (url.hostname && url.hostname !== "localhost")
            )
              throw new Error("仅导入本地文件引用");
            return require("node:url").fileURLToPath(url);
          });
          if (paths.length)
            return {
              kind: "files",
              results: await this.storage.call("import", { paths, origin: "paste" }),
            };
        }
      for (const format of ["CF_HDROP", "FileNameW"]) {
        const type = `electron application/osclipboard;format="${format}"`;
        if (await this.clipboard.has(type)) {
          const blob = await items[0].getType(type);
          const data = Buffer.from(await blob.arrayBuffer());
          let paths = [];
          if (format === "FileNameW")
            paths = data.toString("utf16le").split("\0").filter(Boolean);
          else if (data.length >= 20) {
            const offset = data.readUInt32LE(0);
            if (offset >= 20 && offset < data.length)
              paths = data
                .subarray(offset)
                .toString(data.readUInt32LE(16) ? "utf16le" : "utf8")
                .split("\0")
                .filter(Boolean);
          }
          if (paths.length)
            return {
              kind: "files",
              results: await this.storage.call("import", { paths, origin: "paste" }),
            };
        }
      }
      for (const item of items)
        if (item.types.includes("image/png")) {
          const blob = await item.getType("image/png");
          if (blob.size > 32 * 1024 * 1024)
            throw new Error("剪贴板图片超过32MiB，请作为文件导入");
          const temp = path.join(
            this.root,
            "staging",
            "clipboard-" + crypto.randomUUID() + ".png",
          );
          await fs.writeFile(temp, Buffer.from(await blob.arrayBuffer()));
          try {
            return {
              kind: "files",
              results: await this.storage.call("import", {
                paths: [temp], origin: "paste",
                names: [
                  `剪贴板图片-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.png`,
                ],
              }),
            };
          } finally {
            await fs.rm(temp, { force: true });
          }
        }
      const text = await this.clipboard.readText();
      if (text.length > 10000)
        throw new Error("单条文字最多10000字符，请作为TXT文件导入");
      return { kind: "text", text };
    } finally {
      this.busy = false;
    }
  }
}
module.exports = { ClipboardService };
