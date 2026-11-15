const fs = require('node:fs');
const path = require('node:path');
const { createRequire, builtinModules } = require('node:module');
const { rolldown } = createRequire(require.resolve('vite/package.json'))('rolldown');

async function build() {
  const bundle = await rolldown({
    input: 'desktop/engines/lan-network.cjs',
    platform: 'node',
    external: name => name.startsWith('node:') || builtinModules.includes(name),
  });
  try {
    const { output } = await bundle.write({ file: 'dist/lan-network.cjs', format: 'cjs', inlineDynamicImports: true });
    const licenses = new Set();
    for (const chunk of output) {
      if (chunk.type !== 'chunk') continue;
      for (const id of chunk.moduleIds) {
        const parts = id.replaceAll('\\', '/').split('/node_modules/');
        if (parts.length < 2) continue;
        const name = parts.at(-1).split('/');
        const directory = parts.slice(0, -1).join('/node_modules/') + '/node_modules/' + name.slice(0, name[0].startsWith('@') ? 2 : 1).join('/');
        for (const file of fs.readdirSync(directory).filter(file => /^(license|licence|notice|copying)(\.|$)/i.test(file))) {
          licenses.add(path.join(directory, file));
        }
      }
    }
    fs.writeFileSync('dist/lan-network-licenses.txt', [...licenses].map(file => fs.readFileSync(file, 'utf8')).join('\n\n'));
  } finally {
    await bundle.close();
  }
}

build().catch(error => { console.error(error); process.exitCode = 1; });
