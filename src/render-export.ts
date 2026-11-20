import type { Item, CanvasEdgeValue, StrokeValue } from './board';
import { isHighlighter } from './brush';
import { paintInk } from './ink-renderer';
import { strokeBounds } from './drawing';
import { enclosingBounds, relationGeometry, RELATION_TYPES, type Bounds, type Camera } from './topology';
import { RELATION_APPEARANCE } from './relation-appearance';
import { exportSize, wrapText, type ExportRequest, type ExportResult } from './canvas-export';

type TextStyle = { size: number; family: string; weight: string; lineHeight: number; color: string; left: number; top: number; scroll: number };
export type ExportCard = { id: string; kind: 'note' | 'file' | 'node'; box: Bounds; text: string; title?: string; opacity?: number; color?: string;
  category?: string; fileId?: string; footer?: string; missing?: boolean; textStyle?: TextStyle; background?: string; headerBackground?: string; headerHeight?: number; short?: boolean };
export type ExportPalette = { background: string; surface: string; subtle: string; border: string; text: string; muted: string; dark: boolean; family: string };
export type ExportSource = { cards: ExportCard[]; strokes: StrokeValue[]; edges: CanvasEdgeValue[]; view: Bounds; zoom: number; palette: ExportPalette; name: string };

export function exportPalette(target: HTMLElement): ExportPalette {
  const style = getComputedStyle(target), root = getComputedStyle(document.documentElement);
  const color = (key: string, fallback: string) => root.getPropertyValue(key).trim() || fallback;
  return { background: style.backgroundColor === 'rgba(0, 0, 0, 0)' ? color('--ui-surface-app', '#ffffff') : style.backgroundColor,
    surface: color('--ui-surface-card', '#ffffff'), subtle: color('--ui-surface-subtle', '#eef1f6'), border: color('--ui-border-subtle', '#d8dde5'),
    text: color('--ui-text-primary', '#263449'), muted: color('--ui-text-secondary', '#596273'), dark: document.documentElement.dataset.theme === 'dark',
    family: style.fontFamily || '"Segoe UI", "Microsoft YaHei", sans-serif' };
}
export function freeExportSource(entries: [string, Item][], target: HTMLElement, camera: Camera): ExportSource {
  const palette = exportPalette(target), cards: ExportCard[] = [], strokes: StrokeValue[] = [];
  const elements = new Map([...target.querySelectorAll<HTMLElement>('[data-note-id]')].map(el => [el.dataset.noteId, el]));
  // Freeze data and DOM display state before any async font/image work.
  for (const [id, item] of structuredClone(entries)) {
    const v = item.value;
    if (v?.type === 'stroke') { strokes.push(v); continue; }
    if (v?.type === 'text' && !v.localOnly) {
      const el = elements.get(id), input = el?.querySelector('textarea'), body = input && getComputedStyle(input), header = el?.querySelector<HTMLElement>('.note-handle');
      cards.push({ id, kind: 'note', text: v.text, color: v.color, opacity: v.opacity, box: { x: v.x, y: v.y, width: v.width ?? 280, height: v.height ?? 140 },
        background: el ? getComputedStyle(el).backgroundColor : palette.surface, headerBackground: header ? getComputedStyle(header).backgroundColor : palette.subtle, headerHeight: header?.offsetHeight ?? 32,
        textStyle: { size: body ? parseFloat(body.fontSize) : v.fontSize ?? 18, family: body?.fontFamily ?? palette.family, weight: body?.fontWeight ?? (v.bold ? '700' : '400'),
          lineHeight: body ? parseFloat(body.lineHeight) : (v.fontSize ?? 18) * 1.6, color: body?.color ?? v.color,
          left: body ? parseFloat(body.paddingLeft) : 14, top: body ? parseFloat(body.paddingTop) : 12, scroll: input?.scrollTop ?? 0 } });
    }
    if (v?.type === 'free-file') cards.push({ id, kind: 'file', text: v.name, title: v.name, opacity: v.opacity, category: v.category, fileId: v.contentRef.id,
      box: { x: v.x, y: v.y, width: v.width, height: v.height } });
  }
  return { cards, strokes, edges: [], palette, zoom: camera.zoom, name: 'Arasn-自由画布', view: {
    x: camera.x - target.clientWidth / 2 / camera.zoom, y: camera.y - target.clientHeight / 2 / camera.zoom,
    width: target.clientWidth / camera.zoom, height: target.clientHeight / camera.zoom } };
}
const intersects = (a: Bounds, b: Bounds) => a.x <= b.x + b.width && a.y <= b.y + b.height && a.x + a.width >= b.x && a.y + a.height >= b.y;
export async function renderCanvasExport(source: ExportSource, request: ExportRequest, original: (id: string, name: string) => Promise<string | undefined>): Promise<ExportResult> {
  const { cards, strokes, edges, palette } = source, zoom = request.mode === 'all' ? 1 : source.zoom;
  const occupied: Bounds[] = [], byId = new Map(cards.map(card => [card.id, card]));
  const relations = edges.flatMap(edge => {
    const a = byId.get(edge.fromNodeId), b = byId.get(edge.toNodeId); if (!a || !b) return [];
    const geometry = relationGeometry(a.box, b.box, zoom, occupied, edge); occupied.push(geometry.labelBounds); return [{ edge, geometry }];
  });
  const boxes = cards.map(card => card.box);
  const ink=strokes.map(stroke=>{
    const {x,y,width,height}=strokeBounds(stroke.points), margin=stroke.width;
    return {stroke,box:{x:x-margin,y:y-margin,width:width+2*margin,height:height+2*margin}};
  });
  boxes.push(...ink.map(({box})=>box));
  for (const { geometry: g } of relations) { boxes.push(g.labelBounds); for (const p of [g.start, g.c1, g.c2, g.end]) boxes.push({ x: p.x - 10 / zoom, y: p.y - 10 / zoom, width: 20 / zoom, height: 20 / zoom }); }
  const bounds = request.mode === 'all' ? enclosingBounds(boxes) : request.mode === 'region' ? request.region : source.view;
  if (!bounds) throw new Error(request.mode === 'all' ? '画布没有可导出的内容，请先添加便签或图形。' : '请重新框选截图范围。');
  const padding = request.mode === 'all' ? request.padding : 0, size = exportSize(bounds, padding, request.multiplier, zoom);
  const canvas = document.createElement('canvas'); canvas.width = size.width; canvas.height = size.height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建导出画布，请降低倍率后重试。');
  await document.fonts.ready;
  const images = new Map<string, HTMLImageElement>(), warnings = new Set<string>();
  const loadImage = async (card: ExportCard) => {
    try {
      let img = images.get(card.fileId!);
      if (!img) {
        // Output pixel limits do not bound memory occupied by decoded originals.
        if (images.size >= 2) { const oldest = images.keys().next().value!; images.get(oldest)!.src = ''; images.delete(oldest); }
        const url = await original(card.fileId!, card.title ?? "");
        if (!url) return undefined;
        img = new Image(); img.src = url; await img.decode(); images.set(card.fileId!, img);
      }
      const ratio = Math.min(card.box.width / img.naturalWidth, Math.max(1, card.box.height - 34) / img.naturalHeight);
      if (ratio * size.factor > 1.01) warnings.add(`“${card.title}”原图像素较少；放大输出不会增加原始细节。`);
      return img;
    } catch (error) { throw new Error(`无法导出图片“${card.title}”：${String((error as Error).message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '')}。请恢复原图后重试。`); }
  };
  ctx.fillStyle = palette.background; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(size.factor, size.factor); ctx.translate(padding - bounds.x, padding - bounds.y); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const font = (size: number, weight = '400', family = palette.family) => { ctx.font = `${weight} ${size}px ${family}`; };
  const ellipsis = (text: string, width: number) => { if (ctx.measureText(text).width <= width) return text; let result = ''; for (const c of text) { if (ctx.measureText(result + c + '…').width > width) break; result += c; } return result + '…'; };
  const rounded = (b: Bounds, radius: number | number[]) => { ctx.beginPath(); ctx.roundRect(b.x, b.y, b.width, b.height, radius); };
  // Same content layering as the workspace: relations/ink, files, then notes.
  for (const { edge, geometry: g } of relations) {
    ctx.save(); const type = edge.relationType ?? 'related', color = RELATION_APPEARANCE[type][palette.dark ? 'dark' : 'light'];
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2 / zoom; ctx.lineCap = 'round'; ctx.stroke(new Path2D(g.path));
    const arrow = (p: { x: number; y: number }, control: { x: number; y: number }) => { const angle = Math.atan2(p.y - control.y, p.x - control.x), length = 7 / zoom;
      ctx.beginPath(); ctx.moveTo(p.x - length * Math.cos(angle - .45), p.y - length * Math.sin(angle - .45)); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x - length * Math.cos(angle + .45), p.y - length * Math.sin(angle + .45)); ctx.stroke(); };
    if (edge.direction !== 'none') arrow(g.end, g.c2); if (edge.direction === 'both') arrow(g.start, g.c1);
    ctx.fillStyle = palette.surface; rounded(g.labelBounds, 4 / zoom); ctx.fill(); ctx.fillStyle = color; font(12 / zoom); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ellipsis(RELATION_TYPES[type] + (edge.label ? ` · ${edge.label}` : ''), g.labelBounds.width - 12 / zoom), g.label.x, g.label.y); ctx.restore();
  }
  for (const {stroke,box} of ink) if(!isHighlighter(stroke)&&intersects(box,bounds)) paintInk(ctx, stroke);
  try {
  for (const card of [...cards.filter(c => c.kind === 'file'), ...cards.filter(c => c.kind !== 'file')]) {
    if (!intersects(card.box, bounds)) continue;
    const b = card.box; ctx.save(); ctx.globalAlpha = card.opacity ?? 1; rounded(b, card.kind === 'note' ? [3, 3, 16, 3] : 8);
    ctx.fillStyle = card.background ?? palette.surface; ctx.fill(); ctx.clip();
    if (card.kind === 'node' && card.color) {
      ctx.save(); ctx.fillStyle = card.color; ctx.globalAlpha *= .13; ctx.fillRect(b.x, b.y, b.width, b.height); ctx.restore();
      ctx.fillStyle = card.color; rounded({ x: b.x + 4, y: b.y + 14, width: 3, height: b.height - 28 }, 2); ctx.fill();
    }
    rounded({ x: b.x + .5, y: b.y + .5, width: b.width - 1, height: b.height - 1 }, card.kind === 'note' ? [3, 3, 16, 3] : 8);
    ctx.strokeStyle = palette.border; ctx.lineWidth = 1; ctx.stroke(); ctx.textBaseline = 'top';
    if (card.kind === 'note') {
      const s = card.textStyle!, header = card.headerHeight ?? 32;
      ctx.fillStyle = card.headerBackground ?? palette.subtle; ctx.fillRect(b.x, b.y, b.width, header); ctx.fillStyle = card.color ?? s.color; ctx.fillRect(b.x, b.y, 3, b.height);
      ctx.fillStyle = palette.muted; font(11); ctx.fillText('便签', b.x + 12, b.y + 10);
      ctx.beginPath(); ctx.rect(b.x + 3, b.y + header, b.width - 4, b.height - header - 1); ctx.clip(); font(s.size, s.weight, s.family); ctx.fillStyle = s.color;
      wrapText(card.text, Math.max(1, b.width - 4 - s.left * 2), text => ctx.measureText(text).width).forEach((row, i) => ctx.fillText(row, b.x + 3 + s.left, b.y + header + s.top - s.scroll + i * s.lineHeight));
    } else if (card.kind === 'file') {
      ctx.strokeStyle = palette.border; ctx.beginPath(); ctx.moveTo(b.x, b.y + 34); ctx.lineTo(b.x + b.width, b.y + 34); ctx.stroke(); ctx.fillStyle = palette.text; font(12);
      ctx.fillText(ellipsis(card.title ?? '', Math.max(1, b.width - 20)), b.x + 10, b.y + 10);
      const bodyVisible = intersects({ ...b, y: b.y + 34, height: Math.max(0, b.height - 34) }, bounds);
      const img = card.fileId && bodyVisible ? await loadImage(card) : undefined;
      if (img) { const ratio = Math.min(b.width / img.naturalWidth, Math.max(1, b.height - 34) / img.naturalHeight);
        ctx.drawImage(img, b.x + (b.width - img.naturalWidth * ratio) / 2, b.y + 34 + (b.height - 34 - img.naturalHeight * ratio) / 2, img.naturalWidth * ratio, img.naturalHeight * ratio); }
      else { const middle = b.y + 34 + (b.height - 34) / 2; ctx.textAlign = 'center'; font(14, '500'); ctx.fillText(ellipsis(card.text, b.width - 24), b.x + b.width / 2, middle - 12); ctx.fillStyle = palette.muted; font(12); ctx.fillText(`${card.category ?? '文件'} · 本机托管副本`, b.x + b.width / 2, middle + 12); }
    } else {
      const compact = zoom < .6; ctx.fillStyle = palette.text; font(compact ? Math.max(18, 11 / zoom) : 15, '600'); ctx.fillText(ellipsis(card.title ?? '', b.width - 28), b.x + 14, b.y + 12);
      if (!compact) { font(12); ctx.fillStyle = palette.muted; wrapText(card.text, b.width - 28, text => ctx.measureText(text).width).slice(0, card.short ? 1 : 2).forEach((row, i) => ctx.fillText(row, b.x + 14, b.y + 38 + i * 18));
        font(10); ctx.fillStyle = card.missing ? (palette.dark ? '#ffc4ce' : '#982b42') : palette.muted; ctx.fillText(ellipsis(card.footer ?? '', b.width - 28), b.x + 14, b.y + b.height - 20); }
    }
    ctx.restore();
  }
  for (const {stroke,box} of ink) if(isHighlighter(stroke)&&intersects(box,bounds)) paintInk(ctx, stroke);
  const blob = await new Promise<Blob>((resolve, reject) => { try { canvas.toBlob(value => value ? resolve(value) : reject(new Error('PNG 编码失败，请降低倍率后重试。')), 'image/png'); } catch { reject(new Error('图片读取或跨域权限失败，无法生成 PNG。')); } });
  return { blob, width: size.width, height: size.height, warnings: [...warnings] };
  } finally { for (const image of images.values()) image.src = ''; images.clear(); }
}
