const { chromium, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { createStore } = require("../desktop/server.cjs");

(async () => {
  const executable = path.resolve(process.argv[2] || "Arasn-0.6.0-Portable.exe");
  const runtime = path.resolve(".runtime");
  const directory = await fs.mkdtemp(path.join(runtime, "canvas-package-"));
  const data = path.join(directory, "data");
  const temp = path.join(directory, "temp");
  let child, browser;
  try {
    await fs.mkdir(temp);
    const store = createStore(path.join(data, "board.json"));
    store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: {
      type: "text", text: "旧版笔记", color: "#263449", x: 680, y: 410,
      topology: { x: 30, y: -20, width: 270, height: 136, kind: "note", status: "open" },
    } });
    const probe = net.createServer();
    await new Promise(resolve => probe.listen(0, "127.0.0.1", resolve));
    const { port } = probe.address();
    await new Promise(resolve => probe.close(resolve));
    const origin = "http://127.0.0.1:" + port;
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1", TEMP: temp, TMP: temp };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, ["--remote-debugging-port=" + port], { env, windowsHide: true, stdio: "ignore" });
    let launchError;
    child.on("error", error => { launchError = error; });
    await expect.poll(async () => {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error("Executable exited with code " + child.exitCode);
      return fetch(origin + "/json/version", { signal: AbortSignal.timeout(1000) }).then(response => response.ok).catch(() => false);
    }, { timeout: 120000 }).toBe(true);
    browser = await chromium.connectOverCDP(origin);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.waitForEvent("page");
    await page.getByRole("button", { name: "我的随手页", exact: true }).click();
    await page.getByRole("button", { name: "打开 默认工作页", exact: true }).click();
    await expect(page.locator(".canvas-note-title")).toHaveText("旧版笔记");
    await page.getByRole("button", { name: "打开关系画布", exact: true }).click();
    await expect(page.getByRole("button", { name: "打开 默认关系图", exact: true }).locator("img")).toBeVisible();
    const catalog = await page.evaluate(() => window.desktop.canvas.catalog("list"));
    assert.equal(catalog.boards.length, 2);
    assert.equal(catalog.version, 1);
    console.log("Packaged Electron migrated legacy notes and relation nodes: " + executable);
  } finally {
    if (browser) {
      const cdp = await browser.newBrowserCDPSession().catch(() => null);
      await cdp?.send("Browser.close").catch(() => {});
      await browser.close().catch(() => {});
    }
    if (child?.pid && child.exitCode === null)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), await fs.realpath(runtime));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
