const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const https = require("node:https");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { createIdentity, loadPeer, listen, probe } = require("../scripts/xigra-lan-tls.cjs");

function issueDifferentCertificate(root, issuer) {
  const key = path.join(root, "different-key.pem");
  const csr = path.join(root, "different.csr");
  const cert = path.join(root, "different.pem");
  const openssl = process.env.XIGRA_TEST_OPENSSL || "openssl";
  const options = { stdio: "pipe", windowsHide: true };
  execFileSync(openssl, ["req", "-new", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:P-256",
    "-noenc", "-subj", "/CN=Different peer", "-keyout", key, "-out", csr], options);
  execFileSync(openssl, ["x509", "-req", "-in", csr, "-CA", issuer.certFile,
    "-CAkey", path.join(path.dirname(issuer.certFile), "private.pem"),
    "-days", "1", "-set_serial", "1", "-out", cert], options);
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

test("the LAN probe requires both pinned certificates and rejects plaintext", async () => {
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, "xigra-lan-tls-"));
  let server;
  try {
    const receiver = createIdentity(path.join(root, "receiver"));
    const sender = createIdentity(path.join(root, "sender"));
    const impostor = createIdentity(path.join(root, "impostor"));
    assert.notEqual(receiver.fingerprint, sender.fingerprint);
    assert.match(receiver.fingerprint, /^(?:[\dA-F]{2}:){31}[\dA-F]{2}$/);
    assert.throws(() => loadPeer(sender.certFile, impostor.fingerprint), /指纹不匹配/);
    assert.throws(() => loadPeer(sender.certFile, sender.fingerprint.slice(0, 23)), /完整/);

    const trustedSender = loadPeer(sender.certFile, sender.fingerprint);
    const trustedReceiver = loadPeer(receiver.certFile, receiver.fingerprint);
    assert.throws(() => listen(receiver, trustedSender, "0.0.0.0", 0), /私有 IPv4/);
    server = listen(receiver, trustedSender, "127.0.0.1", 0);
    let requests = 0;
    server.on("request", () => { requests++; });
    await once(server, "listening");
    const port = server.address().port;
    const endpoint = { host: "127.0.0.1", port };
    assert.equal(await probe(sender, trustedReceiver, endpoint), "TLSv1.3");
    await assert.rejects(probe(impostor, trustedReceiver, endpoint));
    const wrongReceiver = loadPeer(impostor.certFile, impostor.fingerprint);
    await assert.rejects(probe(sender, wrongReceiver, endpoint), error =>
      ["DEPTH_ZERO_SELF_SIGNED_CERT", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(error.code));
    await assert.rejects(probe({}, trustedReceiver, endpoint));
    await assert.rejects(probe(sender, { ...trustedReceiver, fingerprint: impostor.fingerprint }, endpoint), /核对指纹不匹配/);
    assert.equal(requests, 1, "unauthenticated attempts must never reach HTTP");
    const different = issueDifferentCertificate(root, sender);
    await assert.rejects(probe(different, trustedReceiver, endpoint), /HTTP 403/);

    const status = await new Promise((resolve, reject) => {
      https.get({
        ...endpoint, path: "/api/board", key: sender.key, cert: sender.cert,
        ca: trustedReceiver.cert, checkServerIdentity: () => undefined, agent: false,
      }, response => { response.resume(); resolve(response.statusCode); }).once("error", reject);
    });
    assert.equal(status, 404);

    const cleartextResponse = await new Promise((resolve, reject) => {
      const socket = net.connect(endpoint, () => socket.write("GET /v1/probe HTTP/1.1\r\nHost: localhost\r\n\r\n"));
      let data = "";
      socket.setTimeout(2000, () => socket.destroy(new Error("plaintext socket was not closed")));
      socket.on("data", chunk => { data += chunk; });
      socket.on("error", error => { if (error.code !== "ECONNRESET") reject(error); });
      socket.on("close", () => resolve(data));
    });
    assert.equal(cleartextResponse, "");
  } finally {
    if (server?.listening) {
      server.close();
      await once(server, "close");
    }
    const target = fs.realpathSync(root);
    assert.equal(path.dirname(target), temp);
    assert.match(path.basename(target), /^xigra-lan-tls-/);
    fs.rmSync(target, { recursive: true, force: true });
  }
});
