import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dressing,parts} from '../../src/world/placements/station-layout.js';
import {clearance} from '../../src/editor/snap/solver.js';
const saved=JSON.parse(readFileSync(new URL('../../src/world/placements/saved.json',import.meta.url))).station;
const specs=new Map(parts.map(p=>[p.id,p]));
const selected=new Map(dressing.map(p=>[p.id,p]));
const records=dressing.map(o=>{
 const t={...saved[o.id].transform};if(o.bind)t.yaw+=o.yaw;if(o.id==='gate')t.y=0;
 return {id:o.id,t,f:{w:o.size[0],h:o.size[1],d:o.size[2]},o};
});
const walls=parts.filter(p=>p.id.startsWith('wall/')).map(p=>({id:p.id,t:saved[p.id].transform,f:p.footprint}));
const issues=[];
for(const [i,a] of records.entries()){
 assert.ok(specs.has(a.o.parent),a.id+' 缺宿主');
 for(const b of [...walls,...records.slice(0,i)]){
  if(a.o.parent===b.id||b.o?.parent===a.id||a.t.y>=b.t.y+b.f.h-.004||b.t.y>=a.t.y+a.f.h-.004)continue;
  const v=clearance(a.t,a.f,b.t,b.f);if(v<-.01)issues.push([a.id,b.id,+v.toFixed(3)]);
 }
 if(selected.has(a.o.parent)){
  const h=records.find(b=>b.id===a.o.parent);const flat=clearance(a.t,a.f,h.t,h.f);
  assert.ok(flat<0,a.id+' 支撑面之外');
  const angle=-h.t.yaw*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),dx=a.t.x-h.t.x,dz=a.t.z-h.t.z;
  const da=(a.t.yaw-h.t.yaw)*Math.PI/180,ac=Math.abs(Math.cos(da)),as=Math.abs(Math.sin(da));
  assert.ok(Math.abs(dx*c+dz*s)+(ac*a.f.w+as*a.f.d)/2<=h.f.w/2+.012&&Math.abs(-dx*s+dz*c)+(as*a.f.w+ac*a.f.d)/2<=h.f.d/2+.012,a.id+' 四角越出宿主');
 }
}
assert.deepEqual(issues,[],'物件穿插 '+JSON.stringify(issues));
const fixed=[...walls,...records.filter(b=>b.o.solid!==false)].filter(b=>b.t.y<1.78&&b.t.y+b.f.h>.10);
const step=.25,R=.6;
function blocked(x,z){
 const t={x,z,yaw:0},f={w:2*R,d:2*R};
 return fixed.some(b=>clearance(t,f,b.t,b.f)<-.0001);
}
const start=[14,9.5],q=[start],seen=new Set([start.join()]);for(let i=0;i<q.length;i++){
 const [x,z]=q[i];for(const [dx,dz] of [[step,0],[-step,0],[0,step],[0,-step]]){
 const a=x+dx,b=z+dz,k=[a,b].join();if(seen.has(k)||a< -21||a>20.75||b< -10.5||b>10||blocked(a,b))continue;
 // Keep the proof indoors except at its south entry.
 if(b>8.5&&a>=10&&(Math.abs(a-14)>.60||b>9.5))continue;
 if(a>18.25&&b< -3.75)continue;
 seen.add(k);q.push([a,b]);
 }}
const targets={'维护工坊':[-9.5,-6.5],'车库':[-8,6],'储物间':[-3.4,-8],'装备间':[-3.2,-3.2],'洗消间':[-3.2,5],'员工通道':[.25,0],'厨房':[4,-8],'休闲室':[14,-6.5],'宿舍':[6,-1.8],'卫浴间':[6,2.5],'会议室':[5.8,6.4],'值班办公室':[16,0],'门厅':[15.3,5],'手链操作位':[-7.25,9.25],'离站北门内侧':[7.5,-9.5]};
for(const [name,[x,z]] of Object.entries(targets))assert.ok(q.some(([a,b])=>Math.hypot(x-a,z-b)<.6),name+' 1.20 m 步行净空不可达');
console.log(records.length+' 项、'+new Set(records.map(r=>r.o.asset)).size+' 种资产，穿插 0，父件支撑范围通过；从南门抵达全部 '+Object.keys(targets).length+' 个净空目标。');
