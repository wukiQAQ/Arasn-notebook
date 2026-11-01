const { createStore, startServer } = require("../desktop/server.cjs");
const path = require("node:path");
startServer({
  store: createStore(),
  token: "ui-test-token",
  host: "127.0.0.1",
  port: 47839,
  staticDir: path.resolve(__dirname, "../dist"),
}).then(() => console.log("UI test server ready"));
