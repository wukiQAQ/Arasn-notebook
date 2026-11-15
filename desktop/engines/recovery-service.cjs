class RecoveryService {
  constructor(storage) {
    this.storage = storage;
  }
  audit() {
    return this.storage.call("audit");
  }
  backup(target) {
    return this.storage.call("backup", { target });
  }
  restore(source) {
    return this.storage.call("restoreBackup", { source });
  }
  empty() {
    return this.storage.call("purge");
  }
}
module.exports = { RecoveryService };
