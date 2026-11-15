const { randomBytes, webcrypto, X509Certificate } = require('node:crypto');
const https = require('node:https');
const { isIPv4 } = require('node:net');
require('reflect-metadata');
const x509 = require('@peculiar/x509');
const Bonjour = require('bonjour-service');

const minVersion = 'TLSv1.3';
const maxBody = 64 * 1024;

function privateAddress(address) {
  if (typeof address !== 'string' || !isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

async function createIdentity() {
  const algorithm = { name: 'ECDSA', namedCurve: 'P-256', hash: 'SHA-256' };
  const keys = await webcrypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
  const certificate = await x509.X509CertificateGenerator.createSelfSigned({
    name: 'CN=Arasn LAN', serialNumber: `01${randomBytes(15).toString('hex')}`,
    notBefore: new Date(Date.now() - 86400000), notAfter: new Date(Date.now() + 5 * 365 * 86400000),
    keys, signingAlgorithm: algorithm,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.digitalSignature, true),
      new x509.ExtendedKeyUsageExtension(['1.3.6.1.5.5.7.3.1', '1.3.6.1.5.5.7.3.2']),
    ],
  }, webcrypto);
  const cert = certificate.toString('pem');
  const key = Buffer.from(await webcrypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64');
  return { cert, key: `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----` };
}

function readCertificate(pem) {
  if (typeof pem !== 'string' || pem.length > 4096) throw new Error('证书格式无效');
  const cert = new X509Certificate(pem);
  if (!cert.ca || !cert.verify(cert.publicKey) || Date.now() < Date.parse(cert.validFrom) || Date.now() >= Date.parse(cert.validTo)) {
    throw new Error('设备证书无效或已过期');
  }
  return { cert: cert.toString(), fingerprint: cert.fingerprint256 };
}

async function readJson(stream) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > maxBody) throw new Error('传输数据超出限制');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function listen(identity, host, port, peers, onRequest) {
  const tls = () => ({ ...identity, ca: [...peers.values()].map(peer => peer.cert), minVersion });
  const sockets = new Set();
  const server = https.createServer({ ...tls(), requestCert: true, rejectUnauthorized: true, handshakeTimeout: 5000, maxHeaderSize: 4096 },
    async (incoming, response) => {
      const fingerprint = incoming.socket.getPeerX509Certificate()?.fingerprint256;
      const send = (status, value) => response.writeHead(status, { 'Content-Type': 'application/json', Connection: 'close' }).end(JSON.stringify(value));
      if (!incoming.socket.authorized || !peers.has(fingerprint)) return send(403, {});
      if (incoming.method !== 'POST' || !['/v1/offer', '/v1/note'].includes(incoming.url)) return send(404, {});
      if (!/^\d+$/.test(incoming.headers['content-length'] || '') || Number(incoming.headers['content-length']) > maxBody) return send(413, {});
      try {
        const data = await readJson(incoming);
        if (!peers.has(fingerprint)) return send(403, {});
        send(200, await onRequest(fingerprint, incoming.url, data));
      } catch {
        if (!response.destroyed) send(422, {});
      }
    });
  server.maxConnections = 16;
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.on('connection', socket => {
    sockets.add(socket);
    const deadline = setTimeout(() => socket.destroy(), 10000);
    socket.once('close', () => { clearTimeout(deadline); sockets.delete(socket); });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(); });
  });
  return {
    port: server.address().port,
    update: () => server.setSecureContext(tls()),
    close: () => new Promise(resolve => {
      server.close(resolve);
      for (const socket of sockets) socket.destroy();
    }),
  };
}

function request(identity, peer, route, value, signal) {
  const body = JSON.stringify(value);
  return new Promise((resolve, reject) => {
    const client = https.request({
      ...identity, ca: peer.cert, minVersion, rejectUnauthorized: true, agent: false,
      host: peer.host, port: peer.port, path: route, method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      checkServerIdentity: (_host, certificate) => certificate.fingerprint256 === peer.fingerprint
        ? undefined : new Error('对端证书与配对指纹不一致'),
    }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`对端未接受请求（HTTP ${response.statusCode}）`));
      } else readJson(response).then(resolve, reject);
    });
    client.on('error', reject);
    client.end(body);
  });
}

function discover(host, port, fingerprint, onChange) {
  if (host.startsWith('127.')) return () => {};
  const candidates = new Map();
  const bonjour = new Bonjour({ interface: host, bind: '0.0.0.0', reuseAddr: true }, () => {});
  const type = 'arasn-note';
  const published = bonjour.publish({ name: `Arasn ${fingerprint.replaceAll(':', '').slice(0, 12)}`, type, port, txt: { host, fingerprint } });
  published.on('error', () => {});
  const browser = bonjour.find({ type }, service => {
    const candidate = service.txt;
    if (!privateAddress(candidate?.host) || candidate.host.startsWith('127.') ||
        candidate.fingerprint === fingerprint || !/^(?:[\dA-F]{2}:){31}[\dA-F]{2}$/.test(candidate.fingerprint) ||
        !Number.isInteger(service.port) || service.port < 1 || service.port > 65535 || candidates.size >= 64) return;
    candidates.set(service.fqdn, { host: candidate.host, port: service.port, fingerprint: candidate.fingerprint });
    onChange([...candidates.values()]);
  });
  browser.on('down', service => {
    candidates.delete(service.fqdn);
    onChange([...candidates.values()]);
  });
  return () => {
    browser.stop();
    published.stop(() => bonjour.destroy());
  };
}

module.exports = { createIdentity, readCertificate, privateAddress, listen, request, discover };
