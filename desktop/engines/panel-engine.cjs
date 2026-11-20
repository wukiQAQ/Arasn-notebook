class PanelEngine {
  constructor(storage, notify) {
    this.storage = storage;
    this.notify = notify;
  }
  async init() {
    this.state = (await this.storage.call("init")).state;
    return this;
  }
  snapshot() {
    return {
      roomId: this.state.roomId,
      revision: this.state.revision,
      items: this.state.items,
    };
  }
  async apply(operation, { receipt, legacyOnly } = {}) {
    this.state = await this.storage.call("board", { operation, receipt, legacyOnly });
    this.notify();
    return this.snapshot();
  }
  async clear() {
    this.state = await this.storage.call("clearPanel");
    this.notify();
    return this.snapshot();
  }
  async migrateCanvas(options) {
    const result = await this.storage.call("canvasMigration", options);
    if (options.dryRun === false) {
      await this.init();
      this.notify();
    }
    return result;
  }
  async sharedCanvas(args) {
    const result = await this.storage.call("sharedCanvas", args);
    if (result.state && result.state.revision >= this.state.revision) {
      this.state = result.state;
      this.notify();
    }
    return result.view ?? result;
  }
  async catalog(action, args = {}) {
    const result = await this.storage.call("canvasCatalog", { ...args, action });
    if (result.state && result.state.revision >= this.state.revision) {
      this.state = result.state;
      this.notify();
    }
    return result.catalog;
  }
  async createCanvasRecord(options) {
    this.state = await this.storage.call("canvasCreate", options);
    this.notify();
    return this.snapshot();
  }
}
module.exports = { PanelEngine };
