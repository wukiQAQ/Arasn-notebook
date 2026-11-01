const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const idValid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{32,36}$/.test(value);
const finite = (n, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
const fail = (status, message) => Object.assign(new Error(message), { status });

function validateValue(value) {
  if (
    !value ||
    typeof value.color !== "string" ||
    !/^#[a-fA-F0-9]{6}$/.test(value.color)
  )
    throw fail(400, "颜色无效");
  if (value.type === "text") {
    if (
      typeof value.text !== "string" ||
      value.text.length > 10000 ||
      !finite(value.x, 1320) ||
      !finite(value.y, 860) ||
      (value.fontSize !== undefined &&
        ![14, 18, 24, 32].includes(value.fontSize)) ||
      (value.bold !== undefined && typeof value.bold !== "boolean")
    )
      throw fail(400, "文字或位置超出限制");
    return {
      type: "text",
      text: value.text,
      x: value.x,
      y: value.y,
      color: value.color,
      ...(value.fontSize !== undefined ? { fontSize: value.fontSize } : {}),
      ...(value.bold !== undefined ? { bold: value.bold } : {}),
    };
  }
  if (value.type === "stroke") {
    if (
      ![2, 4, 7, 12].includes(value.width) ||
      !Array.isArray(value.points) ||
      value.points.length < 1 ||
      value.points.length > 3000 ||
      value.points.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          !finite(p[0], 1600) ||
          !finite(p[1], 1000),
      )
    )
      throw fail(400, "笔迹超出限制");
    return {
      type: "stroke",
      color: value.color,
      width: value.width,
      points: value.points,
    };
  }
  throw fail(400, "不支持的内容类型");
}

function createStore(file) {
  let state = {
    roomId: crypto.randomUUID(),
    revision: 0,
    items: {},
    receipts: {},
  };
  if (file && fs.existsSync(file)) {
    const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
    if (
      !loaded.roomId ||
      !Number.isSafeInteger(loaded.revision) ||
      !loaded.items ||
      !loaded.receipts
    )
      throw new Error("白板数据损坏，请先备份数据文件");
    for (const item of Object.values(loaded.items))
      if (item.value) validateValue(item.value);
    state = loaded;
  }
  return {
    snapshot: () => ({
      roomId: state.roomId,
      revision: state.revision,
      items: state.items,
    }),
    apply(operation) {
      if (
        !operation ||
        !idValid(operation.id) ||
        !idValid(operation.opId) ||
        !Number.isSafeInteger(operation.expected) ||
        operation.expected < 0
      )
        throw fail(400, "操作格式无效");
      const { id, opId, expected } = operation;
      const value =
        operation.value === null ? null : validateValue(operation.value);
      const signature = JSON.stringify({ id, expected, value });
      if (Object.hasOwn(state.receipts, opId)) {
        if (state.receipts[opId].signature !== signature)
          throw fail(409, "操作编号重复");
        return this.snapshot();
      }
      const current = Object.hasOwn(state.items, id)
        ? state.items[id]
        : undefined;
      if ((current?.version || 0) !== expected)
        throw fail(409, "这条内容刚被另一台电脑修改，你的改动已保留在本机");
      if (current?.value === null && value !== null)
        throw fail(409, "这条内容已删除，请另存为新便笺");
      if (!current && Object.keys(state.items).length >= 5000)
        throw fail(413, "本页已达到容量上限，请先导出备份");
      const next = structuredClone(state);
      next.revision++;
      next.items[id] = { version: (current?.version || 0) + 1, value };
      next.receipts[opId] = { signature };
      const receipts = Object.keys(next.receipts);
      if (receipts.length > 1000) delete next.receipts[receipts[0]];
      const data = JSON.stringify(next);
      if (Buffer.byteLength(data) > 12 * 1024 * 1024)
        throw fail(413, "本页已达到容量上限，请先导出备份");
      if (file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = `${file}.tmp`;
        fs.writeFileSync(temp, data, { encoding: "utf8", mode: 0o600 });
        fs.renameSync(temp, file);
      }
      state = next;
      return this.snapshot();
    },
  };
}

function startServer({
  store,
  token,
  host = "127.0.0.1",
  port = 0,
  staticDir,
}) {
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        const auth = req.headers.authorization || "";
        const expected = `Bearer ${token}`;
        if (
          Buffer.byteLength(auth) !== Buffer.byteLength(expected) ||
          !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(expected))
        )
          return send(401, { error: "连接凭证已失效，请向共享者获取新链接" });
        if (
          req.headers.origin &&
          req.headers.origin !== `http://${req.headers.host}`
        )
          return send(403, { error: "不允许跨站请求" });
        if (req.method === "GET" && url.pathname === "/api/board") {
          const state = store.snapshot();
          if (
            url.searchParams.get("roomId") === state.roomId &&
            url.searchParams.get("revision") === String(state.revision)
          ) {
            res.writeHead(204);
            return res.end();
          }
          return send(200, state);
        }
        if (req.method === "POST" && url.pathname === "/api/ops") {
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(415, { error: "需要 JSON 请求" });
          let size = 0,
            chunks = [];
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 256 * 1024) {
              send(413, { error: "单次内容过大" });
              req.resume();
              return;
            }
            chunks.push(chunk);
          }
          let operation;
          try {
            operation = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          } catch {
            throw fail(400, "JSON 无效");
          }
          return send(200, store.apply(operation));
        }
        return send(404, { error: "接口不存在" });
      }
      if (req.method !== "GET") return send(405, { error: "请求方法无效" });
      const relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1);
      if (
        relative !== "index.html" &&
        !/^assets\/[a-zA-Z0-9_.-]+$/.test(relative)
      )
        return send(404, { error: "文件不存在" });
      const file = path.join(staticDir, relative);
      if (!fs.existsSync(file)) return send(404, { error: "请先构建应用" });
      res.setHeader(
        "Content-Type",
        {
          ".html": "text/html; charset=utf-8",
          ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".svg": "image/svg+xml",
        }[path.extname(file)] || "application/octet-stream",
      );
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      send(error.status || 500, {
        error: error.status
          ? error.message
          : "本地保存失败，请检查磁盘空间并保留当前页面",
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () =>
      resolve({
        server,
        port: server.address().port,
        close: () =>
          new Promise((r) => {
            server.close(r);
            server.closeAllConnections();
          }),
      }),
    );
  });
}
module.exports = { createStore, startServer, validateValue };
