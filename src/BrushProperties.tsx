import { useState } from 'react';
import { AppSelect } from './xigra/AppSelect';
import { BRUSH_PRESETS, brushPath, brushDash, hexToHsl, hslToHex, type BrushPreset, type BrushStyle } from './brush';
import type { Shape } from './drawing';
const palette=['#263449','#4668c6','#39796b','#d05a4b','#e8c56a','#f0f2f6'];
type Props={color:string;width:number;style:BrushStyle;change(p:Partial<BrushPreset>):void;ink:boolean;shape?:Shape;setShape?(s:Shape):void;presets:BrushPreset[];save(p:BrushPreset[]):Promise<void>;text?:{fontSize?:number;bold?:boolean};changeText?(p:{fontSize?:number;bold?:boolean}):void};
export function BrushProperties(p:Props) {
 const [name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const hsl=hexToHsl(p.color);
 const persist=async(next:BrushPreset[])=>{setBusy(true);setError('');try{await p.save(next);setName('');}catch{setError('方案保存失败，请重试');}finally{setBusy(false);}};
 return <div className="brush-properties">
 {p.ink&&<><svg className="brush-preview" viewBox="0 0 220 42" aria-label="笔刷预览"><path d={brushPath({points:[[10,28],[45,15],[85,28],[125,15],[165,28],[208,15]],smoothing:p.style.smoothing})} fill="none" stroke={p.color} strokeWidth={p.width} opacity={p.style.opacity} strokeLinecap={p.style.lineCap} strokeDasharray={brushDash({...p.style,width:p.width}).join(' ')}/></svg>
 {p.setShape&&<label>图形<AppSelect label="绘图工具" value={p.shape!} options={[{value:'free',label:'画笔'},{value:'line',label:'直线'},{value:'rect',label:'矩形'},{value:'ellipse',label:'椭圆'},{value:'arrow',label:'箭头'},{value:'triangle',label:'三角形'}]} onValueChange={v=>p.setShape!(v as Shape)}/></label>}
 <label>粗细<AppSelect label="画笔粗细" value={String(p.width)} options={[2,4,7,12].map(v=>({value:String(v),label:`${v} px`}))} onValueChange={v=>p.change({width:Number(v)})}/></label></>}
 <div className="colors" role="group" aria-label="快速色板">{palette.map((c,i)=><button key={c} className={`color ${c===p.color?'chosen':''}`} style={{background:c}} aria-label={['墨色','靛蓝','松绿','朱红','暖黄','纸白'][i]} aria-pressed={c===p.color} onClick={()=>p.change({color:c})}/>)}</div>
 <label>颜色 <span className="brush-hex">{p.color.toUpperCase()}</span><input type="color" aria-label="自定义颜色" value={p.color} onChange={e=>p.change({color:e.target.value})}/></label>
 <details><summary>HSL 调色</summary>{['色相','饱和度','明度'].map((label,i)=><label key={label}>{label}<output>{Math.round(hsl[i])}{i?'%':'°'}</output><input aria-label={label} type="range" min="0" max={i?100:360} value={hsl[i]} onChange={e=>{const next=[...hsl] as [number,number,number];next[i]=Number(e.target.value);p.change({color:hslToHex(...next)});}}/></label>)}</details>
 {p.text&&<><label>字号<AppSelect label="文字字号" value={String(p.text.fontSize??18)} options={[14,18,24,32].map(v=>({value:String(v),label:`${v} px`}))} onValueChange={v=>p.changeText?.({fontSize:Number(v)})}/></label><button className="brush-action" aria-label="文字加粗" aria-pressed={!!p.text.bold} onClick={()=>p.changeText?.({bold:!p.text?.bold})}>加粗</button></>}
 {p.ink&&<><label>不透明度<output>{Math.round(p.style.opacity*100)}%</output><input aria-label="画笔不透明度" type="range" min="10" max="100" value={p.style.opacity*100} onChange={e=>p.change({opacity:Number(e.target.value)/100})}/></label>
 <details><summary>笔刷细节</summary>
 <label>笔刷<AppSelect label="笔刷类型" value={p.style.brush} options={[{value:'ink',label:'实线笔'},{value:'marker',label:'记号笔'},{value:'dash',label:'虚线笔'}]} onValueChange={v=>p.change(v==='marker'?{brush:'marker',lineCap:'square',opacity:.35,width:12}:{brush:v as BrushStyle['brush']})}/></label>
 <label>端点<AppSelect label="笔迹端点" value={p.style.lineCap} options={[{value:'round',label:'圆头'},{value:'butt',label:'平头'},{value:'square',label:'方头'}]} onValueChange={v=>p.change({lineCap:v as BrushStyle['lineCap']})}/></label>
 {(!p.shape||p.shape==='free')&&<label>平滑<output>{Math.round(p.style.smoothing*100)}%</output><input aria-label="笔迹平滑" type="range" min="0" max="100" value={p.style.smoothing*100} onChange={e=>p.change({smoothing:Number(e.target.value)/100})}/></label>}
 <small>平滑保留原始点列。记号笔使用方头、宽线和透明度。</small></details>
 <fieldset className="brush-presets"><legend>画笔预设</legend><div className="brush-preset-grid">{BRUSH_PRESETS.map(v=><button className="brush-action" key={v.name} onClick={()=>p.change(v)}>{v.name}</button>)}</div>
 {p.presets.map((v,i)=><div className="brush-preset-row" key={i}><button className="brush-action" onClick={()=>p.change(v)}>{v.name}</button><button className="brush-action" disabled={busy} aria-label={`删除预设${v.name}`} onClick={()=>void persist(p.presets.filter((_,j)=>i!==j))}>×</button></div>)}
 <input aria-label="预设名称" placeholder="命名当前笔刷" maxLength={32} value={name} onChange={e=>setName(e.target.value)}/><button className="brush-action" disabled={busy||!name.trim()||p.presets.length>=12} onClick={()=>void persist([...p.presets,{...p.style,color:p.color,width:p.width,name:name.trim()}])}>{busy?'保存中…':'保存为预设'}</button><small>最多保存 12 套自定义方案</small>
 </fieldset>{error&&<p role="alert">{error}</p>}</>}
 </div>;
}
