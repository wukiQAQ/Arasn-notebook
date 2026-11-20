const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const idValid = (value) =>
  typeof value === "string" && /^[a-f0-9-]{32,36}$/.test(value);
const finite = (n, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max;
const fail = (status, message) => Object.assign(new Error(message), { status });
const worldCoordinate = (value) => typeof value === "number" && Math.abs(value) <= 1_000_000;

function validFreeViewport(value) {
  return value && idValid(value.roomId) && worldCoordinate(value.x) && worldCoordinate(value.y) &&
    typeof value.zoom === "number" && value.zoom >= 0.25 && value.zoom <= 4;
}

function validTopologyViewport(value) {
  return value && idValid(value.roomId) && worldCoordinate(value.x) && worldCoordinate(value.y) &&
    typeof value.zoom === "number" && value.zoom >= 0.25 && value.zoom <= 2;
}

function validateTopology(value) {
  if (!value || !worldCoordinate(value.x) || !worldCoordinate(value.y) ||
      !finite(value.width, 720) || value.width < 120 || !finite(value.height, 480) || value.height < 96 ||
      !["note", "question", "idea", "task", "file"].includes(value.kind) ||
      !["open", "active", "done"].includes(value.status) ||
      (value.hidden !== undefined && typeof value.hidden !== "boolean") ||
      (value.locked !== undefined && typeof value.locked !== "boolean") ||
      (value.autoSize !== undefined && typeof value.autoSize !== "boolean") ||
      (value.color !== undefined && (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color))) ||
      (value.customTypeId !== undefined && !idValid(value.customTypeId)))
    throw fail(400, "节点布局或状态无效");
  const { x, y, width, height, kind, status, hidden, locked, autoSize, color, customTypeId } = value;
  return { x, y, width, height, kind, status, ...(hidden ? { hidden } : {}), ...(locked !== undefined ? { locked } : {}), ...(autoSize !== undefined ? { autoSize } : {}), ...(color ? { color } : {}), ...(customTypeId ? { customTypeId } : {}) };
}

const REFERENCE_TYPES = ["canvas-node", "canvas-edge", "content-link"];
const localTopologyItem = (item) => Boolean(item?.value?.canvasId) || item?.value?.type === "node" || item?.value?.type === "free-file" ||
  REFERENCE_TYPES.includes(item?.value?.type) || item?.value?.localOnly === true || item?.scope === "topology";

function validateRef(ref) {
  if (!ref || !["record", "file"].includes(ref.kind) || !idValid(ref.id)) throw fail(400, "内容引用无效");
  return { kind: ref.kind, id: ref.id };
}

function legacySnapshot(snapshot) {
  return { ...snapshot, items: Object.fromEntries(Object.entries(snapshot.items)
    .filter(([, item]) => !localTopologyItem(item))
    .map(([id, item]) => {
      if (item.value?.type !== "text" || !item.value.topology) return [id, item];
      const { topology, ...value } = item.value;
      return [id, { ...item, value }];
    })) };
}

function validateValue(value) {
  if (value?.canvasId !== undefined && !idValid(value.canvasId)) throw fail(400, "画布编号无效");
  const canvasScope = value?.canvasId === undefined ? {} : { canvasId: value.canvasId };
  if (value?.type === "free-note") {
    if (!value.canvasId || !idValid(value.recordId)) throw fail(400, "便签引用无效");
    const { x, y, color, width, height, opacity, bold, fontSize } = value;
    const { type, text, ...style } = validateValue({ type: "text", text: "", x, y, color, width, height, opacity, bold, fontSize });
    return { ...style, type: "free-note", recordId: value.recordId, canvasId: value.canvasId };
  }
  if (value?.opacity !== undefined && (typeof value.opacity !== "number" || !Number.isFinite(value.opacity) || value.opacity < .1 || value.opacity > 1)) throw fail(400,"不透明度无效");
  if (value?.type === "free-file") {
    if (!idValid(value.roomId) || value.localOnly !== true || value.contentRef?.kind !== "file" || !idValid(value.contentRef.id) || typeof value.name !== "string" || value.name.length > 255 || typeof value.category !== "string" || value.category.length > 16 || !worldCoordinate(value.x) || !worldCoordinate(value.y) || !finite(value.width,1200) || value.width < 120 || !finite(value.height,1200) || value.height < 96) throw fail(400,"附件位置或引用无效");
    return {...canvasScope,type:"free-file",roomId:value.roomId,contentRef:validateRef(value.contentRef),name:value.name,category:value.category,x:value.x,y:value.y,width:value.width,height:value.height,localOnly:true,...(value.opacity!==undefined?{opacity:value.opacity}:{})};
  }
  if (REFERENCE_TYPES.includes(value?.type)) {
    if (!idValid(value.roomId)) throw fail(400, "引用工作页无效");
    if (value.type === "content-link") {
      if (!idValid(value.recordId)) throw fail(400, "关联记录无效");
      return { type: value.type, roomId: value.roomId, recordId: value.recordId, targetRef: validateRef(value.targetRef) };
    }
    if (!idValid(value.canvasId)) throw fail(400, "画布编号无效");
    const base = { type: value.type, roomId: value.roomId, canvasId: value.canvasId };
    if (value.type === "canvas-node") return { ...base, contentRef: validateRef(value.contentRef), layout: validateTopology(value.layout) };
    if (!idValid(value.fromNodeId) || !idValid(value.toNodeId) || value.fromNodeId === value.toNodeId ||
        typeof value.label !== "string" || value.label.length > 200 || !["none", "forward", "both"].includes(value.direction))
      throw fail(400, "连接关系无效");
    if (value.relationType !== undefined && !["related", "reference", "dependency", "resolves", "source", "attachment"].includes(value.relationType))
      throw fail(400, "关系类型无效");
    const { fromPort, toPort } = value;
    const sides = ["top", "right", "bottom", "left"];
    if ((fromPort !== undefined || toPort !== undefined) && (!sides.includes(fromPort) || !sides.includes(toPort)))
      throw fail(400, "连接端点无效");
    return { ...base, fromNodeId: value.fromNodeId, toNodeId: value.toNodeId, label: value.label, direction: value.direction,
      ...(value.relationType !== undefined ? { relationType: value.relationType } : {}), ...(fromPort ? { fromPort, toPort } : {}) };
  }
  if (["text", "node"].includes(value?.type) && value.title !== undefined &&
      (typeof value.title !== "string" || value.title.length > 200 || /[\r\n]/.test(value.title))) throw fail(400, "便签标题超出限制");
  const placement = value?.freePlacement;
  if (placement !== undefined && (
    (value.type !== "node" && !(value.type === "text" && value.localOnly === true)) ||
    !placement || !worldCoordinate(placement.x) || !worldCoordinate(placement.y) ||
    (placement.width !== undefined && (!finite(placement.width, 1200) || placement.width < 120)) ||
    (placement.height !== undefined && (!finite(placement.height, 1200) || placement.height < 96))
  )) throw fail(400, "工作页位置无效");
  const freePlacement = placement === undefined ? {} : { freePlacement: {
    x: placement.x, y: placement.y,
    ...(placement.width !== undefined ? { width: placement.width } : {}),
    ...(placement.height !== undefined ? { height: placement.height } : {}),
  } };
  if (value?.type === "node") {
    if (typeof value.text !== "string" || value.text.length > 10000) throw fail(400, "节点正文超出限制");
    return { type: "node", text: value.text, ...(value.title !== undefined ? { title: value.title } : {}), topology: validateTopology(value.topology), ...freePlacement };
  }
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
      !worldCoordinate(value.x) ||
      !worldCoordinate(value.y) ||
      (value.width !== undefined && (!finite(value.width,1200) || value.width<120)) ||
      (value.height !== undefined && (!finite(value.height,1200) || value.height<96)) ||
      (value.fontSize !== undefined &&
        ![14, 18, 24, 32].includes(value.fontSize)) ||
      (value.bold !== undefined && typeof value.bold !== "boolean")
      || (value.localOnly !== undefined && value.localOnly !== true)
    )
      throw fail(400, "文字或位置超出限制");
    return {
      type: "text",
      text: value.text,
      ...(value.title !== undefined ? { title: value.title } : {}),
      x: value.x,
      y: value.y,
      color: value.color,
      ...(value.fontSize !== undefined ? { fontSize: value.fontSize } : {}),
      ...(value.bold !== undefined ? { bold: value.bold } : {}),
      ...(value.width !== undefined ? {width:value.width}:{}),
      ...(value.height !== undefined ? {height:value.height}:{}),
      ...(value.opacity !== undefined ? {opacity:value.opacity}:{}),
      ...(value.topology !== undefined ? { topology: validateTopology(value.topology) } : {}),
      ...(value.localOnly === true ? { localOnly: true } : {}),
      ...freePlacement,
    };
  }
  if (value.type === "stroke") {
    if ([value.dashLength,value.dashGap].some(n=>n!==undefined&&(!Number.isFinite(n)||n<1||n>120)) ||
        (value.inkVersion !== undefined && value.inkVersion !== 1) ||
        (value.brush !== undefined && !['ink','pencil','marker','highlighter','calligraphy','dash'].includes(value.brush)) ||
        (value.lineCap !== undefined && !['round','butt','square'].includes(value.lineCap)) ||
        (value.smoothing !== undefined && (typeof value.smoothing !== 'number' || !Number.isFinite(value.smoothing) || value.smoothing < 0 || value.smoothing > 1))) throw fail(400,'笔刷参数无效');
    if (
      !(Number.isFinite(value.width) && value.width >= .5 && value.width <= 40 && Number.isInteger(value.width * 2)) ||
      !Array.isArray(value.points) ||
      value.points.length < 1 ||
      value.points.length > 3000 ||
      value.points.some(
        (p) =>
          !Array.isArray(p) ||
          (p.length !== 2 && !(value.inkVersion === 1 && p.length === 3 && Number.isFinite(p[2]) && p[2] >= 0 && p[2] <= 1)) ||
          !worldCoordinate(p[0]) ||
          !worldCoordinate(p[1]),
      )
    )
      throw fail(400, "笔迹超出限制");
    return {
      type: "stroke",
      ...canvasScope,
      color: value.color,
      width: value.width,
      points: value.points,
      ...(value.inkVersion === 1 ? {inkVersion:1}:{}),
      ...(value.dashLength !== undefined ? {dashLength:value.dashLength}:{}),
      ...(value.dashGap !== undefined ? {dashGap:value.dashGap}:{}),
      ...(value.brush !== undefined ? {brush:value.brush}:{}),
      ...(value.lineCap !== undefined ? {lineCap:value.lineCap}:{}),
      ...(value.smoothing !== undefined ? {smoothing:value.smoothing}:{}),
      ...(value.opacity !== undefined ? {opacity:value.opacity}:{}),
    };
  }
  throw fail(400, "不支持的内容类型");
}

function createStore(file, initial) {
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
    for (const item of Object.values(loaded.items)) {
      if (item.value) validateValue(item.value);
      if (item.value?.roomId !== undefined && item.value.roomId !== loaded.roomId) throw new Error("引用工作页无效");
    }
    state = loaded;
  }
  if (initial) {
    if (!initial.roomId || !initial.items || !initial.receipts || !Number.isSafeInteger(initial.revision)) throw new Error('白板数据无效');
    for (const [id,item] of Object.entries(initial.items)) {
      if (!idValid(id)) throw new Error('元素编号无效');
      if (item.value) validateValue(item.value);
      if (item.value?.roomId !== undefined && item.value.roomId !== initial.roomId) throw new Error("引用工作页无效");
    }
    state = structuredClone(initial);
  }
  return {
    dump: () => structuredClone(state),
    snapshot: () => ({
      roomId: state.roomId,
      revision: state.revision,
      items: state.items,
    }),
    apply(operation, { legacyOnly = false } = {}) {
      if (
        !operation ||
        !idValid(operation.id) ||
        !idValid(operation.opId) ||
        !Number.isSafeInteger(operation.expected) ||
        operation.expected < 0
      )
        throw fail(400, "操作格式无效");
      const { id, opId, expected } = operation;
      const current = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
      if (legacyOnly && (localTopologyItem(current) || localTopologyItem({ value: operation.value }) ||
          operation.value?.topology !== undefined)) throw fail(403, "本机拓扑无法通过白板共享访问");
      let value =
        operation.value === null ? null : validateValue(operation.value);
      if (value?.roomId !== undefined && value.roomId !== state.roomId) throw fail(400, "引用属于其他工作页");
      const signature = JSON.stringify({ id, expected, value });
      if (Object.hasOwn(state.receipts, opId)) {
        if (state.receipts[opId].signature !== signature)
          throw fail(409, "操作编号重复");
        return this.snapshot();
      }
      if ((current?.version || 0) !== expected)
        throw fail(409, "这条内容刚被另一台电脑修改，你的改动已保留在本机");
      if (current?.value === null && value !== null)
        throw fail(409, "这条内容已删除，请另存为新便笺");
      if (current?.value && value && (localTopologyItem(current) || localTopologyItem({ value })) &&
          (current.value.type !== value.type || Boolean(current.value.localOnly) !== Boolean(value.localOnly)))
        throw fail(409, "不能更改本机内容的类型或共享范围");
      if (current?.value && value && current.value.canvasId !== value.canvasId)
        throw fail(409, "不能将引用移动到其他画布");
      if (value?.type === "free-file" && value.roomId !== state.roomId) throw fail(400,"附件工作页已更换");
      if (value?.type === "canvas-edge") {
        for (const endpoint of [value.fromNodeId, value.toNodeId]) {
          const node = state.items[endpoint]?.value;
          if (node?.type !== "canvas-node" || node.canvasId !== value.canvasId)
            throw fail(400, "连接端点不在当前画布");
        }
      }
      if (current?.value && value && (current.value.type === "node") !== (value.type === "node"))
        throw fail(409, "项目类型已更换");
      if (legacyOnly && value?.type === "stroke" && current?.value?.topology)
        throw fail(409, "不能将拓扑便笺更换为笔迹");
      if (legacyOnly && value?.type === "text" && current?.value?.type === "text" && current.value.topology)
        value = { ...value, topology: current.value.topology };
      if (!current && Object.keys(state.items).length >= 5000)
        throw fail(413, "本页已达到容量上限，请先导出备份");
      const next = structuredClone(state);
      next.revision++;
      next.items[id] = { version: (current?.version || 0) + 1, value,
        ...(value === null && localTopologyItem(current) ? { scope: "topology" } : {}) };
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
  legacyOnly = false,
  preview,
  canvasShare,
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
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (preview && url.pathname.startsWith("/preview-content/"))
        return await preview(req, res, url.pathname.slice("/preview-content/".length));
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
        if (canvasShare && req.method === "GET" && url.pathname.startsWith("/api/attachment/")) {
          const file = await canvasShare.file(url.pathname.slice("/api/attachment/".length));
          const stream = fs.createReadStream(file.path);
          stream.on("error", () => res.destroy());
          res.on("close", () => stream.destroy());
          res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Length": file.size,
            "Content-Disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(file.name),
          });
          stream.pipe(res);
          return;
        }
        if (req.method === "GET" && url.pathname === "/api/board") {
          const state = canvasShare ? await canvasShare.snapshot(req.socket.remoteAddress) : store.snapshot();
          if (
            url.searchParams.get("roomId") === state.roomId &&
            url.searchParams.get("revision") === String(state.revision)
          ) {
            res.writeHead(204);
            return res.end();
          }
          return send(200, legacyOnly ? legacySnapshot(state) : state);
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
          const state = canvasShare ? await canvasShare.apply(operation) : await store.apply(operation, { legacyOnly });
          return send(200, legacyOnly ? legacySnapshot(state) : state);
        }
        return send(404, { error: "接口不存在" });
      }
      if (req.method !== "GET") return send(405, { error: "请求方法无效" });
      if (canvasShare) {
        const asset = canvasShare.assets[url.pathname];
        if (!asset) return send(404, { error: "文件不存在" });
        res.setHeader("Content-Type", asset.type);
        return res.end(asset.body);
      }
      const relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1);
      if (
        relative !== "index.html" &&
        !(preview && (relative === "file-preview-worker.html" ||
          /^preview-pdf\/(cmaps|standard_fonts)\/[a-zA-Z0-9_.-]+$/.test(relative))) &&
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
          ".mjs": "text/javascript; charset=utf-8",
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
          new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
            server.closeAllConnections();
          }),
      }),
    );
  });
}
module.exports = { createStore, startServer, validateValue, validFreeViewport, validTopologyViewport, legacySnapshot, localTopologyItem };
