const { execFileSync } = require("node:child_process");
const { X509Certificate } = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const { isIPv4 } = require("node:net");
const path = require("node:path");

const TLS_VERSION = "TLSv1.3";
const PROBE_PATH = "/v1/probe";

function readIdentity(directory) {
  const certFile = path.join(directory, "public.pem");
  const cert = new X509Certificate(fs.readFileSync(certFile));
  return {
    certFile,
    cert: cert.toString(),
    fingerprint: cert.fingerprint256,
    key: fs.readFileSync(path.join(directory, "private.pem")),
  };
}

function createIdentity(directory) {
  fs.mkdirSync(directory);
  execFileSync(process.env.XIGRA_TEST_OPENSSL || "openssl", [
    "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
    "-days", "2", "-sha256", "-noenc", "-subj", "/CN=XIGRA TLS Probe",
    // Electron requires a signing-capable anchor for this self-signed certificate.
    "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
    "-addext", "keyUsage=critical,digitalSignature,keyCertSign",
    "-addext", "extendedKeyUsage=serverAuth,clientAuth",
    "-keyout", path.join(directory, "private.pem"), "-out", path.join(directory, "public.pem"),
  ], { stdio: "pipe", windowsHide: true });
  return readIdentity(directory);
}

function loadPeer(certFile, expectedFingerprint) {
  if (!/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/i.test(expectedFingerprint)) {
    throw new Error("请通过带外渠道核对并输入完整 SHA-256 指纹");
  }
  const cert = new X509Certificate(fs.readFileSync(certFile));
  if (cert.fingerprint256 !== expectedFingerprint.toUpperCase()) throw new Error("对端证书指纹不匹配");
  return { cert: cert.toString(), fingerprint: cert.fingerprint256 };
}

function checkAddress(address) {
  if (isIPv4(address)) {
    const [first, second] = address.split(".").map(Number);
    if (first === 127 || first === 10 || (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)) return;
  }
  throw new Error("测试仅允许指定环回或私有 IPv4 地址");
}

function checkPort(port, minimum) {
  if (!Number.isInteger(port) || port < minimum || port > 65535) throw new Error("测试端口无效");
}

function listen(identity, peer, address, port) {
  checkAddress(address);
  checkPort(port, 0);
  const server = https.createServer({
    key: identity.key, cert: identity.cert, ca: peer.cert,
    requestCert: true, rejectUnauthorized: true, minVersion: TLS_VERSION,
    handshakeTimeout: 5000, maxHeaderSize: 4096,
  }, (request, response) => {
    const authorized = request.socket.authorized &&
      request.socket.getPeerX509Certificate()?.fingerprint256 === peer.fingerprint;
    const isProbe = request.method === "GET" && request.url === PROBE_PATH;
    response.writeHead(!authorized ? 403 : isProbe ? 204 : 404, { Connection: "close" }).end();
  });
  server.setTimeout(5000, socket => socket.destroy());
  return server.listen(port, address);
}

function probe(identity, peer, { host, port }) {
  checkAddress(host);
  checkPort(port, 1);
  return new Promise((resolve, reject) => {
    const request = https.get({
      host, port, path: PROBE_PATH, agent: false, signal: AbortSignal.timeout(5000),
      key: identity.key, cert: identity.cert, ca: peer.cert,
      rejectUnauthorized: true, minVersion: TLS_VERSION,
      checkServerIdentity: (_address, certificate) => {
        if (certificate.fingerprint256 !== peer.fingerprint) return new Error("连接证书与核对指纹不匹配");
      },
    }, response => {
      const protocol = response.socket.getProtocol();
      response.resume();
      if (response.statusCode === 204) resolve(protocol);
      else reject(new Error(`探针拒绝访问（HTTP ${response.statusCode}）`));
    });
    request.on("error", reject);
  });
}

async function run([mode, directory, peerFile, fingerprint, address, port, ...extra]) {
  if (mode === "identity" && directory && !peerFile) {
    const identity = createIdentity(directory);
    console.log(`公开证书 ${identity.certFile}\nSHA-256 ${identity.fingerprint}`);
    return;
  }
  if ((mode === "listen" || mode === "probe") && directory && peerFile && fingerprint && address && /^\d+$/.test(port) && !extra.length) {
    const identity = readIdentity(directory);
    const peer = loadPeer(peerFile, fingerprint);
    if (mode === "probe") {
      const protocol = await probe(identity, peer, { host: address, port: Number(port) });
      console.log(`双向证书校验通过（${protocol}，HTTP 204）`);
    } else {
      const server = listen(identity, peer, address, Number(port));
      server.once("error", fail);
      server.once("listening", () => console.log(`探针监听 ${address}:${server.address().port}。Ctrl+C 停止。`));
    }
    return;
  }
  throw new Error("用法：identity <新目录> | listen/probe <身份目录> <对端公开证书> <完整指纹> <IPv4> <端口>");
}

function fail(error) {
  console.error(error.message);
  process.exitCode = 1;
}

if (require.main === module) run(process.argv.slice(2)).catch(fail);
module.exports = { createIdentity, loadPeer, listen, probe };
