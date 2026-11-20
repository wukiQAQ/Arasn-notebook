const path = require("node:path");
const fs = require("node:fs/promises");
const { FileEngine } = require("./file-engine.cjs");
const { RecoveryService } = require("./recovery-service.cjs");
const { ClipboardService } = require("./clipboard-service.cjs");
function installServices(
  handle,
  {
    storage,
    store,
    window,
    dialog,
    clipboard,
    root,
    beforeRestore,
    canvasTrashed,
    nativeImage,
    previews,
  },
) {
  handle("canvas:catalog", async (action, args = {}) => {
    const filters = [{ name: "Arasn 画布包", extensions: ["arasn-canvas"] }];
    if (action === "export") {
      const { catalog, pack } = await storage.call("canvasCatalog", { ...args, action });
      const name = pack.canvas.name.replace(/[<>:"/\\|?*]/g, "_");
      const result = await dialog.showSaveDialog(window, { filters, defaultPath: name + ".arasn-canvas" });
      if (result.canceled) return null;
      await fs.writeFile(result.filePath, JSON.stringify(pack), "utf8");
      return catalog;
    }
    if (action === "import") {
      const result = await dialog.showOpenDialog(window, { filters, properties: ["openFile"] });
      if (result.canceled) return null;
      const file = await fs.open(result.filePaths[0], "r");
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > 48 * 1024 * 1024) throw new Error("画布包大小超过限制");
        const buffer = Buffer.alloc(stat.size + 1);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesRead } = await file.read(buffer, offset, buffer.length - offset, null);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        if (offset !== stat.size) throw new Error("画布包正在变化，请重试");
        let pack;
        try { pack = JSON.parse(buffer.subarray(0, offset).toString("utf8")); }
        catch { throw new Error("画布包格式无效"); }
        return store.catalog(action, { pack });
      } finally { await file.close(); }
    }
    const result = await store.catalog(action, args);
    if (action === "trash") await canvasTrashed?.(args.id);
    return result;
  });
  handle("canvas:create", (options) => store.createCanvasRecord(options));
  handle("canvas:migrate", (options = {}) => {
    if (!options || typeof options !== "object" ||
        (options.dryRun !== undefined && typeof options.dryRun !== "boolean")) throw new Error("迁移参数无效");
    return store.migrateCanvas({ dryRun: options.dryRun !== false, roomId: options.roomId, revision: options.revision });
  });
  handle("files:thumbnail", async id => (await previews.get(id, "small"))?.image ?? null);
  handle("files:preview", (id, mode, page) => previews.get(id, mode, page));
  handle("files:originalImage", id => require("./export-image.cjs").originalImage(storage,id));
  const files = new FileEngine(storage),
    recovery = new RecoveryService(storage),
    clip = new ClipboardService(clipboard, storage, root);
  handle("files:list", (args) => files.list(args || {}));
  handle("files:choose", async () => {
    const r = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
    });
    return r.canceled ? [] : files.import(r.filePaths);
  });
  handle("files:drop", (paths) => files.import(paths));
  handle("files:action", async (action, args = {}) => {
    if (["metadata", "attachmentOrigin", "rename", "trash", "reference", "unreference", "fileAreaPreview", "clearFileArea", "undoFileAreaClear"].includes(action))
      return storage.call(action, args);
    if (action === "export") {
      const r = await dialog.showSaveDialog(window, {
        defaultPath:
          typeof args.name === "string" ? path.basename(args.name) : "导出文件",
      });
      return r.canceled
        ? false
        : storage.call("export", { id: args.id, destination: r.filePath });
    }
    if (action === "audit") return recovery.audit();
    if (action === "retryFailed") return storage.call("retryFailed");
    if (action === "purge") {
      const result = await recovery.empty();
      await previews.prune(true).catch(() => {});
      return result;
    }
    if (action === "clearPreviews") return previews.clear();
    if (action === "invalidatePreview") return previews.invalidate(args.id);
    if (action === "openOriginal" || action === "locateOriginal") {
      const { shell } = require("electron");
      if (action === "openOriginal") return previews.openOriginal(args.id, shell);
      const source = await storage.call("previewSource", { id: args.id });
      if (!source) throw new Error("原文件不可用");
      shell.showItemInFolder(source.path);
      return true;
    }
    if (action === "backup") {
      const r = await dialog.showOpenDialog(window, {
        properties: ["openDirectory", "createDirectory"],
      });
      return r.canceled
        ? false
        : recovery.backup(
            path.join(r.filePaths[0], "Arasn-backup-" + Date.now()),
          );
    }
    if (action === "restoreBackup") {
      const r = await dialog.showOpenDialog(window, {
        properties: ["openDirectory"],
      });
      if (r.canceled) return false;
      await beforeRestore();
      await recovery.restore(r.filePaths[0]);
      await previews.clear().catch(() => {});
      await store.init();
      window.webContents.reload();
      return true;
    }
    throw new Error("操作无效");
  });
  handle("panel:clear", () => store.clear());
  handle("clipboard:paste", () => clip.paste());
  handle("clipboard:copyImage", bytes => require("./copy-image.cjs").copyImage(clipboard, nativeImage, require("electron").ClipboardItem, bytes));
  handle("clipboard:copyText", (text) => {
    if (typeof text !== "string" || Buffer.byteLength(text) > 24 * 1024 * 1024)
      throw new Error("剪贴板文本无效或过大");
    return clipboard.writeText(text);
  });
  handle("app:recovery", () => storage.call("getSetting", { key: "recovery" }));
  handle("app:saveRecovery", (value) => {
    if (
      typeof value !== "string" ||
      Buffer.byteLength(value) > 24 * 1024 * 1024
    )
      throw new Error("恢复数据过大");
    const data = JSON.parse(value);
    if (data.roomId !== store.snapshot().roomId || !Array.isArray(data.pending))
      throw new Error("恢复数据无效");
    return storage.call("setSetting", { key: "recovery", value: data });
  });
}
module.exports = { installServices };
