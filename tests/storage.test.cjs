const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");
test("file lifecycle, panel separation, SQLite restart, backup, audit and interrupted operation recovery", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-storage-"));
  let engine = new StorageEngine(path.join(root, "data"));
  try {
    const first = await engine.call("init");
    assert.ok(first.state.roomId);
    const sources = [
      "photo.png",
      "audio.mp3",
      "video.mp4",
      "document.docx",
      "sheet.xlsx",
      "slides.pptx",
      "paper.pdf",
      "note.txt",
      "data.csv",
      "archive.zip",
      "arbitrary.exe",
    ];
    for (const name of sources)
      await fs.writeFile(path.join(root, name), "payload:" + name);
    const result = await engine.call("import", {
      paths: sources.map((n) => path.join(root, n)),
    });
    assert.ok(result.every((r) => r.ok));
    const id = result[0].file.id;
    assert.equal((await engine.call("list", {})).total, 11);
    assert.equal((await engine.call("list", { kind: "图片" })).total, 1);
    await engine.call("reference", { id });
    assert.equal((await engine.call("list", { panel: true })).total, 1);
    await engine.call("board", {
      operation: {
        id: crypto.randomUUID(),
        opId: crypto.randomUUID(),
        expected: 0,
        value: {
          type: "text",
          text: "保存测试",
          color: "#263449",
          x: 20,
          y: 20,
        },
      },
    });
    const beforeClear = (await engine.call("init")).state;
    await engine.call("clearPanel");
    assert.deepEqual((await engine.call("init")).state, beforeClear);
    assert.equal((await engine.call("list", { panel: true })).total, 0);
    assert.equal((await engine.call("list", {})).total, 11);
    await engine.call("rename", { id, name: "新名字.png" });
    await assert.rejects(engine.call("rename", { id, name: "../bad.png" }));
    await assert.rejects(engine.call("trash", { id: "../bad" }));
    await engine.call("export", {
      id,
      destination: path.join(root, "export.png"),
    });
    assert.equal(
      await fs.readFile(path.join(root, "export.png"), "utf8"),
      "payload:photo.png",
    );
    await engine.call("trash", { id });
    assert.equal((await engine.call("list", { trash: true })).total, 1);
    await engine.call("trash", { id, restore: true });
    await engine.close();
    engine = new StorageEngine(path.join(root, "data"));
    await engine.call("init");
    assert.equal((await engine.call("list", {})).total, 11);
    const backup = path.join(root, "backup");
    await engine.call("backup", { target: backup });
    await engine.call("trash", { id });
    const purge = await engine.call("purge");
    assert.ok(purge.backup);
    assert.equal((await engine.call("list", { trash: true })).total, 0);
    await engine.call("restoreBackup", { source: backup });
    assert.equal((await engine.call("list", {})).total, 11);
    const audit = await engine.call("audit");
    assert.deepEqual(audit.missing, []);
    assert.deepEqual(audit.corrupt, []);
    const bad = await engine.call("import", {
      paths: [path.join(root, "missing")],
    });
    assert.equal(bad[0].ok, false);
    await engine.close();
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(path.join(root, "data/workspace.sqlite"));
    const interrupted = crypto.randomUUID();
    db.prepare("INSERT INTO operations VALUES(?,?,?,?,NULL)").run(
      interrupted,
      "import",
      "running",
      "{}",
    );
    db.close();
    await fs.writeFile(
      path.join(root, "data/staging", interrupted + ".part"),
      "partial",
    );
    engine = new StorageEngine(path.join(root, "data"));
    await engine.call("init");
    assert.ok(
      (await engine.call("audit")).failed.some((r) => r.id === interrupted),
    );
    assert.equal((await engine.call("list", {})).total, 11);
  } finally {
    await engine.close();
    assert.equal(path.dirname(root), os.tmpdir());
    await fs.rm(root, { recursive: true, force: true });
  }
});
