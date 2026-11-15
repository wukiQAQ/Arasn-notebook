const os = require('node:os');
const { isIPv4 } = require('node:net');

function privateAddress(address) {
  if (typeof address !== 'string' || !isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function listNetworks(interfaces = os.networkInterfaces()) {
  const rows = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal || !privateAddress(entry.address) || rows.some(row => row.address === entry.address)) continue;
      // Names are hints, not proof of hardware type, routing or reachability.
      const virtual = /virtual|vethernet|vmware|vbox|hyper-v|wsl|docker|vpn|tunnel|tailscale|zerotier|虚拟/i.test(name);
      rows.push({ name, address: entry.address, virtual, recommended: false });
    }
  }
  rows.sort((a, b) => Number(a.virtual) - Number(b.virtual));
  const preferred = rows.find(row => !row.virtual);
  if (preferred) preferred.recommended = true;
  return rows;
}

module.exports = { listNetworks };
