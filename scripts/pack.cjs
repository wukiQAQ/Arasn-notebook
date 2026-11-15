// Portable Windows folder: renderer and LAN runtime dependencies are bundled in dist.
const fs = require("node:fs");
const path = require("node:path");
const { Data, NtExecutable, NtExecutableResource, Resource } = require("resedit");
const root = path.resolve(__dirname, "..");
const requestedName = process.argv.find(arg => arg.startsWith("--output-name="))?.split("=")[1];
if (requestedName && (!/^[A-Za-z0-9._-]+$/.test(requestedName) || requestedName === "." || requestedName === "..")) throw new Error("Invalid output folder name");
const output = path.join(root, "release", requestedName || (process.argv.includes("--versioned") ? `ArasnNotebook-${require("../package.json").version}-win32-x64` : "ArasnNotebook-win32-x64"));
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, "node_modules/electron/dist"), output, {
  recursive: true,
});
const original = path.join(output, "electron.exe");
const executable = path.join(output, "ArasnNotebook.exe");
const image = NtExecutable.from(fs.readFileSync(original));
const resources = NtExecutableResource.from(image);
const icon = Data.IconFile.from(fs.readFileSync(path.join(root, "public/arasn-icon.ico")));
for (const group of Resource.IconGroupEntry.fromEntries(resources.entries)) {
  Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icon.icons.map(entry => entry.data));
}
resources.outputResource(image);
fs.writeFileSync(original, Buffer.from(image.generate()));
if (fs.existsSync(executable)) fs.unlinkSync(executable);
fs.renameSync(original, executable);
const appDir = path.join(output, "resources", "app");
fs.mkdirSync(appDir, { recursive: true });
for (const directory of ["dist", "desktop"])
  fs.cpSync(path.join(root, directory), path.join(appDir, directory), {
    recursive: true,
  });
require("./stage-windows-shortcut.cjs")(appDir);
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
