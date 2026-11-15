function validBrushPresets(list) {
 return Array.isArray(list)&&list.length<=12&&list.every(v=>v&&typeof v==='object'&&typeof v.name==='string'&&v.name.trim().length>0&&v.name.length<=32&&typeof v.color==='string'&&/^#[0-9a-f]{6}$/i.test(v.color)&&[2,4,7,12].includes(v.width)&&typeof v.opacity==='number'&&Number.isFinite(v.opacity)&&v.opacity>=.1&&v.opacity<=1&&typeof v.smoothing==='number'&&Number.isFinite(v.smoothing)&&v.smoothing>=0&&v.smoothing<=1&&['round','butt','square'].includes(v.lineCap)&&['ink','marker','dash'].includes(v.brush)&&Object.keys(v).every(k=>['name','color','width','opacity','smoothing','lineCap','brush'].includes(k)));
}
module.exports={validBrushPresets};
