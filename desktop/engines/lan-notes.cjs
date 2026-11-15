const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { listNetworks } = require('./network-interfaces.cjs');
const { createHash, randomUUID } = require('node:crypto');

const offerLifetime = 120000;
const fingerprintFormat = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const digestFormat = /^[0-9a-f]{64}$/;
const uuidFormat = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const terminal = new Set(['saved', 'rejected']);
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');

class LanNotes {
  constructor({ directory, storage, store, safeStorage, network, changed = () => {}, onOffer = () => {}, addresses }) {
    this.vault = path.join(directory, 'lan-identity.bin');
    Object.assign(this, { storage, store, safeStorage, network, changed, onOffer });
    this.interfaces = addresses ? () => addresses().map(address => ({ name: '本机网卡', address, virtual: false, recommended: false })) : listNetworks;
    this.addresses = () => this.interfaces().map(entry => entry.address);
    this.peers = new Map();
    this.inbox = new Map();
    this.outbox = new Map();
    this.candidates = [];
    this.localWork = Promise.resolve();
  }

  exclusive(work) {
    const result = this.localWork.then(work);
    this.localWork = result.catch(() => {});
    return result;
  }

  async persist(identity, peers, port) {
    const encrypted = this.safeStorage.encryptString(JSON.stringify({ identity, peers: [...peers.values()], port }));
    const temporary = `${this.vault}.tmp`;
    try {
      await fs.writeFile(temporary, encrypted, { mode: 0o600 });
      await fs.rename(temporary, this.vault);
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  async load() {
    if (this.fingerprint) return;
    if (!this.safeStorage.isEncryptionAvailable() || this.safeStorage.getSelectedStorageBackend?.() === 'basic_text') {
      throw new Error('系统安全存储不可用，无法启用便签发送');
    }
    const bytes = await fs.readFile(this.vault).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (bytes) {
      const saved = JSON.parse(this.safeStorage.decryptString(bytes));
      for (const peer of saved.peers) this.peers.set(peer.fingerprint, peer);
      this.port = saved.port;
      this.identity = saved.identity;
    } else {
      const identity = await this.network.createIdentity();
      await this.persist(identity, this.peers, 0);
      this.identity = identity;
    }
    this.fingerprint = this.network.readCertificate(this.identity.cert).fingerprint;
  }

  start(host) {
    return this.exclusive(async () => {
      if (!this.addresses().includes(host)) throw new Error('请选择可用的私有 IPv4 网卡');
      if (this.listener) throw new Error('请先关闭当前局域网接收');
      await this.load();
      const listen = port => this.network.listen(this.identity, host, port, this.peers,
        (fingerprint, route, value) => this.exclusive(() => this.receive(fingerprint, route, value)));
      const listener = await listen(this.port || 0).catch(error => {
        if (this.port && error.code === 'EADDRINUSE') return listen(0);
        throw error;
      });
      try {
        await this.persist(this.identity, this.peers, listener.port);
        this.discovery = this.network.discover(host, listener.port, this.fingerprint, candidates => {
          if (this.listener !== listener) return;
          this.candidates = candidates;
          this.changed();
        });
      } catch (error) {
        await listener.close();
        throw error;
      }
      this.listener = listener;
      this.host = host;
      this.port = listener.port;
      this.timer = setInterval(() => {
        if (this.prune()) this.changed();
        for (const task of this.outbox.values()) {
          if (task.status === 'waiting') void this.advance(task);
        }
      }, 2500);
      this.timer.unref();
      return this.view();
    });
  }

  stop() {
    return this.exclusive(async () => {
      const listener = this.listener;
      await listener?.close();
      this.listener = null;
      clearInterval(this.timer);
      this.discovery?.();
      this.discovery = null;
      this.candidates = [];
      this.inbox.clear();
      for (const task of this.outbox.values()) {
        task.abort?.abort(new Error('局域网已关闭'));
        if (!terminal.has(task.status)) {
          task.status = 'failed';
          task.error = '局域网已关闭';
        }
      }
      this.changed();
      return this.view();
    });
  }

  view() {
    const interfaces = this.interfaces();
    const offers = [...this.inbox.values()].filter(entry => entry.expires > Date.now());
    const describe = ({ id, key, fingerprint, title, bytes, status }) => ({
      id, key, name: this.peers.get(fingerprint)?.name || '设备已移除', title, bytes, status,
    });
    return {
      addresses: interfaces.map(entry => entry.address), interfaces,
      active: Boolean(this.listener), host: this.listener ? this.host : null,
      addressAvailable: !this.listener || interfaces.some(entry => entry.address === this.host),
      peers: [...this.peers.values()].map(({ fingerprint, name, host, port }) => ({ fingerprint, name, host, port })),
      candidates: this.candidates,
      incoming: offers.filter(entry => entry.status === 'waiting').map(describe),
      received: offers.filter(entry => entry.status !== 'waiting').reverse().map(describe),
      outgoing: [...this.outbox.values()].reverse().map(task => this.taskView(task)),
    };
  }

  async invite() {
    if (!this.listener) throw new Error('请先开启局域网');
    const code = JSON.stringify({ v: 1, name: os.hostname().slice(0, 64), cert: this.identity.cert,
      host: this.host, port: this.port, expires: Date.now() + offerLifetime });
    return { code, fingerprint: this.fingerprint };
  }

  pair(code, expected) {
    return this.exclusive(async () => {
      if (!this.listener) throw new Error('请先开启局域网');
      if (typeof code !== 'string' || code.length > 8192 || typeof expected !== 'string' || expected.length > 120) throw new Error('配对信息无效');
      const fingerprint = expected.trim().toUpperCase();
      if (!fingerprintFormat.test(fingerprint)) throw new Error('请核对并输入完整 SHA-256 指纹');
      let value;
      try { value = JSON.parse(code); } catch { throw new Error('设备配对信息格式有误'); }
      if (value?.v !== 1 || !this.network.privateAddress(value.host) || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535 ||
          typeof value.name !== 'string' || !value.name.length || value.name.length > 64 || !Number.isSafeInteger(value.expires) || value.expires < Date.now()) {
        throw new Error('设备配对信息无效或已过期');
      }
      const peer = this.network.readCertificate(value.cert);
      if (peer.fingerprint !== fingerprint || fingerprint === this.fingerprint) throw new Error('设备证书与核对的对方指纹不一致');
      if (this.peers.size >= 16 && !this.peers.has(fingerprint)) throw new Error('配对设备已达上限');
      const next = new Map(this.peers).set(fingerprint, { ...peer, host: value.host, port: value.port, name: value.name });
      await this.persist(this.identity, next, this.port);
      this.peers.set(fingerprint, next.get(fingerprint));
      this.listener.update();
      return this.view();
    });
  }

  revoke(fingerprint) {
    return this.exclusive(async () => {
      if (!this.peers.has(fingerprint)) return this.view();
      const next = new Map(this.peers);
      next.delete(fingerprint);
      await this.persist(this.identity, next, this.port);
      this.peers.delete(fingerprint);
      this.listener?.update();
      for (const [key, entry] of this.inbox) if (entry.fingerprint === fingerprint) this.inbox.delete(key);
      for (const task of this.outbox.values()) if (task.fingerprint === fingerprint && !terminal.has(task.status)) {
        task.abort?.abort(new Error('设备配对已撤销'));
        task.status = 'failed';
        task.error = '设备配对已撤销';
      }
      return this.view();
    });
  }

  prune() {
    let changed = false;
    for (const [key, entry] of this.inbox) if (entry.expires <= Date.now()) {
      this.inbox.delete(key);
      changed = true;
    }
    return changed;
  }

  async receive(fingerprint, route, value) {
    if (!this.listener || !this.peers.has(fingerprint) || !uuidFormat.test(value?.id || '') || !digestFormat.test(value?.hash || '')) throw new Error('请求无效');
    const key = hash(`${fingerprint}:${value.id}`);
    const receiptKey = `lan-receipt:${key}`;
    const receipt = await this.storage.call('getSetting', { key: receiptKey });
    if (receipt) {
      if (receipt !== value.hash) throw new Error('任务编号重复');
      return { status: 'saved' };
    }
    this.prune();
    const entry = this.inbox.get(key);
    if (entry && entry.hash !== value.hash) throw new Error('任务内容变更');
    if (route === '/v1/offer') {
      if (entry) return { status: entry.status };
      if (!Number.isInteger(value.bytes) || value.bytes < 1 || value.bytes > 30000) throw new Error('便签信息无效');
      const active = [...this.inbox.values()].filter(item => !terminal.has(item.status));
      if (active.length >= 16 || active.some(item => item.fingerprint === fingerprint)) throw new Error('收件箱暂满');
      if (this.inbox.size >= 32) {
        const oldest = [...this.inbox.values()].find(item => terminal.has(item.status));
        this.inbox.delete(oldest.key);
      }
      this.inbox.set(key, { key, id: value.id, fingerprint, title: '文字便签', bytes: value.bytes, hash: value.hash,
        roomId: this.store.snapshot().roomId, status: 'waiting', expires: Date.now() + offerLifetime });
      this.changed();
      this.onOffer();
      return { status: 'waiting' };
    }
    const { text, nonce } = value;
    if (entry?.status !== 'accepted' || typeof text !== 'string' || !text.trim() || text.length > 10000 ||
        !uuidFormat.test(nonce || '') || Buffer.byteLength(text, 'utf8') !== entry.bytes || hash(`${nonce}:${text}`) !== entry.hash) {
      throw new Error('未授权或正文校验失败');
    }
    const id = key.slice(0, 32);
    await this.store.apply({ id, opId: id, expected: 0, value: { type: 'text', text, color: '#26364a', x: 100, y: 100 } },
      { receipt: { key: receiptKey, hash: entry.hash, roomId: entry.roomId } });
    entry.status = 'saved';
    entry.expires = Date.now() + offerLifetime;
    this.changed();
    return { status: 'saved' };
  }

  respond(key, accept) {
    return this.exclusive(() => {
      const entry = this.inbox.get(key);
      if (typeof accept !== 'boolean' || entry?.status !== 'waiting' || entry.expires <= Date.now()) throw new Error('发送请求已过期或已处理');
      entry.status = accept ? 'accepted' : 'rejected';
      return this.view();
    });
  }

  taskView({ id, title, fingerprint, status, error }) {
    return { id, title, name: this.peers.get(fingerprint)?.name || '设备已移除', status, error };
  }

  async send(recordId, fingerprint) {
    if (!this.listener || !this.peers.has(fingerprint)) throw new Error('请开启局域网并配对设备');
    if (typeof recordId !== 'string' || recordId.length > 64) throw new Error('便签编号无效');
    const item = this.store.snapshot().items[recordId]?.value;
    if (item?.type !== 'text' || !item.text.trim()) throw new Error('请先保存要发送的便签');
    if ([...this.outbox.values()].filter(task => task.status === 'waiting' || task.status === 'sending').length >= 4) throw new Error('请先处理正在发送的便签');
    if (this.outbox.size >= 20) {
      const oldest = [...this.outbox.values()].find(task => terminal.has(task.status) || task.status === 'failed');
      this.outbox.delete(oldest.id);
    }
    const text = item.text;
    const nonce = randomUUID();
    const task = { id: randomUUID(), fingerprint, text, title: text.split('\n').find(line => line.trim()).trim().slice(0, 72),
      nonce, bytes: Buffer.byteLength(text, 'utf8'), hash: hash(`${nonce}:${text}`), status: 'sending', expires: Date.now() + offerLifetime };
    this.outbox.set(task.id, task);
    return this.advance(task);
  }

  retry(id) {
    const task = this.outbox.get(id);
    if (!task) throw new Error('找不到发送任务');
    task.expires = Date.now() + offerLifetime;
    return this.advance(task);
  }

  async advance(task) {
    if (task.abort || terminal.has(task.status)) return this.taskView(task);
    const controller = new AbortController();
    task.abort = controller;
    task.error = undefined;
    try {
      const peer = this.peers.get(task.fingerprint);
      if (!this.listener || !peer) throw new Error('局域网已关闭或设备配对已撤销');
      if (task.expires <= Date.now()) throw new Error('等待对方确认超时');
      const candidate = this.candidates.find(entry => entry.fingerprint === peer.fingerprint);
      const { id, bytes, hash: checksum } = task;
      let target = candidate ? { ...peer, ...candidate } : peer;
      const send = (endpoint, payload) => this.network.request(this.identity, target, endpoint, payload, controller.signal);
      const offer = { id, bytes, hash: checksum };
      let { status } = await send('/v1/offer', offer).catch(error => {
        if (!candidate || controller.signal.aborted || (candidate.host === peer.host && candidate.port === peer.port)) throw error;
        target = peer;
        return send('/v1/offer', offer);
      });
      controller.signal.throwIfAborted();
      if (status === 'accepted') {
        task.status = 'sending';
        this.changed();
        ({ status } = await send('/v1/note', { id, hash: checksum, nonce: task.nonce, text: task.text }));
        controller.signal.throwIfAborted();
        if (status !== 'saved') throw new Error('未收到落盘回执');
      }
      if (!['waiting', 'saved', 'rejected'].includes(status)) throw new Error('对端返回未知状态');
      task.status = status;
      if (terminal.has(status)) delete task.text;
    } catch (error) {
      task.status = 'failed';
      task.error = controller.signal.aborted ? controller.signal.reason.message : error.message;
    } finally {
      delete task.abort;
      this.changed();
    }
    return this.taskView(task);
  }
}

module.exports = { LanNotes };
