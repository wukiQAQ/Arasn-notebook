const { Worker } = require("node:worker_threads");
const path = require("node:path");
class StorageEngine {
  constructor(root, onProgress = () => {}) {
    this.pending = new Map();
    this.id = 0;
    this.worker = new Worker(path.join(__dirname, "storage-worker.cjs"), {
      workerData: { root },
    });
    this.worker.on("message", (m) => {
      if (m.progress) return onProgress(m.progress);
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      m.error
        ? p.reject(Object.assign(new Error(m.error), { status: m.status }))
        : p.resolve(m.result);
    });
    const fail = (e) => {
      for (const p of this.pending.values()) p.reject(e);
      this.pending.clear();
      this.failed = e;
    };
    this.worker.on("error", fail);
    this.worker.on("exit", (code) =>
      fail(new Error("存储进程已退出：" + code)),
    );
  }
  call(method, args = {}) {
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, method, args });
    });
  }
  close() {
    return this.worker.terminate();
  }
}
module.exports = { StorageEngine };
