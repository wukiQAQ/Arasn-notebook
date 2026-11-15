const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync, backup } = require("node:sqlite");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const { createStore, localTopologyItem } = require("../server.cjs");
const { planCanvasMigration } = require("./canvas-migration.cjs");
const root = path.resolve(workerData.root);
fs.mkdirSync(path.join(root, "objects"), { recursive: true });
fs.mkdirSync(path.join(root, "staging"), { recursive: true });
const db = new DatabaseSync(path.join(root, "workspace.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;",
);
const schemaVersion = db.prepare("PRAGMA user_version").get().user_version;
if (schemaVersion > 2)
  throw new Error("数据库版本较新，禁止降级打开");
db.exec(`BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS panels(id TEXT PRIMARY KEY,state TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS elements(id TEXT PRIMARY KEY,panel_id TEXT NOT NULL REFERENCES panels(id),version INTEGER NOT NULL,value TEXT);
CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,deleted_at TEXT);
CREATE TABLE IF NOT EXISTS file_refs(id TEXT PRIMARY KEY,panel_id TEXT NOT NULL REFERENCES panels(id),file_id TEXT NOT NULL REFERENCES files(id));
CREATE TABLE IF NOT EXISTS canvas_file_refs(owner_id TEXT PRIMARY KEY,file_id TEXT NOT NULL REFERENCES files(id));
CREATE INDEX IF NOT EXISTS canvas_file_owners ON canvas_file_refs(file_id);
CREATE INDEX IF NOT EXISTS file_list ON files(status,deleted_at,created_at);
CREATE INDEX IF NOT EXISTS file_names ON files(name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL,state TEXT NOT NULL,detail TEXT NOT NULL,error TEXT);
${schemaVersion === 0 ? "PRAGMA user_version=1;" : ""} COMMIT;`);
const getSetting = (key) => {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
  return row ? JSON.parse(row.value) : null;
};
const setSetting = (key, value) =>
  db
    .prepare(
      "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, JSON.stringify(value));
function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
const fileAreaRefs = () => db.prepare("SELECT * FROM file_refs WHERE panel_id='default' ORDER BY id").all();
const fileAreaBackupKey = "file-area-before-clear";
function fileAreaPreview() {
  const refs = fileAreaRefs();
  // Include every default-panel reference, including trashed files. Count files,
  // matching the panel's deduplicated listing, rather than duplicate ref rows.
  return { count: new Set(refs.map(ref => ref.file_id)).size,
    refs: refs.map(ref => ref.id), canUndo: Boolean(getSetting(fileAreaBackupKey)?.refs?.length) };
}
function clearFileArea(args) {
  return transaction(() => {
    const current = fileAreaRefs();
    const requested = args?.refs;
    const requestedIds = new Set(Array.isArray(requested) ? requested : []);
    if (!Array.isArray(requested) || requested.some(id => typeof id !== "string") ||
        requestedIds.size !== requested.length || requested.length !== current.length ||
        current.some(ref => !requestedIds.has(ref.id)))
      throw new Error("文件区域已变化，请重新预览后确认清空");
    // A repeated empty clear must retain the last usable undo record.
    if (current.length) {
      setSetting(fileAreaBackupKey, { refs: current });
      db.prepare("DELETE FROM file_refs WHERE panel_id='default'").run();
    }
    return { cleared: new Set(current.map(ref => ref.file_id)).size };
  });
}
function undoFileAreaClear() {
  return transaction(() => {
    const saved = getSetting(fileAreaBackupKey);
    let restored = 0;
    for (const ref of saved?.refs || []) {
      if (ref.panel_id !== "default") throw new Error("文件区域恢复范围无效");
      const file = db.prepare("SELECT status FROM files WHERE id=?").get(ref.file_id);
      if (file?.status !== "ready")
        throw new Error("部分文件副本已清理或缺失，无法撤销清空；请先使用「恢复备份」找回文件");
      if (db.prepare("SELECT 1 FROM file_refs WHERE panel_id=? AND file_id=?").get(ref.panel_id, ref.file_id)) continue;
      db.prepare("INSERT INTO file_refs VALUES(?,?,?)").run(ref.id, ref.panel_id, ref.file_id);
      restored++;
    }
    db.prepare("DELETE FROM settings WHERE key=?").run(fileAreaBackupKey);
    return { restored };
  });
}
const uuid = (id) => {
  if (typeof id !== "string" || !/^[a-f0-9-]{32,36}$/.test(id))
    throw new Error("文件编号无效");
  return id;
};
const object = (id) => path.join(root, "objects", uuid(id) + ".bin");
const getFile = (id) => {
  const row = db.prepare("SELECT * FROM files WHERE id=?").get(uuid(id));
  if (!row) throw new Error("文件不存在");
  return row;
};
function syncFileOwner(id, value, allowDeleted = false) {
  db.prepare("DELETE FROM canvas_file_refs WHERE owner_id=?").run(id);
  const ref = ["canvas-node","free-file"].includes(value?.type) ? value.contentRef : value?.type === "content-link" ? value.targetRef : null;
  if (ref?.kind !== "file") return;
  const file = getFile(ref.id);
  if (!allowDeleted && (file.status !== "ready" || file.deleted_at)) throw new Error("文件已删除或未就绪");
  db.prepare("INSERT INTO canvas_file_refs VALUES(?,?)").run(id, ref.id);
}
function checkRecoveryBeforeMigration() {
  const recovery = getSetting("recovery");
  if (recovery === null) return;
  if (typeof recovery !== "object" || recovery.roomId !== state.roomId || recovery.base?.roomId !== state.roomId ||
      !Array.isArray(recovery.pending) || !Array.isArray(recovery.conflicts) ||
      recovery.pending.length || recovery.conflicts.length ||
      (recovery.rejected !== undefined && (!Array.isArray(recovery.rejected) || recovery.rejected.length)))
    throw new Error("请先处理草稿或恢复队列，再迁移关系画布");
}
const nameOf = (name) => {
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 200 ||
    /[<>:"/\\|?*\x00-\x1f]/.test(name) ||
    /[. ]$/.test(name) ||
    /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i.test(name)
  )
    throw new Error("文件名无效");
  return name.trim();
};
const category = (name) => {
  const ext = path.extname(name).toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp)$/.test(ext)
    ? "图片"
    : /\.(mp3|wav|flac|ogg|m4a)$/.test(ext)
      ? "音频"
      : /\.(mp4|mkv|mov|avi|webm)$/.test(ext)
        ? "视频"
        : /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv)$/.test(ext)
          ? "文档"
          : "其他";
};
let state;
const existing = db
  .prepare("SELECT state FROM panels WHERE id=?")
  .get("default");
if (existing) state = JSON.parse(existing.state);
else {
  const legacy = path.join(root, "board.json");
  state = createStore(fs.existsSync(legacy) ? legacy : undefined).dump();
  transaction(() => {
    db.prepare("INSERT INTO panels VALUES(?,?)").run(
      "default",
      JSON.stringify(state),
    );
    for (const [id, item] of Object.entries(state.items))
      db.prepare("INSERT INTO elements VALUES(?,?,?,?)").run(
        id,
        "default",
        item.version,
        JSON.stringify(item.value),
      );
  });
}
for (const key of ["settings", "recovery"]) {
  const file = path.join(root, key + ".json");
  if (getSetting(key) === null && fs.existsSync(file))
    setSetting(key, JSON.parse(fs.readFileSync(file, "utf8")));
}
// Interrupted imports never become visible until their content is fully copied and hashed.
for (const op of db
  .prepare("SELECT * FROM operations WHERE state='running'")
  .all()) {
  const detail = JSON.parse(op.detail);
  if (op.kind === "purge") {
    const id = uuid(detail.id);
    const saved = path.resolve(detail.backup, "objects", id + ".bin");
    if (!saved.startsWith(path.join(root, "backups") + path.sep))
      throw new Error("清理恢复路径无效");
    if (!fs.existsSync(object(id))) fs.copyFileSync(saved, object(id));
    db.prepare("UPDATE operations SET state='failed',error=? WHERE id=?").run(
      "清理中断，已保留回收站文件，可重新清理",
      op.id,
    );
  }

  if (op.kind === "import") {
    const file = db.prepare("SELECT * FROM files WHERE id=?").get(op.id);
    if (file?.status === "ready")
      db.prepare("UPDATE operations SET state='done' WHERE id=?").run(op.id);
    else {
      for (const p of [
        path.join(root, "staging", op.id + ".part"),
        object(op.id),
      ])
        if (fs.existsSync(p)) fs.unlinkSync(p);
      db.prepare("UPDATE operations SET state='failed',error=? WHERE id=?").run(
        "上次导入中断，请重新导入源文件",
        op.id,
      );
    }
  }
}
async function digest(file) {
  const hash = crypto.createHash("sha256");
  let size = 0;
  for await (const chunk of fs.createReadStream(file)) {
    size += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size };
}
let activeImports = 0,
  maintenance = false;
async function importOne(source, notify, displayName) {
  if (maintenance) throw new Error("正在备份或清理，请稍后导入");
  activeImports++;
  const id = crypto.randomUUID(),
    temp = path.join(root, "staging", id + ".part");
  try {
    const real = await fsp.realpath(source);
    const stat = await fsp.stat(real);
    if (!stat.isFile()) throw new Error("仅支持普通文件，不导入文件夹或设备");
    const name = nameOf(displayName || path.basename(real));
    db.prepare("INSERT INTO operations VALUES(?,?,?,?,NULL)").run(
      id,
      "import",
      "running",
      JSON.stringify({ source: real }),
    );
    const hash = crypto.createHash("sha256");
    let bytes = 0,
      last = 0;
    await pipeline(
      fs.createReadStream(real),
      new Transform({
        transform(chunk, _enc, cb) {
          bytes += chunk.length;
          hash.update(chunk);
          if (Date.now() - last > 150) {
            notify({ id, name, bytes, total: stat.size });
            last = Date.now();
          }
          cb(null, chunk);
        },
      }),
      fs.createWriteStream(temp, { flags: "wx" }),
    );
    const after = await fsp.stat(real);
    if (
      after.size !== stat.size ||
      after.mtimeMs !== stat.mtimeMs ||
      bytes !== stat.size
    )
      throw new Error("源文件正在变化，请稍后重新导入");
    const handle = await fsp.open(temp, "r+");
    await handle.sync();
    await handle.close();
    await fsp.rename(temp, object(id));
    transaction(() => {
      db.prepare("INSERT INTO files VALUES(?,?,?,?,?,?,?,NULL)").run(
        id,
        name,
        category(name),
        bytes,
        hash.digest("hex"),
        "ready",
        new Date().toISOString(),
      );
      db.prepare("UPDATE operations SET state='done' WHERE id=?").run(id);
    });
    notify({ id, name, bytes, total: bytes, done: true });
    return getFile(id);
  } catch (e) {
    await fsp.rm(temp, { force: true });
    db.prepare("UPDATE operations SET state='failed',error=? WHERE id=?").run(
      e.message,
      id,
    );
    throw e;
  } finally {
    activeImports--;
  }
}
async function audit(notify) {
  const missing = [],
    corrupt = [];
  const rows = db.prepare("SELECT * FROM files WHERE status='ready'").all();
  let i = 0;
  for (const row of rows) {
    try {
      const sum = await digest(object(row.id));
      if (sum.sha256 !== row.sha256 || sum.size !== row.size)
        corrupt.push(row.id);
    } catch {
      missing.push(row.id);
    }
    notify({ name: "完整性检查", bytes: ++i, total: rows.length });
  }
  const indexed = new Set(rows.map((r) => r.id + ".bin"));
  const orphans = (await fsp.readdir(path.join(root, "objects"))).filter(
    (n) => !indexed.has(n),
  );
  return {
    sqlite: db.prepare("PRAGMA integrity_check").all(),
    missing,
    corrupt,
    orphans,
    failed: db
      .prepare("SELECT id,error FROM operations WHERE state='failed'")
      .all(),
  };
}
async function makeBackup(target, notify) {
  if (activeImports) throw new Error("请等待文件导入完成后再备份");
  await fsp.mkdir(target, { recursive: true });
  await backup(db, path.join(target, "workspace.sqlite"));
  const rows = db.prepare("SELECT * FROM files WHERE status='ready'").all();
  await fsp.mkdir(path.join(target, "objects"), { recursive: true });
  let i = 0;
  for (const row of rows) {
    await fsp.copyFile(
      object(row.id),
      path.join(target, "objects", row.id + ".bin"),
    );
    const sum = await digest(path.join(target, "objects", row.id + ".bin"));
    if (sum.sha256 !== row.sha256)
      throw new Error("备份校验失败，未删除任何原文件");
    notify({ name: "备份", bytes: ++i, total: rows.length });
  }
  await fsp.writeFile(
    path.join(target, "manifest.json"),
    JSON.stringify({
      version: 1,
      files: rows,
      createdAt: new Date().toISOString(),
    }),
  );
  return target;
}
const methods = {
  metadata: ({ id }) => {
    const file = getFile(id);
    return { id: file.id, name: file.name, category: file.category, size: file.size, sha256: file.sha256, deleted_at: file.deleted_at, status: file.status };
  },
  canvasCreate: ({ roomId, recordId, nodeId, opId, layout, text = "" }) => {
    if (roomId !== state.roomId || getSetting("canvas-migration")?.roomId !== roomId)
      throw new Error("请先完成当前工作页的关系画布兼容升级");
    uuid(recordId); uuid(nodeId); uuid(opId);
    if (recordId === nodeId) throw new Error("记录和引用必须使用不同编号");
    const candidate = createStore(undefined, state);
    candidate.apply({ id: recordId, opId, expected: 0, value: {
      type: "text", text, x: 100, y: 100, color: "#263449", localOnly: true,
    } });
    candidate.apply({ id: nodeId, opId: crypto.createHash("sha256").update(`${opId}:node`).digest("hex").slice(0, 32), expected: 0, value: {
      type: "canvas-node", roomId, canvasId: roomId, contentRef: { kind: "record", id: recordId }, layout,
    } });
    const next = candidate.dump();
    transaction(() => {
      db.prepare("UPDATE panels SET state=? WHERE id='default'").run(JSON.stringify(next));
      for (const id of [recordId, nodeId]) {
        const item = next.items[id];
        db.prepare("INSERT INTO elements VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,value=excluded.value")
          .run(id, "default", item.version, JSON.stringify(item.value));
      }
    });
    state = next;
    return state;
  },
  canvasMigration: async ({ dryRun = true, roomId, revision }, notify) => {
    const plan = planCanvasMigration(state);
    const previous = getSetting("canvas-migration");
    const summary = { roomId: state.roomId, revision: state.revision, canvasId: plan.canvasId, added: plan.operations.length, migrated: previous?.roomId === state.roomId };
    if (dryRun !== false) return summary;
    if (roomId !== state.roomId || revision !== state.revision) throw new Error("工作页已有更改，迁移预览已过期");
    checkRecoveryBeforeMigration();
    if (previous?.roomId === state.roomId) return { ...summary, added: 0, backup: previous.backup };
    if (activeImports) throw new Error("请等待文件导入完成后再迁移");
    maintenance = true;
    try {
      const target = path.join(root, "backups", "before-canvas-" + crypto.randomUUID());
      await makeBackup(target, notify);
      checkRecoveryBeforeMigration();
      const candidate = createStore(undefined, state);
      for (const operation of plan.operations) candidate.apply(operation);
      const next = candidate.dump();
      // Migration has deterministic IDs and its own marker; keep user operation receipts intact.
      next.receipts = structuredClone(state.receipts);
      transaction(() => {
        db.prepare("UPDATE panels SET state=? WHERE id='default'").run(JSON.stringify(next));
        for (const { id } of plan.operations) {
          const item = next.items[id];
          db.prepare("INSERT INTO elements VALUES(?,?,?,?)").run(id, "default", item.version, JSON.stringify(item.value));
        }
        setSetting("canvas-migration", { version: 1, roomId: state.roomId, backup: target });
        db.exec("PRAGMA user_version=2");
      });
      state = next;
      return { ...summary, revision: next.revision, backup: target };
    } finally { maintenance = false; }
  },
  fileOwners: ({ id }) => {
    uuid(id);
    return [
      ...db.prepare("SELECT owner_id AS id, 'canvas' AS kind FROM canvas_file_refs WHERE file_id=?").all(id),
      ...db.prepare("SELECT id, 'panel' AS kind FROM file_refs WHERE file_id=?").all(id),
    ];
  },
  thumbnailSource: async ({ id }) => {
    const row = getFile(id);
    if (row.status !== "ready" || row.deleted_at || row.size > 20 * 1024 * 1024)
      return null;
    const handle = await fsp.open(object(id), "r");
    const bytes = Buffer.alloc(12);
    try {
      await handle.read(bytes, 0, 12, 0);
    } finally {
      await handle.close();
    }
    const hex = bytes.toString("hex");
    const extension = hex.startsWith("89504e470d0a1a0a")
      ? "png"
      : hex.startsWith("ffd8ff")
        ? "jpg"
        : null;
    return extension ? { path: object(id), extension } : null;
  },
  retryFailed: async (_args, notify) => {
    const results = [];
    for (const row of db
      .prepare(
        "SELECT * FROM operations WHERE kind='import' AND state='failed'",
      )
      .all()) {
      const detail = JSON.parse(row.detail);
      if (!detail.source) continue;
      try {
        results.push(await importOne(detail.source, notify));
        db.prepare("UPDATE operations SET state='retried' WHERE id=?").run(
          row.id,
        );
      } catch {}
    }
    return { retried: results.length };
  },
  init: () => ({ state, settings: getSetting("settings") }),
  getSetting: ({ key }) => getSetting(key),
  setSetting: ({ key, value }) => {
    setSetting(key, value);
    return true;
  },
  board: ({ operation, receipt, legacyOnly }) => {
    if (receipt && receipt.roomId !== state.roomId) throw new Error("接收工作页已更换");
    const candidate = createStore(undefined, state);
    const snapshot = candidate.apply(operation, { legacyOnly });
    const next = candidate.dump();
    // File attachments belong to records and do not require enabling the relation canvas.
    const fileAttachment = operation.value?.type === "content-link" && operation.value.targetRef?.kind === "file";
    if (fileAttachment && !["text", "node"].includes(next.items[operation.value.recordId]?.value?.type))
      throw new Error("附件所属便签不存在");
    if (operation.value && localTopologyItem({ value: operation.value }) && operation.value.type !== "node" && operation.value.type !== "free-file" &&
        !fileAttachment &&
        getSetting("canvas-migration")?.roomId !== state.roomId)
      throw new Error("请先完成关系画布兼容迁移");
    transaction(() => {
      db.prepare("UPDATE panels SET state=? WHERE id=?").run(
        JSON.stringify(next),
        "default",
      );
      const item = next.items[operation.id];
      db.prepare(
        "INSERT INTO elements VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,value=excluded.value",
      ).run(operation.id, "default", item.version, JSON.stringify(item.value));
      // Layout edits to an existing trashed file retain its reference and recovery path.
      const previous = state.items[operation.id]?.value;
      const oldRef = previous?.contentRef ?? previous?.targetRef;
      const newRef = item.value?.contentRef ?? item.value?.targetRef;
      syncFileOwner(operation.id, item.value, oldRef?.kind === "file" && newRef?.kind === "file" && oldRef.id === newRef.id);
      if (receipt) setSetting(receipt.key, receipt.hash);
    });
    state = next;
    return snapshot;
  },
  fileAreaPreview,
  clearFileArea,
  undoFileAreaClear,
  clearPanel: () => {
    clearFileArea({ refs: fileAreaPreview().refs });
    return {
      roomId: state.roomId,
      revision: state.revision,
      items: state.items,
    };
  },
  list: ({ query = "", kind = "", trash = false, page = 0, panel = false }) => {
    query = String(query).slice(0, 200);
    page = Math.max(0, Math.min(100000, Math.floor(Number(page) || 0)));
    const where = `f.status='ready' AND f.deleted_at IS ${trash ? "NOT " : ""}NULL AND instr(lower(f.name),lower(?))>0 AND (?='' OR f.category=?) ${panel ? "AND EXISTS(SELECT 1 FROM file_refs r WHERE r.file_id=f.id AND r.panel_id='default')" : ""}`;
    const args = [query, kind, kind];
    return {
      rows: db
        .prepare(
          `SELECT f.* FROM files f WHERE ${where} ORDER BY f.created_at DESC,f.id LIMIT 25 OFFSET ?`,
        )
        .all(...args, page * 25),
      total: db
        .prepare(`SELECT count(*) n FROM files f WHERE ${where}`)
        .get(...args).n,
    };
  },
  import: async ({ paths, names = [] }, notify) => {
    if (!Array.isArray(paths) || paths.length > 100)
      throw new Error("每批最多100个文件");
    const results = [];
    for (const [index, source] of paths.entries()) {
      try {
        results.push({
          ok: true,
          file: await importOne(source, notify, names[index]),
        });
      } catch (e) {
        results.push({
          ok: false,
          name: path.basename(source),
          error: e.message,
        });
      }
    }
    return results;
  },
  rename: ({ id, name }) => {
    getFile(id);
    db.prepare("UPDATE files SET name=?,category=? WHERE id=?").run(
      nameOf(name),
      category(name),
      id,
    );
    return true;
  },
  trash: ({ id, restore = false }) => {
    getFile(id);
    db.prepare(
      "UPDATE files SET deleted_at=? WHERE id=? AND status='ready'",
    ).run(restore ? null : new Date().toISOString(), id);
    return true;
  },
  reference: ({ id }) => {
    const row = getFile(id);
    if (row.deleted_at || row.status !== "ready")
      throw new Error("文件已删除或未就绪");
    db.prepare("INSERT INTO file_refs VALUES(?,?,?)").run(
      crypto.randomUUID(),
      "default",
      id,
    );
    return true;
  },
  unreference: ({ id }) => {
    getFile(id);
    db.prepare("DELETE FROM file_refs WHERE file_id=? AND panel_id='default'").run(id);
    return true;
  },
  export: async ({ id, destination }) => {
    destination = path.resolve(destination);
    if (destination === root || destination.startsWith(root + path.sep))
      throw new Error("不能导出到应用内部数据目录");
    const row = getFile(id);
    if (row.status !== "ready") throw new Error("文件已清理");
    const tmp = destination + ".arasn-" + crypto.randomUUID() + ".tmp";
    try {
      await fsp.copyFile(object(id), tmp);
      const sum = await digest(tmp);
      if (sum.sha256 !== row.sha256)
        throw new Error("文件校验失败，已停止导出");
      await fsp.rename(tmp, destination);
      return true;
    } finally {
      await fsp.rm(tmp, { force: true });
    }
  },
  audit: (_args, notify) => audit(notify),
  backup: async ({ target }, notify) => {
    maintenance = true;
    try {
      return await makeBackup(target, notify);
    } finally {
      maintenance = false;
    }
  },
  purge: async (_args, notify) => {
    maintenance = true;
    try {
      const referenced = db.prepare(`SELECT f.id FROM files f WHERE f.deleted_at IS NOT NULL AND f.status='ready'
        AND (EXISTS(SELECT 1 FROM canvas_file_refs r WHERE r.file_id=f.id) OR EXISTS(SELECT 1 FROM file_refs r WHERE r.file_id=f.id))`).all();
      if (referenced.length) throw new Error(`有 ${referenced.length} 个文件仍被引用，请先移除引用或恢复文件`);
      const target = path.join(root, "backups", "before-empty-" + Date.now());
      await makeBackup(target, notify);
      for (const row of db
        .prepare(
          "SELECT * FROM files WHERE deleted_at IS NOT NULL AND status='ready'",
        )
        .all()) {
        const operation = crypto.randomUUID();
        db.prepare("INSERT INTO operations VALUES(?,?,?,?,NULL)").run(
          operation,
          "purge",
          "running",
          JSON.stringify({ id: row.id, backup: target }),
        );
        await fsp.rm(object(row.id), { force: true });
        transaction(() => {
          db.prepare("UPDATE files SET status='purged' WHERE id=?").run(row.id);
          db.prepare("UPDATE operations SET state='done' WHERE id=?").run(
            operation,
          );
        });
      }
      return { backup: target };
    } finally {
      maintenance = false;
    }
  },
  restoreBackup: async ({ source }, notify) => {
    if (activeImports) throw new Error("请先等待导入完成");
    maintenance = true;
    try {
      const manifest = JSON.parse(
        await fsp.readFile(path.join(source, "manifest.json"), "utf8"),
      );
      if (manifest.version !== 1 || !Array.isArray(manifest.files))
        throw new Error("备份格式无效");
      const incoming = new DatabaseSync(path.join(source, "workspace.sqlite"), {
        readOnly: true,
      });
      try {
        if (
          incoming.prepare("PRAGMA integrity_check").get().integrity_check !==
          "ok"
        )
          throw new Error("备份数据库损坏");
        const incomingVersion = incoming.prepare("PRAGMA user_version").get().user_version;
        if (![1, 2].includes(incomingVersion))
          throw new Error("备份数据库版本不兼容");
        const allRows = incoming.prepare("SELECT * FROM files").all();
        const rows = allRows.filter((row) => row.status === "ready");
        for (const row of allRows) {
          uuid(row.id);
          nameOf(row.name);
          if (!["ready", "purged"].includes(row.status))
            throw new Error("备份文件状态无效");
        }
        for (const row of rows) {
          uuid(row.id);
          const sum = await digest(
            path.join(source, "objects", row.id + ".bin"),
          );
          if (sum.sha256 !== row.sha256 || sum.size !== row.size)
            throw new Error("备份内容不完整");
        }
        await makeBackup(
          path.join(root, "backups", "before-restore-" + Date.now()),
          notify,
        );
        // Merge files and restore the board atomically; existing library files remain recoverable.
        for (const row of rows) {
          const existing = db
            .prepare("SELECT * FROM files WHERE id=?")
            .get(row.id);
          if (existing && existing.sha256 !== row.sha256)
            throw new Error("备份文件编号冲突");
          if (!existing || existing.status === "purged")
            await fsp.copyFile(
              path.join(source, "objects", row.id + ".bin"),
              object(row.id),
            );
        }
        const saved = JSON.parse(
          incoming.prepare("SELECT state FROM panels WHERE id=?").get("default")
            .state,
        );
        createStore(undefined, saved);
        transaction(() => {
          for (const row of allRows)
            db.prepare(
              "INSERT INTO files VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,deleted_at=excluded.deleted_at",
            ).run(
              row.id,
              row.name,
              row.category,
              row.size,
              row.sha256,
              row.status,
              row.created_at,
              row.deleted_at,
            );
          db.prepare("UPDATE panels SET state=? WHERE id=?").run(
            JSON.stringify(saved),
            "default",
          );
          db.prepare("DELETE FROM elements").run();
          for (const [id, item] of Object.entries(saved.items))
            db.prepare("INSERT INTO elements VALUES(?,?,?,?)").run(
              id,
              "default",
              item.version,
              JSON.stringify(item.value),
            );
          db.prepare("DELETE FROM file_refs").run();
          for (const ref of incoming.prepare("SELECT * FROM file_refs").all())
            db.prepare("INSERT INTO file_refs VALUES(?,?,?)").run(
              ref.id,
              "default",
              ref.file_id,
            );
          setSetting("recovery", null);
          const migrationRow = incoming.prepare("SELECT value FROM settings WHERE key='canvas-migration'").get();
          setSetting("canvas-migration", migrationRow ? JSON.parse(migrationRow.value) : null);
          db.prepare("DELETE FROM canvas_file_refs").run();
          for (const [id, item] of Object.entries(saved.items)) syncFileOwner(id, item.value, true);
          // Restoring old data must not make a previously upgraded database writable by old binaries.
          if (incomingVersion === 2) db.exec("PRAGMA user_version=2");
        });
        state = saved;
        return true;
      } finally {
        incoming.close();
      }
    } finally {
      maintenance = false;
    }
  },
};
parentPort.on("message", async ({ id, method, args }) => {
  try {
    if (maintenance && !["list", "getSetting", "setSetting"].includes(method))
      throw new Error("维护任务执行中，请稍后重试");
    if (!Object.hasOwn(methods, method)) throw new Error("接口不存在");
    const result = await methods[method](args || {}, (progress) =>
      parentPort.postMessage({ progress }),
    );
    parentPort.postMessage({ id, result });
  } catch (e) {
    parentPort.postMessage({ id, error: e.message, status: e.status });
  }
});
