import type { RELATION_TYPES } from "./topology";

// Theme pairs keep a relation's hue stable; all renderers share these tokens.
export const RELATION_APPEARANCE = {
  related: { dark: "#79A7E3", light: "#3568A9" },
  reference: { dark: "#AA96E2", light: "#7250AB" },
  dependency: { dark: "#DCAC5E", light: "#8B5C17" },
  resolves: { dark: "#73BD92", light: "#287448" },
  attachment: { dark: "#6EB9C8", light: "#247887" },
  source: { dark: "#AA96E2", light: "#7250AB" },
} satisfies Record<keyof typeof RELATION_TYPES, { dark: string; light: string }>;

export function relationTokens(type: keyof typeof RELATION_TYPES) {
  const appearance = RELATION_APPEARANCE[type];
  return { "--relation-dark": appearance.dark, "--relation-light": appearance.light };
}
