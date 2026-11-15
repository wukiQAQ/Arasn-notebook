const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function boot({ desktop, saved, dark = false, blocked = false }) {
  const root = { dataset: {}, style: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/assets/theme-init.js'), 'utf8'), {
    window: { desktop }, document: { documentElement: root },
    localStorage: { getItem() { if (blocked) throw new Error('storage blocked'); return saved; } },
    matchMedia: () => ({ matches: dark }),
  });
  return { theme: root.dataset.theme, scheme: root.style.colorScheme };
}

test('theme is resolved before the application starts, with desktop preference authoritative', () => {
  assert.deepEqual(boot({ desktop: { initialTheme: 'dark' }, saved: 'light' }), { theme: 'dark', scheme: 'dark' });
  assert.deepEqual(boot({ desktop: { initialTheme: 'light' }, saved: 'dark' }), { theme: 'light', scheme: 'light' });
  assert.deepEqual(boot({ desktop: { initialTheme: 'system' }, saved: 'dark', dark: false }), { theme: 'light', scheme: 'light' });
  assert.deepEqual(boot({ saved: 'dark' }), { theme: 'dark', scheme: 'dark' });
  assert.deepEqual(boot({ saved: 'invalid', dark: true }), { theme: 'dark', scheme: 'dark' });
  assert.deepEqual(boot({ blocked: true, dark: true }), { theme: 'dark', scheme: 'dark' });
  assert.deepEqual(boot({ desktop: { initialTheme: 'dark' }, blocked: true }), { theme: 'dark', scheme: 'dark' });
});
