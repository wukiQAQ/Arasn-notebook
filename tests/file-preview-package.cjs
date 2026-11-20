const { chromium } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { writePsdBuffer } = require("ag-psd");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");

(async () => {
  const workspace = path.resolve(__dirname, "..");
  const executable = path.resolve(process.env.ARASN_PREVIEW_EXE || "Arasn-0.6.0-Portable.exe");
  const temporary = await fs.mkdtemp(path.join(workspace, ".runtime", "preview-package-"));
  const data = path.join(temporary, "data");
  const temp = path.join(temporary, "temp");
  let child, browser;
  try {
    await fs.mkdir(temp);
    const fixture = path.join(temporary, "Composite.psd");
    const pixels = new Uint8ClampedArray(40 * 20 * 4).fill(255);
    await fs.writeFile(fixture, writePsdBuffer({ width: 40, height: 20, imageData: { width: 40, height: 20, data: pixels } }));
    const engine = new StorageEngine(data);
    let id, videoId;
    try {
      await engine.call("init");
      const clip = path.join(__dirname, "fixtures", "file-preview.mp4");
      const [item, video] = await engine.call("import", { paths: [fixture, clip] });
      assert(item.ok, item.error);
      assert(video.ok, video.error);
      id = item.file.id;
      videoId = video.file.id;
    } finally {
      await engine.close();
    }
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
    const expires = Date.now() + 120_000;
    for (;;) {
      if (launchError) throw launchError;
      if (child.exitCode !== null) throw new Error("Packaged launch exited early: " + child.exitCode);
      const ready = await fetch(origin + "/json/version", { signal: AbortSignal.timeout(1000) })
        .then(response => response.ok).catch(() => false);
      if (ready) break;
      if (Date.now() > expires) throw new Error("Packaged Electron did not start");
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    browser = await chromium.connectOverCDP(origin);
    const context = browser.contexts()[0];
    const page = context.pages()[0] ?? await context.waitForEvent("page");
    await page.waitForFunction(() => Boolean(window.desktop?.files?.preview));
    const preview = await page.evaluate(id => window.desktop.files.preview(id), id);
    assert.equal(preview.kind, "image");
    assert.equal(preview.width, 40);
    assert(preview.image.startsWith("data:image/"));

    const poster = await page.evaluate(id => window.desktop.files.preview(id), videoId);
    assert.equal(poster.kind, "video");
    assert(poster.image.startsWith("data:image/jpeg"));
    assert(poster.duration > 0.75 && poster.duration < 2);
    const detail = await page.evaluate(id => window.desktop.files.preview(id, "detail"), videoId);
    assert.equal(await page.evaluate(async url => (await fetch(url, { headers: { Range: "bytes=0-31" } })).status, detail.url), 206);
    console.log("PASS packaged Electron PSD, MP4 poster, duration and streaming: " + executable);
  } finally {
    if (browser) {
      const cdp = await browser.newBrowserCDPSession().catch(() => null);
      await cdp?.send("Browser.close").catch(() => {});
      await browser.close().catch(() => {});
    }
    if (child?.pid && child.exitCode === null)
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    const resolved = await fs.realpath(temporary);
    assert.equal(path.dirname(resolved), await fs.realpath(path.join(workspace, ".runtime")));
    await fs.rm(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
