import {useState} from 'react';
import {Dialog} from '@base-ui/react/dialog';
import {AppSelect} from './xigra/AppSelect';
export function ExportDialog({initialViewport,close,run}:{initialViewport:boolean;close:()=>void;run:(viewport:boolean,multiplier:number)=>Promise<void>}){
 const [viewport,setViewport]=useState(initialViewport),[multiplier,setMultiplier]=useState(1),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Dialog.Root open onOpenChange={open=>{if(!open&&!busy)close();}}><Dialog.Portal><Dialog.Backdrop className="desk-backdrop"/><Dialog.Popup className="modal xigra-record-dialog correctness-dialog" onKeyDown={e=>e.stopPropagation()}>
 <Dialog.Title>导出图片</Dialog.Title><Dialog.Description>按内容坐标合成 PNG。完整画布展开长便签正文，原数据与布局保持不变。</Dialog.Description>
 <label>导出范围<AppSelect disabled={busy} label="导出范围" value={viewport?'viewport':'all'} onValueChange={v=>setViewport(v==='viewport')} options={[{value:'all',label:'完整画布'},{value:'viewport',label:'当前视口'}]}/></label>
 <label>清晰度<AppSelect disabled={busy} label="导出倍率" value={String(multiplier)} onValueChange={v=>setMultiplier(Number(v))} options={[{value:'1',label:'1× · 标准'},{value:'2',label:'2× · 高清'},{value:'4',label:'4× · 超清'}]}/></label>
 <p>倍率按逻辑像素计算，不受屏幕 DPI 影响。上限为 3200 万像素、单边 16384px。展开的长便签可能覆盖邻近对象，可调整布局后导出。</p>
 {error&&<p role="alert">{error}</p>}<div className="dialog-actions"><button className="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await run(viewport,multiplier);close();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>{busy?'正在生成…':'生成 PNG'}</button></div>
 </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
