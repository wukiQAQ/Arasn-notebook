const fs = require("node:fs");
const path = require("node:path");

module.exports = (appDir) => {
  for (const name of ["koffi", "@koromix/koffi-win32-x64"]) {
    const source = path.join(__dirname, "../node_modules", name);
    const target = path.join(appDir, "node_modules", name);
    fs.cpSync(source, target, { recursive: true });
  }
};
