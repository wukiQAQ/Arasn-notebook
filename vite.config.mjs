import { cpSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vite";

const require = createRequire(import.meta.url);
const pdf = dirname(require.resolve("pdfjs-dist/package.json"));

export default defineConfig({
  build: {
    rolldownOptions: { input: ["index.html", "file-preview-worker.html"] },
  },
  plugins: [{
    name: "package-preview-assets",
    closeBundle() {
      for (const directory of ["cmaps", "standard_fonts"])
        cpSync(join(pdf, directory), join("dist/preview-pdf", directory), { recursive: true });
      for (const name of ["pdfjs-dist", "ag-psd", "fflate", "utif", "pako", "xlsx"]) {
        const folder = dirname(require.resolve(name === "xlsx" ? name : name + "/package.json"));
        cpSync(join(folder, "LICENSE"), join("dist/preview-pdf", name + "-LICENSE"));
      }
    },
  }],
});
