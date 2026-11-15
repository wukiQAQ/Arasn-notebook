import type { Item, TextValue, CanvasEdgeValue } from './board';
import {brushPath,brushDash} from './brush';
import {enclosingBounds,relationGeometry,RELATION_TYPES,type Bounds} from './topology';
import {RELATION_APPEARANCE} from './relation-appearance';
import {exportSize,wrapText} from './canvas-export';

export async function renderFreeExport(entries:[string,Item][], view:Bounds|undefined, multiplier:number, zoom:number, original:(id:string)=>Promise<string>, edges:CanvasEdgeValue[]=[]) {
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建导出画布');
 await document.fonts.ready;
 const notes=entries.flatMap(([,item])=>item.value?.type==='text'&&!item.value.localOnly?[item.value]:[]);
 const font=(v:TextValue)=>`${v.bold?'bold ':''}${v.fontSize||18}px "Segoe UI", "Microsoft YaHei", sans-serif`;
 const prepared=new Map(notes.map(v=>{ctx.font=font(v);const rows=wrapText(v.text,(v.width??280)-32,s=>ctx.measureText(s).width),lineHeight=(v.fontSize||18)*1.4;return [v,{rows,lineHeight,height:view?(v.height??140):Math.max(v.height??140,52+rows.length*lineHeight)}];}));
 const boxes=entries.flatMap(([,i]):Bounds[]=>{const v=i.value;if(v?.type==='text'&&!v.localOnly)return [{x:v.x,y:v.y,width:v.width??280,height:prepared.get(v)!.height}];if(v?.type==='free-file')return [v];if(v?.type==='stroke')return v.points.map(([x,y])=>({x:x-v.width,y:y-v.width,width:v.width*2,height:v.width*2}));return [];});
 const noteMap=new Map(entries.flatMap(([id,i])=>i.value?.type==='text'?[[id,i.value] as const]:[]));
 const occupied:Bounds[]=[];
 const relations=edges.flatMap(e=>{const a=noteMap.get(e.fromNodeId),b=noteMap.get(e.toNodeId);if(!a||!b)return [];const box=(v:TextValue)=>({x:v.x,y:v.y,width:v.width??280,height:prepared.get(v)!.height});const geometry=relationGeometry(box(a),box(b),1,occupied);occupied.push(geometry.labelBounds);boxes.push(geometry.labelBounds,...[geometry.start,geometry.end,geometry.c1,geometry.c2].map(p=>({...p,width:1,height:1})));return [{e,geometry}];});
 const bounds=view??enclosingBounds(boxes)??{x:0,y:0,width:1600,height:1000},padding=view?0:24;
 const size=exportSize(bounds,padding,multiplier,view?zoom:1);canvas.width=size.width;canvas.height=size.height;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,size.width,size.height);ctx.scale(size.factor,size.factor);ctx.translate(padding-bounds.x,padding-bounds.y);
 for(const {e,geometry:g} of relations){const type=e.relationType??'related',color=RELATION_APPEARANCE[type].light;ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;ctx.stroke(new Path2D(g.path));
   const arrow=(p:{x:number;y:number},control:{x:number;y:number})=>{const angle=Math.atan2(p.y-control.y,p.x-control.x);ctx.beginPath();ctx.moveTo(p.x-10*Math.cos(angle-.45),p.y-10*Math.sin(angle-.45));ctx.lineTo(p.x,p.y);ctx.lineTo(p.x-10*Math.cos(angle+.45),p.y-10*Math.sin(angle+.45));ctx.stroke();};
   if(e.direction!=='none')arrow(g.end,g.c2);if(e.direction==='both')arrow(g.start,g.c1);
   ctx.font='13px "Segoe UI", "Microsoft YaHei", sans-serif';ctx.textAlign='center';ctx.fillText(e.label||RELATION_TYPES[type],g.label.x,g.label.y+4,g.labelWidth);ctx.textAlign='start';}
 // Same stacking as the workspace: SVG strokes, file cards, then HTML notes.
 for(const [,item] of entries){const v=item.value;if(v?.type!=='stroke')continue;ctx.globalAlpha=v.opacity??1;ctx.strokeStyle=v.color;ctx.lineWidth=v.width;ctx.lineCap=v.lineCap??'round';ctx.lineJoin='round';ctx.setLineDash(brushDash(v));ctx.stroke(new Path2D(brushPath(v)));}ctx.setLineDash([]);
 for(const [,item] of entries){const v=item.value;if(v?.type!=='free-file')continue;
   if(view&&(v.x>view.x+view.width||v.y>view.y+view.height||v.x+v.width<view.x||v.y+v.height<view.y))continue;
   ctx.globalAlpha=v.opacity??1;ctx.fillStyle='#eef1f6';ctx.fillRect(v.x,v.y,v.width,v.height);
   if(v.category==='图片'){let url:string;try{url=await original(v.contentRef.id);}catch(e){throw new Error(`${v.name}：${(e as Error).message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'')}`);}const img=new Image();img.src=url;try{await img.decode();}catch{throw new Error(`原图解码失败：${v.name}`);}const ratio=Math.min(v.width/img.naturalWidth,(v.height-32)/img.naturalHeight);ctx.drawImage(img,v.x+(v.width-img.naturalWidth*ratio)/2,v.y+32+(v.height-32-img.naturalHeight*ratio)/2,img.naturalWidth*ratio,img.naturalHeight*ratio);}
   ctx.fillStyle='#263449';ctx.font='14px "Segoe UI", sans-serif';ctx.fillText(v.name,v.x+10,v.y+22,v.width-20);
 }
 for(const v of notes){const p=prepared.get(v)!;ctx.save();ctx.globalAlpha=v.opacity??1;ctx.fillStyle='#f6f8fb';ctx.fillRect(v.x,v.y,v.width??280,p.height);ctx.fillStyle=v.color;ctx.fillRect(v.x,v.y,3,p.height);ctx.font='12px "Segoe UI", "Microsoft YaHei", sans-serif';ctx.fillText('便签',v.x+12,v.y+22);ctx.beginPath();ctx.rect(v.x+16,v.y+42,(v.width??280)-32,p.height-42);ctx.clip();ctx.font=font(v);ctx.textBaseline='top';p.rows.forEach((row,i)=>ctx.fillText(row,v.x+16,v.y+42+i*p.lineHeight));ctx.restore();}
 return await new Promise<Blob>((resolve,reject)=>{try{canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG 编码失败，请降低倍率')),'image/png');}catch{reject(new Error('图片读取或跨域权限失败，无法导出'));}});
}
