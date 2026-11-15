// All actual copying and hashing runs in StorageEngine's worker, never the UI thread.
class FileEngine {
  constructor(storage) {
    this.storage = storage;
  }
  import(paths) {
    return this.storage.call("import", { paths });
  }
  list(options) {
    return this.storage.call("list", options);
  }
}
module.exports = { FileEngine };
