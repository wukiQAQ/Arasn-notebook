import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultAppearanceSettings, installedFonts, readAppearance, resolveAppearance, type AppearanceSettings, type ThemeTone } from './appearance';

const storageKey = 'arasn-appearance';
const systemQuery = '(prefers-color-scheme: dark)';
const safeFont = '"Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", Arial, sans-serif';

function initialSettings(): AppearanceSettings {
  if (window.desktop) return {
    theme: window.desktop.initialTheme ?? 'system',
    appearance: readAppearance(window.desktop.initialAppearance),
  };
  try {
    const theme = localStorage.getItem('arasn-theme');
    return { theme: theme === 'light' || theme === 'dark' ? theme : 'system',
      appearance: readAppearance(JSON.parse(localStorage.getItem(storageKey) ?? 'null')) };
  } catch { return defaultAppearanceSettings; }
}

export function useAppearance() {
  const [settings, setSettings] = useState(initialSettings);
  const [systemDark, setSystemDark] = useState(() => matchMedia(systemQuery).matches);
  const [availableFonts, setAvailableFonts] = useState<string[] | null>(null);
  const [status, setStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const pending = useRef<AppearanceSettings | null>(null);
  const writing = useRef(false);
  const styledTokens = useRef<string[]>([]);
  const systemTone: ThemeTone = systemDark ? 'dark' : 'light';
  const tone = settings.theme === 'system' ? systemTone : settings.theme;
  const font = settings.appearance.font;
  const fontAvailable = font === 'system' || availableFonts?.includes(font);

  useEffect(() => {
    const media = matchMedia(systemQuery);
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let mounted = true;
    void installedFonts().then(value => { if (mounted) setAvailableFonts(value); });
    return () => { mounted = false; };
  }, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const { tokens, colorCustom } = resolveAppearance(settings.appearance, tone);
    if (font !== 'system' && fontAvailable) tokens['--ui-font'] = `"${font}", ${safeFont}`;
    root.dataset.theme = tone;
    root.dataset.uiScale = settings.appearance.scale;
    root.toggleAttribute('data-appearance-custom', colorCustom);
    root.style.colorScheme = tone;
    root.style.backgroundColor = '';
    styledTokens.current.forEach(key => { if (!(key in tokens)) root.style.removeProperty(key); });
    Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
    styledTokens.current = Object.keys(tokens);
    const focus = getComputedStyle(root).getPropertyValue('--xigra-focus').trim();
    void window.desktop?.triggers.palette(focus).catch(() => {});
  }, [settings.appearance, tone, font, fontAvailable]);

  async function save(next: AppearanceSettings) {
    setSettings(next);
    pending.current = next;
    if (writing.current) return;
    writing.current = true;
    setStatus('saving');
    while (pending.current) {
      const value = pending.current;
      pending.current = null;
      try {
        if (window.desktop) await window.desktop.settings(value);
        else {
          localStorage.setItem('arasn-theme', value.theme);
          localStorage.setItem(storageKey, JSON.stringify(value.appearance));
        }
        if (!pending.current) setStatus('saved');
      } catch {
        if (!pending.current) setStatus('error');
      }
    }
    writing.current = false;
  }

  return { settings, tone, systemTone, availableFonts, status, save };
}
