import { brushPath, brushDash, strokeCenterline, type BrushStyle } from './brush';

type Ink = Partial<BrushStyle> & { color: string; width: number; points: number[][]; inkVersion?: 1 };
type InkLayer = { path: string; alpha: number; width: number; cap: CanvasLineCap; dash: number[]; offset?: number; fill?: boolean; x?: number; y?: number };
const format = (n:number) => Math.round(n * 1000) / 1000;

function calligraphyOutline(points:number[][],width:number) {
 const radius=([,,pressure=.5]:number[])=>width*(.1+.4*pressure);
 // Circles and tapered links use the same winding, so overlapping ink is filled once.
 const path = points.map(p=>{
  const [x,y]=p.map(format),r=format(radius(p));
  return `M ${format(x+r)} ${y} a ${r} ${r} 0 1 1 ${-2*r} 0 a ${r} ${r} 0 1 1 ${2*r} 0 Z`;
 });
 for(let i=1;i<points.length;i++) {
  const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  if(!length)continue;
  const nx=-dy/length,ny=dx/length;
  const edge=(p:number[],sign:number)=>`${format(p[0]+nx*radius(p)*sign)} ${format(p[1]+ny*radius(p)*sign)}`;
  path.push(`M ${edge(a,1)} L ${edge(a,-1)} L ${edge(b,-1)} L ${edge(b,1)} Z`);
 }
 return path.join(' ');
}

export function inkLayers(ink:Ink):InkLayer[] {
 const points=strokeCenterline(ink), {width}=ink;
 const layer:InkLayer={path:brushPath({points}),alpha:ink.opacity??1,width,cap:ink.lineCap??'round',dash:brushDash(ink)};
 if(!ink.inkVersion)return [layer];
 if(ink.brush==='calligraphy')return [{...layer,fill:true,path:calligraphyOutline(points,width)}];
 if(ink.brush==='pencil')return [
  {...layer,width:width*.72,alpha:layer.alpha*.31,cap:'round'},
  {...layer,width:width*.31,alpha:layer.alpha*.6,cap:'round',dash:[.8,1.35,2.3,1.65,1.5,2.15],x:-width*.14,y:width*.12},
  {...layer,width:width*.19,alpha:layer.alpha*.48,cap:'round',dash:[1.25,.8,.65,1.6,1.85,1.25],offset:2,x:width*.21,y:-width*.16},
 ];
 if(ink.brush==='marker'){
  const edge=layer.alpha*.38;
  return [{...layer,alpha:edge},{...layer,width:width*.86,alpha:(layer.alpha-edge)/(1-edge)}];
 }
 return [layer];
}

export function paintInk(ctx:CanvasRenderingContext2D,ink:Ink) {
 ctx.save();
 ctx.strokeStyle=ctx.fillStyle=ink.color;
 ctx.lineJoin='round';
 for(const layer of inkLayers(ink)) {
  const path=new Path2D(layer.path);
  ctx.save();
  ctx.translate(layer.x??0,layer.y??0);
  ctx.globalAlpha=layer.alpha;
  if(layer.fill)ctx.fill(path);
  else {
   ctx.lineWidth=layer.width;ctx.lineCap=layer.cap;
   ctx.setLineDash(layer.dash);ctx.lineDashOffset=layer.offset??0;
   ctx.stroke(path);
  }
  ctx.restore();
 }
 ctx.restore();
}
