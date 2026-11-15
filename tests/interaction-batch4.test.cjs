const { test } = require('node:test');
const assert = require('node:assert/strict');
const { listNetworks } = require('../desktop/engines/network-interfaces.cjs');
const { StartupSettings } = require('../desktop/engines/startup-settings.cjs');
const { LanNotes } = require('../desktop/engines/lan-notes.cjs');
const { createStore, startServer } = require('../desktop/server.cjs');

test('networks retain names, exclude unavailable/public/IPv6, prefer nonvirtual private addresses without claiming connectivity', () => {
  const row = (address, extra = {}) => ({ address, internal: false, family: 'IPv4', ...extra });
  const rows = listNetworks({ 'vEthernet (WSL)': [row('172.20.0.1')], 'Wi-Fi': [row('192.168.1.4'), row('fe80::1', { family: 'IPv6' })], Ethernet: [row('10.1.1.2')], Loopback: [row('127.0.0.1', { internal: true })], Public: [row('8.8.8.8')], LinkLocal: [row('169.254.1.2')], Empty: undefined });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].name, 'Wi-Fi');
  assert.equal(rows.filter(n => n.recommended).length, 1);
  assert.equal(rows.find(n => n.name.startsWith('vEthernet')).virtual, true);
  assert.equal(listNetworks({ VPN: [row('10.0.0.2')] })[0].recommended, false);
  assert.deepEqual(listNetworks({}), []);
});

function fixture(options = {}) {
  let current = { openAtLogin: false, executableWillLaunchAtLogin: false, launchItems: [] };
  const writes = [];
  const app = { isPackaged: true, getLoginItemSettings: opts => { assert.deepEqual(opts, { path: 'C:\\Apps\\Arasn.exe', args: ['--autostart'] }); return current; },
    setLoginItemSettings: value => { writes.push(value); current = { ...current, openAtLogin: value.openAtLogin, executableWillLaunchAtLogin: value.openAtLogin }; } };
  const startup = new StartupSettings(app, { platform: 'win32', execPath: 'C:\\Apps\\Arasn.exe', env: {}, tempDir: 'C:\\Temp', ...options });
  return { app, writes, startup, external: value => { current = value; } };
}

test('startup rereads system registration and distinguishes Windows-disabled entries', () => {
  const f = fixture();
  assert.equal(f.startup.view().startupStatus, 'disabled');
  const undo = f.startup.apply(true);
  assert.equal(f.startup.view().startupStatus, 'enabled');
  f.external({ openAtLogin: true, executableWillLaunchAtLogin: true, launchItems: [{ path: 'C:\\Apps\\Arasn.exe', args: ['--autostart'], enabled: false, scope: 'user' }] });
  assert.equal(f.startup.view().startupStatus, 'blocked');
  undo();
  assert.equal(f.startup.view().openAtLogin, false);
});

test('startup rejects silent write failure and restores previous registration', () => {
  const f = fixture();
  f.app.setLoginItemSettings = value => f.writes.push(value);
  assert.throws(() => f.startup.apply(true), /核验/);
  assert.deepEqual(f.writes.map(v => v.openAtLogin), [true, false]);
  assert.equal(f.startup.view().openAtLogin, false);
});

test('startup reports read/restore errors and rejects unsupported environments without writes', () => {
  for (const options of [{ env: { PORTABLE_EXECUTABLE_FILE: 'C:\\Arasn.exe' } }, { execPath: 'C:\\Temp\\unpacked\\Arasn.exe' }, { platform: 'linux' }]) {
    const f = fixture(options);
    assert.equal(f.startup.view().autoStartSupported, false);
    assert.throws(() => f.startup.apply(true));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture(); f.app.isPackaged = false;
  assert.equal(f.startup.view().autoStartSupported, false);
  f.app.isPackaged = true; f.app.getLoginItemSettings = () => { throw new Error('read denied'); };
  assert.equal(f.startup.view().startupStatus, 'error');
  assert.throws(() => f.startup.apply(true), /read denied/);
  assert.equal(f.writes.length, 0);
  const g = fixture(); g.app.setLoginItemSettings = () => { throw new Error('write denied'); };
  assert.throws(() => g.startup.apply(true), /恢复.*write denied/);
});

test('startup rollback preserves a previously disabled approval instead of enabling it', () => {
  const f = fixture();
  f.external({ openAtLogin: true, executableWillLaunchAtLogin: false, launchItems: [{ path: 'C:\\Apps\\Arasn.exe', args: ['--autostart'], enabled: false, scope: 'user' }] });
  const undo = f.startup.apply(false); undo();
  assert.equal(f.writes.at(-1).enabled, false);
});

test('LAN stop failure retains active listener and pending transfers; vanished addresses are explicit', async () => {
  let addresses = ['10.0.0.2'];
  const lan = new LanNotes({ directory: '.', addresses: () => addresses });
  const listener = { close: async () => { throw new Error('fixture: close denied'); } };
  lan.listener = listener; lan.host = '10.0.0.2';
  lan.outbox.set('one', { id: 'one', status: 'waiting' });
  // taskView needs only transfer metadata, with no network operation.
  await assert.rejects(lan.stop(), /close denied/);
  assert.equal(lan.listener, listener);
  assert.equal(lan.outbox.get('one').status, 'waiting');
  addresses = [];
  assert.equal(lan.view().addressAvailable, false);
  assert.equal(lan.view().active, true);
  await assert.rejects(lan.start('10.0.0.3'), /可用/);
});

test('HTTP server close propagates callback failures instead of reporting stopped', async () => {
  const listener = await startServer({ store: createStore(), token: 'isolated-close-test' });
  const original = listener.server.close;
  listener.server.close = callback => { callback(new Error('fixture: listener close failed')); };
  try { await assert.rejects(listener.close(), /listener close failed/); }
  finally { listener.server.close = original; await listener.close(); }
});
