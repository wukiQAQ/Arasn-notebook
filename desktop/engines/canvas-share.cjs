const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { startServer } = require("../server.cjs");

async function startCanvasShare(store, { id, roomId, mode, includeNotes, includeFiles, host }) {
  const access = { id, roomId, mode, includeNotes, includeFiles };
  const token = randomBytes(32).toString("hex");
  const viewers = new Map();
  let active = true;
  const assertActive = () => {
    if (!active) throw Object.assign(new Error("共享链接已失效"), { status: 410 });
  };
  const call = async args => {
    assertActive();
    const result = await store.sharedCanvas({ ...access, ...args });
    assertActive();
    return result;
  };
  await call({ action: "view" });
  const assets = Object.fromEntries([
    ["/", "index.html", "text/html"],
    ["/canvas-share.css", "view.css", "text/css"],
    ["/canvas-share.js", "view.js", "text/javascript"],
  ].map(([route, file, type]) => [route, { body: fs.readFileSync(path.join(__dirname, "canvas-share", file)), type: type + "; charset=utf-8" }]));
  const server = await startServer({ host, token, canvasShare: {
    assets,
    snapshot: async address => {
      const view = await call({ action: "view" });
      for (const [key, seen] of viewers) if (Date.now() - seen > 8000) viewers.delete(key);
      if (address) viewers.set(address, Date.now());
      return view;
    },
    apply: operation => call({ action: "edit", operation }),
    file: objectId => call({ action: "file", objectId }),
  } });
  return {
    id, host,
    status: () => ({ id, host, mode, includeNotes, includeFiles, link: "http://" + host + ":" + server.port + "/#" + token,
      viewers: [...viewers.values()].filter(seen => Date.now() - seen <= 8000).length }),
    close: () => { active = false; return server.close(); },
  };
}
module.exports = { startCanvasShare };
