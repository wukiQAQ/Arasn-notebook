// Runs before styles and React; desktop settings remain authoritative on every load.
(() => {
  let preference = window.desktop?.initialTheme;
  if (!['light', 'dark', 'system'].includes(preference)) {
    try { preference = localStorage.getItem('arasn-theme'); } catch { /* Storage may be unavailable in a shared browser. */ }
  }
  const theme = preference === 'light' || preference === 'dark' ? preference
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  root.style.backgroundColor = theme === 'dark' ? '#1b1e24' : '#f3f4f6';
})();
