import options from '../desktop/appearance-options.json';

export type DisplayMode = 'light' | 'dark' | 'system';
export type ThemeTone = Exclude<DisplayMode, 'system'>;
export type Preset = 'arasn' | 'graphite' | 'ocean' | 'minimal';
export type FontScale = 'compact' | 'standard' | 'comfortable';
export type Appearance = {
  preset: Preset;
  accent: string | null;
  background: string | null;
  foreground: string | null;
  font: string;
  scale: FontScale;
};
export type AppearanceSettings = { theme: DisplayMode; appearance: Appearance };
export const defaultAppearance: Appearance = {
  preset: 'arasn', accent: null, background: null, foreground: null, font: 'system', scale: 'standard',
};
export const defaultAppearanceSettings: AppearanceSettings = { theme: 'system', appearance: defaultAppearance };
export const fonts = options.fonts.filter(font => font !== 'system');
export const normalizeHex = (value: string) => {
  const digits = value.trim().replace(/^#/, '');
  return /^[\da-f]{6}$/i.test(digits) ? `#${digits.toUpperCase()}` : null;
};
export function readAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return defaultAppearance;
  const input = value as Partial<Appearance>;
  const color = (entry: unknown) => typeof entry === 'string' ? normalizeHex(entry) : null;
  return {
    preset: input.preset && options.presets.includes(input.preset) ? input.preset : defaultAppearance.preset,
    font: input.font && options.fonts.includes(input.font) ? input.font : defaultAppearance.font,
    scale: input.scale && options.scales.includes(input.scale) ? input.scale : defaultAppearance.scale,
    accent: color(input.accent), background: color(input.background), foreground: color(input.foreground),
  };
}

type Palette = { background: string; secondary: string; panel: string; foreground: string; muted: string; accent: string; border: string };
export const presets: Record<Preset, { label: string } & Record<ThemeTone, Palette>> = {
  arasn: { label: 'Arasn 默认',
    light: { background: '#F3F4F6', secondary: '#EDEFF2', panel: '#FFFFFF', foreground: '#262932', muted: '#59616E', accent: '#5D4BD2', border: '#DFE2E8' },
    dark: { background: '#1B1E24', secondary: '#171A20', panel: '#282C34', foreground: '#EEF0F4', muted: '#C0C5CF', accent: '#6954D8', border: '#343943' } },
  graphite: { label: '石墨',
    light: { background: '#ECEDEC', secondary: '#E3E5E3', panel: '#F8F9F8', foreground: '#242825', muted: '#525B55', accent: '#4D6255', border: '#CDD1CE' },
    dark: { background: '#202221', secondary: '#181A19', panel: '#2D302E', foreground: '#ECEFED', muted: '#BEC7C0', accent: '#9CBDAB', border: '#3A403C' } },
  ocean: { label: '深海',
    light: { background: '#EBF2F6', secondary: '#E0EBF2', panel: '#F8FCFF', foreground: '#163042', muted: '#425B6E', accent: '#216587', border: '#C9DAE5' },
    dark: { background: '#102330', secondary: '#0C1B27', panel: '#1A3343', foreground: '#E7F3FB', muted: '#BAD1DF', accent: '#61B9E3', border: '#345367' } },
  minimal: { label: '极简浅色',
    light: { background: '#FAF9F6', secondary: '#F1EFEA', panel: '#FFFFFF', foreground: '#292722', muted: '#605B51', accent: '#73563A', border: '#E3DED5' },
    dark: { background: '#25231F', secondary: '#1C1B18', panel: '#332F28', foreground: '#F4EEE4', muted: '#D2C7B7', accent: '#D7B380', border: '#494238' } },
};

function channels(color: string) {
  return [1, 3, 5].map(index => Number.parseInt(color.slice(index, index + 2), 16));
}
function mix(from: string, to: string, amount: number) {
  const target = channels(to);
  return '#' + channels(from).map((value, index) =>
    Math.round(value + (target[index] - value) * amount).toString(16).padStart(2, '0')).join('').toUpperCase();
}
function luminance(color: string) {
  const [r, g, b] = channels(color).map(channel => {
    const value = channel / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * r + .7152 * g + .0722 * b;
}
export function contrast(first: string, second: string) {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
function contrastingInk(surfaces: string[]) {
  const score = (color: string) => Math.min(...surfaces.map(surface => contrast(color, surface)));
  return score('#000000') >= score('#FFFFFF') ? '#000000' : '#FFFFFF';
}
function readable(color: string, surfaces: string[], ratio: number) {
  const passes = (value: string) => surfaces.every(surface => contrast(value, surface) >= ratio);
  if (passes(color)) return color;
  const target = contrastingInk(surfaces);
  for (let amount = 1; amount < 32; amount++) {
    const candidate = mix(color, target, amount / 32);
    if (passes(candidate)) return candidate;
  }
  return target;
}

export function resolveAppearance(appearance: Appearance, tone: ThemeTone) {
  const base = presets[appearance.preset][tone];
  const background = appearance.background ?? base.background;
  const ink = contrastingInk([background]);
  const tintSurface = (amount: number) => {
    const tint = mix(background, ink, amount);
    return contrast(tint, ink) >= 4.5 ? tint : background;
  };
  const secondary = appearance.background ? tintSurface(.045) : base.secondary;
  const panel = appearance.background ? tintSurface(.09) : base.panel;
  const floating = appearance.background ? tintSurface(.13) : mix(panel, base.muted, .06);
  const hover = appearance.background ? tintSurface(.16) : mix(panel, base.foreground, .08);
  const pressed = appearance.background ? tintSurface(.19) : mix(panel, base.foreground, .12);
  const surfaces = [background, secondary, panel, floating, hover, pressed];
  const requestedForeground = appearance.foreground ?? base.foreground;
  const foreground = readable(requestedForeground, surfaces, 4.5);
  const muted = readable(appearance.foreground ? mix(panel, foreground, .74) : base.muted, surfaces, 4.5);
  const accent = readable(appearance.accent ?? base.accent, surfaces, 3);
  const onAccent = contrastingInk([accent]);
  const focus = readable(appearance.accent ?? accent, surfaces, 3);
  const tintedNav = mix(background, accent, .15);
  const nav = contrast(foreground, tintedNav) >= 4.5 ? tintedNav : background;
  const surfaceCustom = appearance.preset !== 'arasn' || Boolean(appearance.background || appearance.foreground);
  const colorCustom = surfaceCustom || Boolean(appearance.accent);
  const tokens: Record<string, string> = {};
  if (surfaceCustom) Object.assign(tokens, {
    '--ui-surface-app': background, '--ui-surface-nav': background, '--ui-surface-canvas': secondary,
    '--ui-surface-subtle': secondary, '--ui-surface-card': panel, '--ui-surface-floating': floating,
    '--ui-text-primary': foreground, '--ui-text-secondary': muted, '--ui-text-muted': muted,
    '--ui-hover': hover, '--ui-pressed': pressed, '--ui-grid-dot': mix(secondary, foreground, .16),
    '--secondary-button-bg': secondary, '--secondary-button-hover-bg': hover, '--secondary-button-pressed-bg': pressed,
    '--secondary-button-hover-border': mix(background, foreground, .2),
    '--ui-border-subtle': appearance.background ? mix(background, foreground, .2) : base.border,
    '--ui-border-control': readable(base.border, surfaces, 3),
  });
  if (colorCustom) Object.assign(tokens, {
    '--ui-action': accent, '--ui-on-action': onAccent,
    '--ui-action-hover': mix(accent, onAccent === '#FFFFFF' ? '#000000' : '#FFFFFF', .10),
    '--ui-action-pressed': mix(accent, onAccent === '#FFFFFF' ? '#000000' : '#FFFFFF', .18),
    '--ui-focus': focus, '--ui-focus-halo': focus + '30',
    '--ui-nav-active': nav, '--ui-nav-on-active': readable(focus, [nav], 4.5),
    '--ui-nav-label': readable(accent, [background], 4.5),
  });
  return { tokens, colorCustom, foregroundAdjusted: Boolean(appearance.foreground && foreground !== requestedForeground),
    palette: { ...base, background, secondary, panel, foreground, muted, accent } };
}

export async function installedFonts() {
  const checks = await Promise.all(fonts.map(async font => {
    try {
      await new FontFace('ArasnFontProbe', `local("${font}")`).load();
      return font;
    } catch { return null; }
  }));
  return checks.filter((font): font is string => font !== null);
}
