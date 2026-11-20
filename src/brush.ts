export const BRUSH_NAMES = {ink:'硬笔', pencil:'铅笔', marker:'马克笔', highlighter:'荧光笔', calligraphy:'毛笔', dash:'虚线笔'} as const;
export type BrushKind = keyof typeof BRUSH_NAMES;
export const validWidth = (v: number) => Number.isFinite(v) && v >= .5 && v <= 40 && Number.isInteger(v * 2);
export type BrushStyle = { opacity: number; smoothing: number; lineCap: 'round'|'butt'|'square'; brush: BrushKind; dashLength?: number; dashGap?: number; pressure?: boolean };
export type BrushPreset = BrushStyle & { name: string; color: string; width: number };
export const DEFAULT_BRUSH: BrushStyle = {opacity:1,smoothing:0,lineCap:'round',brush:'ink'};
export const BRUSH_PRESETS: BrushPreset[] = [
 {name:'细笔',color:'#9aafff',width:2,...DEFAULT_BRUSH,smoothing:.35},
 {name:'记号笔',color:'#e8c56a',width:12,...DEFAULT_BRUSH,opacity:.35,lineCap:'square',brush:'marker',smoothing:.5},
 {name:'虚线笔',color:'#75bca4',width:4,...DEFAULT_BRUSH,brush:'dash'},
];
export const BRUSH_DEFAULTS: Record<BrushKind, BrushPreset> = {
 ink: {...DEFAULT_BRUSH, name:BRUSH_NAMES.ink, color:'#263449', width:4, smoothing:.35},
 pencil: {...DEFAULT_BRUSH, name:BRUSH_NAMES.pencil, brush:'pencil', color:'#263449', width:5, smoothing:.25},
 marker: {...DEFAULT_BRUSH, name:BRUSH_NAMES.marker, brush:'marker', color:'#4668c6', width:14, opacity:.8, lineCap:'square', smoothing:.4},
 highlighter: {...DEFAULT_BRUSH, name:BRUSH_NAMES.highlighter, brush:'highlighter', color:'#e8c56a', width:18, opacity:.35, lineCap:'butt', smoothing:.45},
 calligraphy: {...DEFAULT_BRUSH, name:BRUSH_NAMES.calligraphy, brush:'calligraphy', color:'#263449', width:12, smoothing:.4, pressure:true},
 dash: {...BRUSH_PRESETS[2], smoothing:.4},
};
export function defaultBrush(kind:BrushKind,dark:boolean) {
 const preset=BRUSH_DEFAULTS[kind];
 return dark&&preset.color==='#263449'?{...preset,color:'#e2e8f2'}:preset;
}
export const isHighlighter = (ink:{inkVersion?:1; brush?:BrushKind}) => ink.inkVersion===1 && ink.brush==='highlighter';
export function validPreset(p: unknown): p is BrushPreset {
 if(!p||typeof p!=='object')return false;const v=p as BrushPreset;
 return typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=32&&/^#[0-9a-f]{6}$/i.test(v.color)&&validWidth(v.width)&&Number.isFinite(v.opacity)&&v.opacity>=.1&&v.opacity<=1&&Number.isFinite(v.smoothing)&&v.smoothing>=0&&v.smoothing<=1&&['round','butt','square'].includes(v.lineCap)&&Object.hasOwn(BRUSH_NAMES,v.brush)&&[v.dashLength,v.dashGap].every(n=>n===undefined||Number.isFinite(n)&&n>=1&&n<=120)&&(v.pressure===undefined||typeof v.pressure==='boolean');
}
export function smoothPoints(points:number[][], amount=0) {
 if(!amount)return points;
 return points.map((p,i)=>i===0||i===points.length-1?p:p.map((v,j)=>v*(1-amount/2)+(points[i-1][j]+points[i+1][j])*amount/4));
}
// Versioned strokes round corners along a sampled quadratic centerline.
export function strokeCenterline(stroke: {points:number[][]; smoothing?:number; inkVersion?:1}) {
 const points=smoothPoints(stroke.points,stroke.smoothing);
 if (!stroke.inkVersion || !stroke.smoothing || points.length < 3) return points;
 const mix=(a:number[],b:number[],t:number)=>a.map((v,j)=>v+(b[j]-v)*t);
 const rounding=stroke.smoothing / 2;
 const line=[points[0]];
 for(let i=1;i<points.length-1;i++) {
  const p=points[i], a=mix(p,points[i-1],rounding), b=mix(p,points[i+1],rounding);
  line.push(a,mix(mix(a,p,.5),mix(p,b,.5),.5),b);
 }
 line.push(points[points.length-1]);
 return line;
}
export function brushPath(s:{points:number[][];smoothing?:number}) {
 return smoothPoints(s.points,s.smoothing).map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+(s.points.length===1?' l .1 .1':'');
}
export const brushDash=(s:{brush?:string;width:number;dashLength?:number;dashGap?:number})=>s.brush==='dash'?[s.dashLength??s.width*3,s.dashGap??s.width*2.5]:[];
export function hexToHsl(hex:string):[number,number,number] {
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
 const h=!d?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return [h*60,d?d/(1-Math.abs(2*l-1))*100:0,l*100];
}
export function hslToHex(h:number,s:number,l:number) {
 s/=100;l/=100;const a=s*Math.min(l,1-l);
 return '#'+[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');}).join('');
}
