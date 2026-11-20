import type { Bounds } from './topology';
export type ExportMode = 'region' | 'viewport' | 'all';
export type ExportRequest = { mode: ExportMode; multiplier: number; padding: number; region?: Bounds };
export type ExportResult = { blob: Blob; width: number; height: number; warnings: string[] };
export function selectionToWorld(selection: Bounds, view: Bounds, zoom: number): Bounds {
  return { x: view.x + selection.x / zoom, y: view.y + selection.y / zoom,
    width: selection.width / zoom, height: selection.height / zoom };
}
export function exportSize(bounds: Bounds, padding: number, multiplier: number, zoom = 1) {
  // Ignore arithmetic noise near integral pixels, not real fractional coverage.
  const pixels = (value: number) => Math.ceil(value - Number.EPSILON * Math.max(1, Math.abs(value)) * 8);
  const factor=multiplier*zoom, width=pixels((bounds.width+padding*2)*factor),height=pixels((bounds.height+padding*2)*factor);
  if(![1,2,4].includes(multiplier)||!Number.isFinite(padding)||padding<0||padding>512||!Number.isFinite(zoom)||zoom<=0||bounds.width<=0||bounds.height<=0||!Number.isFinite(width*height)||width<1||height<1||width>16384||height>16384||width*height>32_000_000)
    throw new Error('输出超过安全尺寸（边长 16384px / 3200万像素），请降低倍率或导出当前视口');
  return {width,height,factor};
}
export function wrapText(text:string,width:number,measure:(text:string)=>number) {
  const rows:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){let line='';for(const char of paragraph){if(line&&measure(line+char)>width){rows.push(line);line='';}line+=char;}rows.push(line);}
  return rows;
}
