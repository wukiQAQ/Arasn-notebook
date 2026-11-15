const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { PanelEngine } = require('../desktop/engines/panel-engine.cjs');
const { LanNotes } = require('../desktop/engines/lan-notes.cjs');
const network = require('../desktop/engines/lan-network.cjs');

test('paired notes require acceptance, retry the same transfer, and acknowledge durable writes once', async t => {
  const root = await mkdtemp(join(tmpdir(), 'arasn-lan-'));
  const devices = new Set();
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: text => Buffer.from(text),
    decryptString: data => data.toString(),
  };
  t.after(async () => {
    for (const { lan, storage } of devices) {
      await lan.stop();
      await storage.close();
    }
    await rm(root, { recursive: true, force: true });
  });

  async function device(name, address) {
    const directory = join(root, name);
    const storage = new StorageEngine(directory);
    const store = await new PanelEngine(storage, () => {}).init();
    const lan = new LanNotes({ directory, storage, store, safeStorage, network, addresses: () => [address] });
    const device = { lan, store, storage };
    devices.add(device);
    await lan.start(address);
    return device;
  }

  const a = await device('Sender', '127.0.0.1');
  let b = await device('Receiver', '127.0.0.2');
  const aInvite = await a.lan.invite();
  const bInvite = await b.lan.invite();
  await assert.rejects(a.lan.pair(bInvite.code, aInvite.fingerprint), /指纹/);
  await a.lan.pair(bInvite.code, bInvite.fingerprint);
  const record = randomUUID();
  await a.store.apply({ id: record, opId: randomUUID(), expected: 0, value: { type: 'text', text: '一条便签\n完整正文', x: 100, y: 100, color: '#26364a' } });

  const first = await a.lan.send(record, bInvite.fingerprint);
  assert.equal(first.status, 'failed');
  assert.deepEqual(b.lan.view().incoming, []);
  await b.lan.pair(aInvite.code, aInvite.fingerprint);
  assert.equal((await a.lan.retry(first.id)).status, 'waiting');
  const [offer] = b.lan.view().incoming;
  assert.equal(offer.id, first.id);
  assert.equal(offer.title, '文字便签');
  assert.equal(Object.values(b.store.snapshot().items).length, 0);
  assert.equal(offer.text, undefined);
  const { id, hash, nonce, text } = a.lan.outbox.get(first.id);
  await assert.rejects(network.request(a.lan.identity, a.lan.peers.get(bInvite.fingerprint), '/v1/note', {
    id, hash, nonce, text,
  }, new AbortController().signal), /HTTP 422/);
  await b.lan.respond(offer.key, false);
  assert.equal((await a.lan.retry(first.id)).status, 'rejected');

  const second = await a.lan.send(record, bInvite.fingerprint);
  await b.lan.respond(b.lan.view().incoming[0].key, true);
  const sendRequest = a.lan.network.request;
  a.lan.network = { ...network, async request(...args) {
    const result = await sendRequest(...args);
    if (args[2] === '/v1/note') throw new Error('测试：丢失落盘回执');
    return result;
  } };
  assert.equal((await a.lan.retry(second.id)).status, 'failed');
  a.lan.network = network;
  await b.lan.stop();
  await b.storage.close();
  devices.delete(b);
  b = await device('Receiver', '127.0.0.2');
  assert.equal((await b.lan.invite()).fingerprint, bInvite.fingerprint);
  assert.equal((await a.lan.retry(second.id)).status, 'saved');
  const rows = Object.values((await b.storage.call('init')).state.items);
  assert.deepEqual(rows.map(row => row.value.text), ['一条便签\n完整正文']);

  await b.lan.revoke(aInvite.fingerprint);
  assert.equal((await a.lan.send(record, bInvite.fingerprint)).status, 'failed');
  assert.deepEqual(b.lan.view().incoming, []);
});
