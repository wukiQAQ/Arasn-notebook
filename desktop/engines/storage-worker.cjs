const { parentPort, workerData } = require("node:worker_threads");
const { DatabaseSync, backup } = require("node:sqlite");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { pipeline } = require("node:stream/promises");
const { Transform } = require("node:stream");
const { createStore, localTopologyItem } = require("../server.cjs");
const canvasLibrary = require("./canvas-catalog.cjs");
const { planCanvasMigration } = require("./canvas-migration.cjs");
const root = path.resolve(workerData.root);
fs.mkdirSync(path.join(root, "objects"), { recursive: true });
fs.mkdirSync(path.join(root, "staging"), { recursive: true });
const db = new DatabaseSync(path.join(root, "workspace.sqlite"));
db.exec(
  "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=5000;",
);
const schemaVersion = db.prepare("PRAGMA user_version").get().user_version;
if (schemaVersion > 3)
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
const withFileOrigin = row => {
  let origin = 'unknown';
  try { const detail = db.prepare("SELECT detail FROM operations WHERE id=? AND kind='import'").get(row.id); origin = JSON.parse(detail?.detail || '{}').origin; } catch {}
  return { ...row, importOrigin: ['local','paste','device'].includes(origin) ? origin : 'unknown' };
};
const getFile = (id) => {
  const row = db.prepare("SELECT * FROM files WHERE id=?").get(uuid(id));
  if (!row) throw new Error("文件不存在");
  return withFileOrigin(row);
};
function syncFileOwner(id, value, allowDeleted = false) {
  db.prepare("DELETE FROM canvas_file_refs WHERE owner_id=?").run(id);
  const ref = ["canvas-node","free-file"].includes(value?.type) ? value.contentRef : value?.type === "content-link" ? value.targetRef : null;
  if (ref?.kind !== "file") return;
  if (allowDeleted && !db.prepare("SELECT 1 FROM files WHERE id=?").get(ref.id)) return;
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
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|tiff?|psd|psb)$/.test(ext)
    ? "图片"
    : /\.(mp3|wav|flac|ogg|m4a)$/.test(ext)
      ? "音频"
      : /\.(mp4|mkv|mov|avi|webm)$/.test(ext)
        ? "视频"
        : /\.(docx?|xlsx?|pptx?|pdf|txt|md|csv|json|log|xml|ya?ml|jsx?|tsx?|py|html?|css)$/.test(ext)
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
async function importOne(source, notify, displayName, origin = 'local') {
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
      JSON.stringify({ source: real, origin: ['local','paste'].includes(origin) ? origin : 'unknown' }),
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
function persistCanvasState(next, ids, catalog, syncOwners = true, files = []) {
  transaction(() => {
    for (const file of files) db.prepare("INSERT INTO files VALUES(?,?,?,?,?,?,?,NULL)").run(file.id, file.name, category(file.name), file.bytes.length, file.sha256, "ready", new Date().toISOString());
    db.prepare("UPDATE panels SET state=? WHERE id='default'").run(JSON.stringify(next));
    const write = db.prepare("INSERT INTO elements VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,value=excluded.value");
    for (const id of ids) {
      const item = next.items[id];
      if (item) write.run(id, "default", item.version, JSON.stringify(item.value));
      else db.prepare("DELETE FROM elements WHERE id=?").run(id);
      if (syncOwners) syncFileOwner(id, item?.value, true);
    }
    setSetting("canvas-catalog", catalog);
    if (catalog.backup && getSetting("canvas-migration")?.roomId !== next.roomId)
      setSetting("canvas-migration", { version: 1, roomId: next.roomId, backup: catalog.backup });
    db.exec("PRAGMA user_version=3");
  });
  state = next;
}

async function canvasCatalog({ action, id, type, name, camera, options, pack, includeNotes, includeFiles }, notify) {
  let catalog = getSetting("canvas-catalog");
  if (catalog?.roomId !== state.roomId) {
    if (action !== "list") throw new Error("请先加载画布库");
    if (activeImports) throw new Error("请等待文件导入完成后再迁移");
    checkRecoveryBeforeMigration();
    maintenance = true;
    try {
      const backupPath = await makeBackup(path.join(root, "backups", "before-multi-canvas-" + crypto.randomUUID()), notify);
      checkRecoveryBeforeMigration();
      const legacy = getSetting("settings") || {};
      const workspace = canvasLibrary.metadata("workspace", "默认工作页");
      const relation = canvasLibrary.metadata("relation", "默认关系图", state.roomId);
      const freeViewport = canvasLibrary.viewportFor("workspace", legacy.freeViewport, state.roomId);
      const relationViewport = canvasLibrary.viewportFor("relation", legacy.topologyViewport, state.roomId);
      if (freeViewport) workspace.viewport = freeViewport;
      if (relationViewport) relation.viewport = relationViewport;
      if (canvasLibrary.validCanvasOptions(legacy.canvasOptions)) relation.options = { ...legacy.canvasOptions, roomId: state.roomId };
      catalog = { version: 1, roomId: state.roomId, backup: backupPath, boards: [workspace, relation] };

      const candidate = createStore(undefined, state);
      const updated = [];
      if (getSetting("canvas-migration")?.roomId !== state.roomId) {
        for (const operation of planCanvasMigration(state).operations) {
          candidate.apply(operation);
          updated.push(operation.id);
        }
      }
      for (const [recordId, { value }] of Object.entries(state.items)) {
        if ((value?.type !== "text" && value?.type !== "node") || (value.localOnly || value.type === "node") && !value.freePlacement) continue;
        const { x, y, width, height, color = "#263449", opacity, bold, fontSize } = { ...value, ...value.freePlacement };
        const placement = crypto.randomUUID();
        candidate.apply({ id: placement, opId: crypto.randomUUID(), expected: 0, value: {
          type: "free-note", canvasId: workspace.id, recordId, x, y, width, height, color, opacity, bold, fontSize,
        } });
        updated.push(placement);
      }
      const next = candidate.dump();
      for (const [key, item] of Object.entries(next.items)) {
        if ((item.value?.type === "stroke" || item.value?.type === "free-file") && !item.value.canvasId) {
          item.value.canvasId = workspace.id;
          updated.push(key);
        }
      }
      next.receipts = state.receipts;
      next.revision++;
      createStore(undefined, next);
      persistCanvasState(next, updated, catalog, false);
      return { catalog, state };
    } finally { maintenance = false; }
  }
  if (action === "list") return { catalog };
  const entry = catalog.boards.find(board => board.id === id);
  if (action !== "create" && action !== "import" && !entry) throw new Error("找不到此画布");
  if (entry?.deletedAt && !["restore", "purge"].includes(action)) throw new Error("请先恢复画布");
  if (action === "export") {
    const objects = canvasLibrary.valuesOf(state, id);
    const records = [];
    const files = [];
    let size = 0;
    for (const { kind, id: key } of canvasLibrary.references(objects)) {
      const record = state.items[key]?.value;
      if (includeNotes === true && kind === "record" && (record?.type === "text" || record?.type === "node"))
        records.push({ id: key, text: record.text, title: record.title });
      if (includeFiles !== true || kind !== "file") continue;
      const row = db.prepare("SELECT * FROM files WHERE id=? AND status='ready' AND deleted_at IS NULL").get(key);
      if (!row || !fs.existsSync(object(key))) continue;
      size += row.size;
      if (size > 24 * 1024 * 1024) throw new Error("画布包附件上限为 24 MiB");
      const bytes = fs.readFileSync(object(key));
      if (bytes.length !== row.size || crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256)
        throw new Error("附件内容与文件中心校验不符");
      files.push({ id: key, name: row.name, sha256: row.sha256, data: bytes.toString("base64") });
    }
    return { catalog, pack: { version: 1, format: "arasn-canvas", canvas: entry, objects, records, files } };
  }

  if (action === "create") catalog.boards.push(canvasLibrary.metadata(type, name));
  else if (action === "rename") entry.name = canvasLibrary.cleanName(name, entry.type);
  else if (action === "open") entry.openedAt = new Date().toISOString();
  else if (action === "trash") entry.deletedAt = new Date().toISOString();
  else if (action === "restore") delete entry.deletedAt;
  else if (action === "viewport") {
    entry.viewport = canvasLibrary.viewportFor(entry.type, camera, state.roomId);
    if (!entry.viewport) throw new Error("视口无效");
  } else if (action === "options") {
    if (entry.type !== "relation" || !canvasLibrary.validCanvasOptions(options)) throw new Error("画布设置无效");
    entry.options = { ...options, roomId: state.roomId };
  } else if (action === "duplicate" || action === "import") {
    if (action === "import" && (pack?.version !== 1 || pack.format !== "arasn-canvas" || !pack.canvas))
      throw new Error("画布包格式或版本无效");
    const source = entry ?? pack.canvas;
    const canvas = canvasLibrary.metadata(source.type, entry ? (entry.name + " 副本").slice(0, 100) : source.name);
    const viewport = canvasLibrary.viewportFor(canvas.type, source.viewport, state.roomId);
    if (viewport) canvas.viewport = viewport;
    if (source.options !== undefined && canvas.type === "relation") {
      if (!canvasLibrary.validCanvasOptions(source.options)) throw new Error("画布设置无效");
      canvas.options = { ...source.options, roomId: state.roomId };
    }
    const objects = canvasLibrary.duplicate(entry ? canvasLibrary.valuesOf(state, entry.id) : pack.objects, canvas, state.roomId);
    const candidate = createStore(undefined, state);
    const references = canvasLibrary.references(objects);
    const records = entry ? new Map() : canvasLibrary.packageResources(pack.records, references, "record");
    const files = entry ? new Map() : canvasLibrary.packageResources(pack.files, references, "file");
    const mapped = new Map();
    const newRecords = [];
    const newFiles = [];
    let size = 0;
    for (const [key, record] of records) {
      const existing = state.items[key]?.value;
      if (["text", "node"].includes(existing?.type) && existing.text === record.text && existing.title === record.title) continue;
      const newId = crypto.randomUUID();
      candidate.apply({ id: newId, opId: crypto.randomUUID(), expected: 0, value: {
        type: "text", text: record.text, title: record.title, x: 0, y: 0, color: "#263449", localOnly: true,
      } });
      mapped.set("record:" + key, newId);
      newRecords.push(newId);
    }
    for (const [key, file] of files) {
      if (typeof file.data !== "string" || typeof file.name !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256))
        throw new Error("附件格式无效");
      const bytes = Buffer.from(file.data, "base64");
      size += bytes.length;
      if (size > 24 * 1024 * 1024 || crypto.createHash("sha256").update(bytes).digest("hex") !== file.sha256)
        throw new Error("附件超出容量限制或校验失败");
      const existing = db.prepare("SELECT id FROM files WHERE sha256=? AND status='ready' AND deleted_at IS NULL ORDER BY id LIMIT 1").get(file.sha256);
      if (existing) mapped.set("file:" + key, existing.id);
      else {
        const id = crypto.randomUUID();
        mapped.set("file:" + key, id);
        newFiles.push({ id, name: nameOf(file.name), sha256: file.sha256, bytes });
      }
    }
    let missing = 0;
    for (const { id: key, value } of objects) {
      const ref = value.type === "free-note" ? { kind: "record", id: value.recordId } : value.contentRef;
      const replacement = ref && mapped.get(ref.kind + ":" + ref.id);
      if (replacement) {
        if (value.type === "free-note") value.recordId = replacement;
        else value.contentRef = { kind: ref.kind, id: replacement };
      } else {
        if (ref?.kind === "record" && !["text", "node"].includes(state.items[ref.id]?.value?.type)) missing++;
        if (ref?.kind === "file" && !db.prepare("SELECT 1 FROM files WHERE id=? AND status='ready' AND deleted_at IS NULL").get(ref.id)) missing++;
      }
      candidate.apply({ id: key, opId: crypto.randomUUID(), expected: 0, value });
    }
    if (missing) canvas.missingReferences = missing;
    catalog.boards.push(canvas);
    const next = candidate.dump();
    const written = [];
    try {
      for (const file of newFiles) {
        const out = fs.openSync(object(file.id), "wx", 0o600);
        written.push(file.id);
        try { fs.writeFileSync(out, file.bytes); fs.fsyncSync(out); } finally { fs.closeSync(out); }
      }
      persistCanvasState(next, [...newRecords, ...objects.map(object => object.id)], catalog, true, newFiles);
    } catch (error) {
      for (const key of written) fs.rmSync(object(key), { force: true });
      throw error;
    }
    return { catalog, state };
  } else if (action === "purge" && entry.deletedAt) {
    const next = structuredClone(state);
    const ids = canvasLibrary.valuesOf(next, id).map(object => object.id);
    for (const key of ids) next.items[key] = { version: next.items[key].version + 1, value: null, scope: "topology" };
    next.revision++;
    catalog.boards = catalog.boards.filter(board => board.id !== id);
    persistCanvasState(next, ids, catalog);
    return { catalog, state };
  } else throw new Error("画布操作无效");
  setSetting("canvas-catalog", catalog);
  return { catalog };
}

function sharedCanvas({ action, id, roomId, mode, includeNotes, includeFiles, operation, objectId }) {
  const catalog = getSetting("canvas-catalog");
  const board = catalog?.boards.find(entry => entry.id === id && !entry.deletedAt);
  if (state.roomId !== roomId || catalog?.roomId !== roomId || !board)
    throw Object.assign(new Error("共享画布已不可用"), { status: 410 });
  const unavailable = () => Object.assign(new Error("对象不在共享范围内"), { status: 404 });
  if (action === "edit") {
    if (mode !== "edit") throw Object.assign(new Error("此链接仅供查看"), { status: 403 });
    const item = state.items[operation?.id];
    const value = item?.value;
    if (value?.canvasId !== id || value.type === "stroke" || value.type === "canvas-edge" || value.layout?.hidden || value.layout?.locked)
      throw unavailable();
    if (!Number.isFinite(operation.x) || !Number.isFinite(operation.y) || !Number.isSafeInteger(operation.expected))
      throw Object.assign(new Error("位置格式无效"), { status: 400 });
    const position = { x: operation.x, y: operation.y };
    const next = value.type === "canvas-node" ? { ...value, layout: { ...value.layout, ...position } } : { ...value, ...position };
    methods.board({ operation: { id: operation.id, opId: operation.opId, expected: operation.expected, value: next } });
    return { state, view: sharedCanvas({ action: "view", id, roomId, mode, includeNotes, includeFiles }) };
  }
  if (action === "file") {
    const value = state.items[objectId]?.value;
    if (includeFiles !== true || value?.canvasId !== id || value.contentRef?.kind !== "file" || value.layout?.hidden) throw unavailable();
    const row = db.prepare("SELECT name,size FROM files WHERE id=? AND status='ready' AND deleted_at IS NULL").get(value.contentRef.id);
    if (!row || !fs.existsSync(object(value.contentRef.id))) throw unavailable();
    return { ...row, path: object(value.contentRef.id) };
  }
  const objects = canvasLibrary.valuesOf(state, id).flatMap(({ id: key, value }) => {
    if (value.layout?.hidden) return [];
    const version = state.items[key].version;
    if (value.type === "stroke") return [{ id: key, type: value.type, points: value.points, width: value.width, color: value.color, opacity: value.opacity }];
    if (value.type === "canvas-edge") return [{ id: key, type: value.type, from: value.fromNodeId, to: value.toNodeId, label: value.label }];
    const ref = value.type === "free-note" ? { kind: "record", id: value.recordId } : value.contentRef;
    const record = includeNotes === true && ref.kind === "record" ? state.items[ref.id]?.value : undefined;
    const file = includeFiles === true && ref.kind === "file" ?
      db.prepare("SELECT name FROM files WHERE id=? AND status='ready' AND deleted_at IS NULL").get(ref.id) : undefined;
    const { x, y, width = 280, height = 140, locked } = value.layout ?? value;
    return [{ id: key, type: value.type, x, y, width, height, version, locked: !!locked,
      title: record?.title ?? file?.name ?? (ref.kind === "file" ? "附件" : "便签"),
      text: record?.text ?? (ref.kind === "file" ? (file ? "" : "附件未共享") : "正文未共享"),
      download: Boolean(file),
    }];
  });
  return { roomId: id, revision: state.revision, name: board.name, mode, objects };
}

const methods = {
  canvasCatalog,
  sharedCanvas,
  metadata: ({ id, recordId }) => {
    const file = getFile(id);
    return { id: file.id, name: file.name, category: file.category, size: file.size, sha256: file.sha256, deleted_at: file.deleted_at, status: file.status, importOrigin: file.importOrigin,
      attachmentOrigin: recordId ? getSetting(`attachment-origin:${uuid(recordId)}:${file.id}`) : undefined };
  },
  attachmentOrigin: ({ id, recordId, origin }) => {
    const file = getFile(id);
    if (!['本地导入','粘贴','文件中心引用','设备互传','关系画布附件'].includes(origin)) throw new Error('附件来源无效');
    setSetting(`attachment-origin:${uuid(recordId)}:${file.id}`, origin);
    return true;
  },
  canvasCreate: ({ roomId, canvasId = roomId, recordId, nodeId, opId, layout, text = "" }) => {
    if (roomId !== state.roomId || getSetting("canvas-migration")?.roomId !== roomId)
      throw new Error("请先完成当前工作页的关系画布兼容升级");
    canvasLibrary.scope(getSetting("canvas-catalog"), { type: "canvas-node", canvasId });
    uuid(recordId); uuid(nodeId); uuid(opId);
    if (recordId === nodeId) throw new Error("记录和引用必须使用不同编号");
    const candidate = createStore(undefined, state);
    candidate.apply({ id: recordId, opId, expected: 0, value: {
      type: "text", text, x: 100, y: 100, color: "#263449", localOnly: true,
    } });
    candidate.apply({ id: nodeId, opId: crypto.createHash("sha256").update(`${opId}:node`).digest("hex").slice(0, 32), expected: 0, value: {
      type: "canvas-node", roomId, canvasId, contentRef: { kind: "record", id: recordId }, layout,
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
  previewSource: async ({ id }) => {
    const row = getFile(id);
    if (row.status !== "ready" || row.deleted_at) return null;
    const file = object(id);
    const stat = await fsp.lstat(file);
    if (!stat.isFile()) return null;
    const [dataRoot, resolved] = await Promise.all([fsp.realpath(root), fsp.realpath(file)]);
    if (path.relative(path.join(dataRoot, "objects"), resolved) !== path.basename(file)) return null;
    return {
      path: resolved, name: row.name, size: stat.size, sha256: row.sha256,
      mtime: stat.mtimeMs, ctime: stat.ctimeMs,
    };
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
        results.push(await importOne(detail.source, notify, undefined, detail.origin));
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
    const catalog = getSetting("canvas-catalog");
    const scopedValue = operation.value ?? state.items[operation.id]?.value;
    canvasLibrary.scope(catalog, scopedValue);
    if (operation.value?.type === "free-note" && operation.value.recordId !== state.items[operation.id]?.value?.recordId && !["text", "node"].includes(state.items[operation.value.recordId]?.value?.type))
      throw new Error("原始便签不存在");
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
      const canvas = catalog?.boards.find(entry => entry.id === scopedValue?.canvasId);
      if (canvas && next.revision > state.revision) {
        canvas.updatedAt = new Date().toISOString();
        setSetting("canvas-catalog", catalog);
      }
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
        .all(...args, page * 25).map(withFileOrigin),
      total: db
        .prepare(`SELECT count(*) n FROM files f WHERE ${where}`)
        .get(...args).n,
    };
  },
  import: async ({ paths, names = [], origin = 'local' }, notify) => {
    if (!Array.isArray(paths) || paths.length > 100)
      throw new Error("每批最多100个文件");
    const results = [];
    for (const [index, source] of paths.entries()) {
      try {
        results.push({
          ok: true,
          file: await importOne(source, notify, names[index], origin),
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
        if (![1, 2, 3].includes(incomingVersion))
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
          const catalogRow = incoming.prepare("SELECT value FROM settings WHERE key='canvas-catalog'").get();
          setSetting("canvas-catalog", catalogRow ? JSON.parse(catalogRow.value) : null);
          const currentVersion = db.prepare("PRAGMA user_version").get().user_version;
          if (incomingVersion > currentVersion) db.exec("PRAGMA user_version=" + incomingVersion);
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
