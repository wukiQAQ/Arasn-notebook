const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createStore, startServer } = require("../desktop/server.cjs");
const text = (value) => ({
  type: "text",
  text: value,
  color: "#263449",
  x: 30,
  y: 40,
});
const operation = (value, id = randomUUID(), expected = 0) => ({
  id,
  expected,
  opId: randomUUID(),
  value,
});

test("topology retains legacy text positions and keeps local nodes out of shared reads and writes", async (t) => {
  const store = createStore();
  const layout = { x: -420, y: 2100, width: 280, height: 140, kind: "question", status: "done" };
  const legacy = operation({ ...text("问题"), topology: layout });
  const node = operation({ type: "node", text: "本地节点", topology: layout });
  store.apply(legacy);
  store.apply(node);
  assert.deepEqual(store.snapshot().items[node.id].value, node.value);
  assert.throws(() => store.apply(operation({ ...node.value, topology: { ...layout, x: Infinity } })), { status: 400 });
  const shared = await startServer({ store, token: "topology-test", legacyOnly: true });
  t.after(() => shared.close());
  const request = (endpoint, body) => fetch(`http://127.0.0.1:${shared.port}/api/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer topology-test", "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const snapshot = await (await request("board")).json();
  assert.deepEqual(snapshot.items, { [legacy.id]: { version: 1, value: text("问题") } });
  assert.equal((await request("ops", operation(null, node.id, 1))).status, 403);
  assert.equal((await request("ops", operation(node.value))).status, 403);
  assert.equal((await request("ops", operation({ ...text("改布局"), topology: layout }, legacy.id, 1))).status, 403);
  const edit = operation(text("共享正文"), legacy.id, 1);
  for (let retry = 0; retry < 2; retry++) {
    const response = await request("ops", edit);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items[legacy.id], { version: 2, value: text("共享正文") });
  }
  assert.deepEqual(store.snapshot().items[legacy.id].value, { ...text("共享正文"), topology: layout });
  store.apply(operation(null, node.id, 1));
  assert.equal((await request("ops", operation(null, node.id, 2))).status, 403);
  assert.equal(Object.hasOwn((await (await request("board")).json()).items, node.id), false);
});

test("custom colors and text formatting survive normalization, invalid styles are rejected", () => {
  const store = createStore();
  const op = operation({
    ...text("样式"),
    color: "#a23bc4",
    fontSize: 24,
    bold: true,
  });
  store.apply(op);
  store.apply(op);
  assert.deepEqual(store.snapshot().items[op.id].value, op.value);
  for (const style of [
    { color: "red;url(x)" },
    { fontSize: 999 },
    { bold: "yes" },
  ])
    assert.throws(() => store.apply(operation({ ...text("bad"), ...style })), {
      status: 400,
    });
  store.apply(
    operation({
      type: "stroke",
      color: "#123abc",
      width: 12,
      points: [
        [0, 0],
        [1600, 1000],
      ],
    }),
  );
});

test("shapes handle reverse drags, zero distance and canvas edges", () => {
  const { shapePoints } = require("../src/drawing.ts");
  for (const shape of ["line", "arrow", "rect", "ellipse", "triangle"]) {
    for (const [a, b] of [
      [
        [1600, 1000],
        [0, 0],
      ],
      [
        [0, 0],
        [0, 0],
      ],
      [
        [1, 1],
        [0, 0],
      ],
    ]) {
      const points = shapePoints(shape, a, b);
      assert.ok(points.length >= 2);
      assert.ok(
        points.every(
          ([x, y]) =>
            Number.isFinite(x) &&
            Number.isFinite(y) &&
            x >= 0 &&
            y >= 0 &&
            x <= 1600 &&
            y <= 1000,
        ),
      );
      if (["rect", "ellipse", "triangle"].includes(shape)) {
        assert.ok(
          Math.hypot(
            points[0][0] - points.at(-1)[0],
            points[0][1] - points.at(-1)[1],
          ) < 1e-8,
        );
      }
    }
  }
});

test("independent edits merge; retries do not duplicate; conflicting edits and resurrection fail", () => {
  const store = createStore();
  const first = operation(text("会议重点"));
  store.apply(first);
  store.apply(first);
  assert.equal(store.snapshot().revision, 1);
  store.apply(operation(text("另一台电脑")));
  assert.equal(Object.keys(store.snapshot().items).length, 2);
  assert.throws(() => store.apply(operation(text("过期覆盖"), first.id, 0)), {
    status: 409,
  });
  assert.throws(() => store.apply({ ...first, value: text("伪造重试") }), {
    status: 409,
  });
  store.apply(operation(null, first.id, 1));
  assert.throws(() => store.apply(operation(text("复活"), first.id, 2)), {
    status: 409,
  });
  assert.equal(store.snapshot().items[first.id].value, null);
});

test("disk restart preserves board, tombstones and idempotency receipts", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arasn-test-"));
  try {
    const file = path.join(dir, "board.json"),
      store = createStore(file);
    const first = operation(text("重启恢复"));
    store.apply(first);
    const loaded = createStore(file);
    loaded.apply(first);
    assert.deepEqual(loaded.snapshot(), store.snapshot());
    fs.writeFileSync(file, "broken");
    assert.throws(() => createStore(file));
    assert.equal(fs.readFileSync(file, "utf8"), "broken");
  } finally {
    fs.rmSync(dir, { recursive: true });
  }
});

test("invalid objects, prototype keys, nonfinite coordinates and oversized content are rejected", () => {
  const store = createStore();
  for (const value of [
    { ...text("x"), x: NaN },
    text("x".repeat(10001)),
    { type: "stroke", color: "#263449", width: 4, points: [[1, Infinity]] },
    { type: "html", text: "<script/>" },
  ])
    assert.throws(() => store.apply(operation(value)), { status: 400 });
  assert.throws(() => store.apply(operation(text("bad"), "__proto__")), {
    status: 400,
  });
  assert.equal(store.snapshot().revision, 0);
});

test("HTTP requires bearer credential and same origin; serves only UI files", async () => {
  const service = await startServer({
    store: createStore(),
    token: "test-only-token",
    staticDir: path.resolve(__dirname, "../dist"),
  });
  const url = `http://127.0.0.1:${service.port}`;
  const headers = {
    Authorization: "Bearer test-only-token",
    "Content-Type": "application/json",
  };
  try {
    assert.equal((await fetch(`${url}/api/board`)).status, 401);
    assert.equal(
      (
        await fetch(`${url}/api/board`, {
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(`${url}/api/board`, {
          headers: { ...headers, Origin: "https://evil.example" },
        })
      ).status,
      403,
    );
    const op = operation(text("<img src=x onerror=alert(1)>"));
    assert.equal(
      (
        await fetch(`${url}/api/ops`, {
          method: "POST",
          headers,
          body: JSON.stringify(op),
        })
      ).status,
      200,
    );
    const state = await (await fetch(`${url}/api/board`, { headers })).json();
    assert.equal(state.items[op.id].value.text, op.value.text);
    assert.equal(
      (
        await fetch(
          `${url}/api/board?revision=${state.revision}&roomId=${state.roomId}`,
          { headers },
        )
      ).status,
      204,
    );
    assert.equal(
      (await fetch(`${url}/api/ops`, { method: "POST", headers, body: "{" }))
        .status,
      400,
    );
    assert.equal((await fetch(`${url}/desktop/main.cjs`)).status, 404);
    assert.equal((await fetch(`${url}/%2e%2e/package.json`)).status, 404);
    assert.match(
      (await fetch(url)).headers.get("content-security-policy"),
      /frame-ancestors 'none'/,
    );
  } finally {
    await service.close();
  }
});


test("optional note titles survive validation without rewriting legacy bodies", () => {
  const store = createStore();
  const body = "旧标题\n原始正文";
  const legacy = operation(text(body));
  store.apply(legacy);
  assert.equal(store.snapshot().items[legacy.id].value.text, body);
  assert.equal(store.snapshot().items[legacy.id].value.title, undefined);
  const named = operation({ ...text(body), title: "独立标题" });
  store.apply(named);
  assert.equal(store.snapshot().items[named.id].value.title, "独立标题");
  assert.equal(store.snapshot().items[named.id].value.text, body);
  for (const title of [42, "x".repeat(201), "a\nb"]) assert.throws(() => store.apply(operation({ ...text(body), title })), { status: 400 });
});
