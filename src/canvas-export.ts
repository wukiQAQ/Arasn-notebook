import type { Bounds } from './topology';
export function exportSize(bounds: Bounds, padding: number, multiplier: number, zoom = 1) {
  const factor=multiplier*zoom, width=Math.ceil(Math.ceil(bounds.width+padding*2)*factor),height=Math.ceil(Math.ceil(bounds.height+padding*2)*factor);
  if(![1,2,4].includes(multiplier)||!Number.isFinite(width*height)||width<1||height<1||width>16384||height>16384||width*height>32_000_000)
    throw new Error('输出超过安全尺寸（边长 16384px / 3200万像素），请降低倍率或导出当前视口');
  return {width,height,factor};
}
export function wrapText(text:string,width:number,measure:(text:string)=>number) {
  const rows:string[]=[];
  for(const paragraph of text.replace(/\r\n?/g,'\n').split('\n')){let line='';for(const char of paragraph){if(line&&measure(line+char)>width){rows.push(line);line='';}line+=char;}rows.push(line);}
  return rows;
}
