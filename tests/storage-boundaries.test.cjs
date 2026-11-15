const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");
test("pagination, search, integrity mismatch, migration and real interrupted copy", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-boundaries-"));
  let engine;
  try {
    const data = path.join(root, "data");
    await fs.mkdir(data);
    const item = crypto.randomUUID();
    const legacy = {
      roomId: crypto.randomUUID(),
      revision: 1,
      items: {
        [item]: {
          version: 1,
          value: { type: "text", text: "旧数据", color: "#263449", x: 1, y: 1 },
        },
      },
      receipts: {},
    };
    await fs.writeFile(path.join(data, "board.json"), JSON.stringify(legacy));
    let started;
    const progress = new Promise((r) => (started = r));
    engine = new StorageEngine(data, () => started());
    assert.equal(
      (await engine.call("init")).state.items[item].value.text,
      "旧数据",
    );
    const paths = [];
    for (let i = 0; i < 28; i++) {
      const file = path.join(root, `document-${i}.txt`);
      await fs.writeFile(file, String(i));
      paths.push(file);
    }
    const imported = await engine.call("import", { paths });
    assert.equal((await engine.call("list", { page: 0 })).rows.length, 25);
    assert.equal((await engine.call("list", { page: 1 })).rows.length, 3);
    assert.equal(
      (await engine.call("list", { query: "document-27" })).total,
      1,
    );
    const id = imported[0].file.id;
    await assert.rejects(
      engine.call("export", {
        id,
        destination: path.join(data, "workspace.sqlite"),
      }),
    );
    await fs.writeFile(path.join(data, "objects", id + ".bin"), "changed");
    assert.ok((await engine.call("audit")).corrupt.includes(id));
    await assert.rejects(
      engine.call("export", {
        id,
        destination: path.join(root, "bad-export.txt"),
      }),
    );
    const big = path.join(root, "big.bin");
    const handle = await fs.open(big, "w");
    await handle.truncate(512 * 1024 * 1024);
    await handle.close();
    let copyStarted;
    const copied = new Promise((r) => (copyStarted = r));
    await engine.close();
    engine = new StorageEngine(data, () => copyStarted());
    await engine.call("init");
    const interrupted = engine.call("import", { paths: [big] }).catch(() => {});
    await copied;
    await engine.close();
    await interrupted;
    engine = new StorageEngine(data);
    await engine.call("init");
    assert.equal((await engine.call("list", {})).total, 28);
    assert.ok((await engine.call("audit")).failed.length > 0);
    assert.equal(
      JSON.parse(await fs.readFile(path.join(data, "board.json"), "utf8"))
        .items[item].value.text,
      "旧数据",
    );
  } finally {
    await engine?.close();
    if (path.dirname(root) !== os.tmpdir()) throw new Error("Invalid cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
});
