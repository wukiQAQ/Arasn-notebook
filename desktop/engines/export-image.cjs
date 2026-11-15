const fs = require('node:fs/promises');
function dimensions(bytes, extension) {
  if(extension==='png') return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  for(let i=2;i+8<bytes.length;){
    if(bytes[i++]!==255)continue; const marker=bytes[i++];
    if(marker===0xda||marker===0xd9)break;
    const length=bytes.readUInt16BE(i);if(length<2)break;
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(i+5),height:bytes.readUInt16BE(i+3)};
    i+=length;
  }
  throw new Error('无法读取图片像素尺寸');
}
async function originalImage(storage,id){
  const source=await storage.call('thumbnailSource',{id});
  if(!source)throw new Error('原图不可用：需为不超过20MB的有效本机 PNG/JPEG 托管文件');
  const stat=await fs.stat(source.path);if(stat.size>32*1024*1024)throw new Error('原图超过 32MB 安全读取限制');
  const bytes=await fs.readFile(source.path),size=dimensions(bytes,source.extension);
  if(size.width<1||size.height<1||size.width*size.height>32_000_000)throw new Error('原图超过 3200万像素安全解码限制');
  return `data:image/${source.extension==='jpg'?'jpeg':'png'};base64,${bytes.toString('base64')}`;
}
module.exports={originalImage,dimensions};
