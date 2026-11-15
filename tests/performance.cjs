const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-bench-"));
  let engine;
  try {
    const start = performance.now();
    engine = new StorageEngine(path.join(root, "data"));
    await engine.call("init");
    const storageStartupMs = performance.now() - start;
    const source = path.join(root, "large.bin");
    const handle = await fs.open(source, "w");
    await handle.truncate(128 * 1024 * 1024);
    await handle.close();
    let maxDelay = 0,
      last = performance.now(),
      ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxDelay = Math.max(maxDelay, now - last - 10);
      last = now;
      ticks++;
    }, 10);
    const at = performance.now();
    const results = await engine.call("import", { paths: [source] });
    clearInterval(timer);
    if (!results[0].ok) throw new Error(results[0].error);
    console.log(
      JSON.stringify(
        {
          storageStartupMs,
          importMiB: 128,
          importMs: performance.now() - at,
          mainEventLoopMaxDelayMs: maxDelay,
          eventLoopTicks: ticks,
          processMemoryMiB: process.memoryUsage().rss / 1024 / 1024,
        },
        null,
        2,
      ),
    );
  } finally {
    await engine?.close();
    if (path.dirname(root) !== os.tmpdir()) throw new Error("Invalid cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
