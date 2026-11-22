import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sets} from '../src/editor/snap/catalog.js';
import {snap} from '../src/editor/snap/solver.js';
import {resolvePolicy} from '../src/editor/snap/config.js';
import {context} from '../src/editor/snap/context.js';

const file=new URL('../src/world/placements/saved.json',import.meta.url);
const db=JSON.parse(readFileSync(file,'utf8')),station=sets.station;
const output={};
for(const obj of station.objects){
 assert.ok(!Object.hasOwn(output,obj.id),'重复 ID '+obj.id);
 assert.ok(obj.parent==='datum'||output[obj.parent],'宿主缺失 '+obj.id);
 const t=obj.transform,r=snap({object:obj,policy:resolvePolicy(obj),current:t,pointer:t,layer:'ped'},context(station,station.objects,obj));
 assert.ok(r.valid,obj.id+JSON.stringify(r.issues));
 assert.ok(!r.issues.some(i=>i.code==='opening-size'),obj.id);
 output[obj.id]={profile:obj.profile,transform:r.transform,parent:obj.parent,...(r.anchorId?{anchorId:r.anchorId}:{})};
}
if(process.argv.includes('--apply-baseline')){
 db.station=output;writeFileSync(file,JSON.stringify(db,null,2)+'\n');
}else{
 // 已经在编辑器提交的合法偏移同样可以验收。
 assert.deepEqual(Object.keys(db.station).sort(),Object.keys(output).sort());
 for(const obj of station.objects){
  const saved=db.station[obj.id],t=saved.transform;
  const current={...obj,...saved};
  const r=snap({object:current,policy:resolvePolicy(current),current:t,pointer:t,layer:'ped'},context(station,station.objects,current));
  assert.ok(r.valid,obj.id);assert.deepEqual(r.transform,t,obj.id);
 }
}
console.log('消防局放置件 '+Object.keys(output).length+'，关系和安装尺寸校验通过');
