export type BrushStyle = { opacity: number; smoothing: number; lineCap: 'round'|'butt'|'square'; brush: 'ink'|'marker'|'dash' };
export type BrushPreset = BrushStyle & { name: string; color: string; width: number };
export const DEFAULT_BRUSH: BrushStyle = {opacity:1,smoothing:0,lineCap:'round',brush:'ink'};
export const BRUSH_PRESETS: BrushPreset[] = [
 {name:'细笔',color:'#9aafff',width:2,...DEFAULT_BRUSH,smoothing:.35},
 {name:'记号笔',color:'#e8c56a',width:12,...DEFAULT_BRUSH,opacity:.35,lineCap:'square',brush:'marker',smoothing:.5},
 {name:'虚线笔',color:'#75bca4',width:4,...DEFAULT_BRUSH,brush:'dash'},
];
export function validPreset(p: unknown): p is BrushPreset {
 if(!p||typeof p!=='object')return false;const v=p as BrushPreset;
 return typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=32&&/^#[0-9a-f]{6}$/i.test(v.color)&&[2,4,7,12].includes(v.width)&&Number.isFinite(v.opacity)&&v.opacity>=.1&&v.opacity<=1&&Number.isFinite(v.smoothing)&&v.smoothing>=0&&v.smoothing<=1&&['round','butt','square'].includes(v.lineCap)&&['ink','marker','dash'].includes(v.brush);
}
export function smoothPoints(points:number[][], amount=0) {
 if(!amount)return points;
 return points.map((p,i)=>i===0||i===points.length-1?p:p.map((v,j)=>v*(1-amount/2)+(points[i-1][j]+points[i+1][j])*amount/4));
}
export function brushPath(s:{points:number[][];smoothing?:number}) {
 return smoothPoints(s.points,s.smoothing).map((p,i)=>`${i?'L':'M'} ${p[0]} ${p[1]}`).join(' ')+(s.points.length===1?' l .1 .1':'');
}
export const brushDash=(s:{brush?:string;width:number})=>s.brush==='dash'?[s.width*3,s.width*2.5]:[];
export function hexToHsl(hex:string):[number,number,number] {
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;
 const h=!d?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;
 return [h*60,d?d/(1-Math.abs(2*l-1))*100:0,l*100];
}
export function hslToHex(h:number,s:number,l:number) {
 s/=100;l/=100;const a=s*Math.min(l,1-l);
 return '#'+[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0');}).join('');
}
