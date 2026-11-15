const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),version=require('../package.json').version;
const result=[];
for(const kind of ['Portable','Setup']) {
  const name=`Arasn-${version}-${kind}.exe`,source=path.join(root,'release/distribution',name),target=path.join(root,name);
  if(!fs.existsSync(source)) throw Error(`Missing artifact: ${source}`);
  const fd=fs.openSync(source,'r'),header=Buffer.alloc(2);fs.readSync(fd,header,0,2,0);fs.closeSync(fd);
  if(header.toString()!=='MZ') throw Error(`Invalid executable: ${name}`);
  fs.copyFileSync(source,target);
  const hash=crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  result.push({name,bytes:fs.statSync(target).size,sha256:hash});
}
fs.writeFileSync(path.join(root,'release/distribution/artifacts.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
