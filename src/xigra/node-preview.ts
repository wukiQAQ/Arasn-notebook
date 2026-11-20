import { AUTO_NODE_MAX_HEIGHT, type TopologyLayout, type TopologyNote } from '../topology';

const TITLE_LINE_HEIGHT = 22;
const PREVIEW_LINE_HEIGHT = 18;
const CARD_INSETS = 30; // Padding and border on both sides.
const FOOTER_HEIGHT = 22;
const SECTION_GAP = 6;
let measurement: CanvasRenderingContext2D | null | undefined;
const contentCache = new WeakMap<TopologyNote, { title: string; summary: string }>();
const lineCache = new Map<string, number>();

function plainText(text: string) {
  if (/<\/?(?:p|div|br|span|strong|b|em|i|a|img|ul|ol|li|h[1-6]|blockquote|pre|code|table|tr|td|script|style)\b/i.test(text)) {
    const template = document.createElement('template');
    template.innerHTML = text;
    template.content.querySelectorAll('script,style,template,svg,iframe').forEach(element => element.remove());
    template.content.querySelectorAll('p,div,br,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr').forEach(element => element.after('\n'));
    text = template.content.textContent ?? '';
  }
  return text.replace(/\r\n?/g, '\n')
    .replace(/^\s*(?:```|~~~).*$/gm, '')
    .replace(/^\s{0,3}(?:#{1,6}[ \t]+|>[ \t]*|[-*+][ \t]+|\d+[.)][ \t]+)(?:\[[ xX]\][ \t]+)?/gm, '')
    .replace(/!?\[([^\]\n]+)\]\([^\n)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|`+)([^\n]+?)\1/g, '$2')
    .replace(/(^|\s)([*_])([^\n]+?)\2(?=\s|[，。！？,.!?]|$)/g, '$1$3')
    .split('\n').map(line => line.replace(/[\t\u00a0 ]+/g, ' ').trim()).filter(Boolean).join('\n');
}

export function readableNodeContent(value: TopologyNote) {
  const cached = contentCache.get(value);
  if (cached) return cached;
  const { text, title: name } = value;
  const lines = plainText(text).split('\n').filter(Boolean);
  const explicit = name?.trim() ? plainText(name).replaceAll('\n', ' ') : '';
  const first = lines[0];
  const title = explicit || first || '未命名节点';
  const content = { title, summary: (explicit && first !== explicit ? lines : lines.slice(1)).join('\n') };
  contentCache.set(value, content);
  return content;
}

function wrappedLines(text: string, width: number, font: string, limit: number) {
  if (!text) return 0;
  const key = JSON.stringify([width, font, limit, text]);
  const cached = lineCache.get(key);
  if (cached !== undefined) return cached;
  measurement ??= document.createElement('canvas').getContext('2d');
  if (!measurement) return Math.min(limit, text.split('\n').length);
  measurement.font = font;
  let rows = 1, line = '';
  for (const character of text) {
    if (character === '\n' || (line && measurement.measureText(line + character).width > width)) {
      if (++rows >= limit) break;
      line = character === '\n' ? '' : character;
    } else line += character;
  }
  if (lineCache.size >= 512) lineCache.delete(lineCache.keys().next().value!);
  lineCache.set(key, rows);
  return rows;
}

export function nodeCardLayout(layout: TopologyLayout, title: string, summary: string, compact: boolean, font: string) {
  if (compact) return { ...layout, height: Math.min(layout.height, 104) };
  if (!layout.autoSize) return layout;
  const width = layout.width - CARD_INSETS;
  const titleHeight = wrappedLines(title, width, `600 16px ${font}`, 2) * TITLE_LINE_HEIGHT;
  const body = wrappedLines(summary, width, `400 13px ${font}`, 5);
  const base = CARD_INSETS + FOOTER_HEIGHT + titleHeight + SECTION_GAP;
  const minimum = body >= 3 ? layout.height : body === 2 ? 136 : 120;
  const height = body ? Math.max(minimum, base + SECTION_GAP + body * PREVIEW_LINE_HEIGHT) : Math.max(104, base);
  return { ...layout, height: Math.min(AUTO_NODE_MAX_HEIGHT, height) };
}

export function nodePreviewLines(layout: TopologyLayout, title: string, font: string, zoom: number) {
  const titleHeight = wrappedLines(title, layout.width - CARD_INSETS, `600 16px ${font}`, 2) * TITLE_LINE_HEIGHT;
  const bodySpace = layout.height - CARD_INSETS - FOOTER_HEIGHT - titleHeight - SECTION_GAP * 2;
  const density = zoom < .7 ? 2 : layout.height >= 165 ? 5 : 3;
  return Math.max(0, Math.min(density, Math.floor(bodySpace / PREVIEW_LINE_HEIGHT)));
}
