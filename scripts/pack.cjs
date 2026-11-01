// Portable Windows folder: UI is bundled by Vite, main process uses only Node built-ins.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "release", "ArasnNotebook-win32-x64");
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, "node_modules/electron/dist"), output, {
  recursive: true,
});
const original = path.join(output, "electron.exe");
const executable = path.join(output, "ArasnNotebook.exe");
if (fs.existsSync(executable)) fs.unlinkSync(executable);
fs.renameSync(original, executable);
const appDir = path.join(output, "resources", "app");
fs.mkdirSync(appDir, { recursive: true });
for (const directory of ["dist", "desktop"])
  fs.cpSync(path.join(root, directory), path.join(appDir, directory), {
    recursive: true,
  });
fs.writeFileSync(
  path.join(appDir, "package.json"),
  JSON.stringify(
    {
      name: "arasn-notebook",
      version: require("../package.json").version,
      main: "desktop/main.cjs",
    },
    null,
    2,
  ),
);
console.log(`Portable app: ${executable}`);
