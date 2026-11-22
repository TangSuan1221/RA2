import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {AnchorIndex,result,snapInto,snap,validator} from '../../src/editor/snap/solver.js';
import {resolvePolicy} from '../../src/editor/snap/config.js';
function setup(profile='prop'){
 const object={profile,socketType:'wall',footprint:{w:2,d:1,h:1}};
 const current={x:12.37,z:8.91,y:0,yaw:37},q={object,current,pointer:current,policy:resolvePolicy(object),layer:'ped'};
 const normal={x:0,y:1,z:0},sample={y:.42,normal};
 const ctx={grid:{worldToCell:()=>true},surface:{sample:()=>sample},anchors:new AnchorIndex(),validator:validator([])};
 return {q,ctx};
}
test('自由家具、序列化逐值保留',()=>{const {q,ctx}=setup(),t=snap(q,ctx).transform;assert.deepEqual(t,{x:12.37,y:.42,z:8.91,yaw:37});assert.deepEqual(JSON.parse(JSON.stringify(t)),t)});
test('结构件必须匹配 socket，Ctrl 保留指针',()=>{const {q,ctx}=setup('structural');q.ctrl=true;assert.equal(snap(q,ctx).valid,false);ctx.anchors.register({id:'a',type:'wall',kind:'socket',x:12.5,z:9,y:0,yaw:90});assert.equal(snap(q,ctx).transform.x,12.37);q.ctrl=false;assert.deepEqual(snap(q,ctx).transform,{x:12.5,z:9,y:0,yaw:90})});
test('足迹五点取最高、缺角硬阻止',()=>{const {q,ctx}=setup();let i=0;const ys=[.3,.4,.6,.5,.7];ctx.surface.sample=()=>({y:ys[i++],normal:{x:0,y:1,z:0}});assert.equal(snap(q,ctx).transform.y,.7);ctx.surface.sample=()=>null;assert.equal(snap(q,ctx).issues[0].code,'no-surface')});
test('Shift 只对位置，Alt 保留角度',()=>{const {q,ctx}=setup();q.shift=true;assert.deepEqual(snap(q,ctx).transform,{x:12.5,y:.42,z:9,yaw:37});q.policy.angleStep=15;q.alt=true;assert.equal(snap(q,ctx).transform.yaw,37)});
test('净空提示不改变坐标，越界阻止',()=>{const {q,ctx}=setup(),before=snap(q,ctx);q.pathWidth=1.05;const after=snap(q,ctx);assert.deepEqual(after.transform,before.transform);assert.equal(after.valid,true);assert.equal(after.issues[0].code,'path-too-narrow');ctx.grid.worldToCell=()=>null;assert.equal(snap(q,ctx).valid,false)});
test('候选优先、字典序与确定性',()=>{const {q,ctx}=setup('structural');for(const [id,kind] of [['z','socket'],['a','socket'],['e','edge'],['v','vertex']])ctx.anchors.register({id,kind,type:'wall',...q.current});const r=snap(q,ctx);assert.equal(r.anchorId,'a');assert.deepEqual(snap(q,ctx),r)});
test('500 锚点，10000 次原位求解计时',t=>{const {q,ctx}=setup('structural'),out=result();for(let i=0;i<500;i++)ctx.anchors.register({id:String(i),kind:'socket',type:'wall',x:12+i*.5,y:0,z:9,yaw:90});for(let i=0;i<20000;i++)snapInto(out,q,ctx);const start=performance.now();for(let i=0;i<10000;i++)snapInto(out,q,ctx);const ms=performance.now()-start;t.diagnostic(ms.toFixed(2)+' ms / 目标 <2 ms');assert.ok(out.valid)});
test('登记墙段均有兼容安装点，洞口尺寸单独报告',async()=>{
 const {sets}=await import('../../src/editor/snap/catalog.js');
 const {context}=await import('../../src/editor/snap/context.js');
 const set=sets.station;
 for(const obj of set.objects.filter(o=>o.profile==='structural')){
  const q={object:obj,current:obj.transform,pointer:obj.transform,policy:resolvePolicy(obj),layer:'ped'};
  const r=snap(q,context(set,set.objects,obj));
  assert.ok(r.valid,obj.id+JSON.stringify(r.issues));assert.ok(r.anchorId);
  if(obj.id==='door'){
   assert.ok(!r.issues.some(i=>i.code==='opening-size'));
   const undersized={...obj,footprint:{...obj.footprint,w:obj.footprint.w-.2}};
   const invalidSize=snap({...q,object:undersized},context(set,set.objects,undersized));
   assert.ok(invalidSize.issues.some(i=>i.code==='opening-size'));
  }
 }
});
