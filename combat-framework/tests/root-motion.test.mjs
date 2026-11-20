import test from 'node:test';import assert from 'node:assert/strict';
import {integrateRoot,arbitrateRoot} from '../src/character/root-motion.mjs';
const clip={frames:4,fps:30,duration:.1,loop:false,rootDelta:new Float32Array([0,0,0,1,0,0,2,0,0,3,0,0])};
test('root integration preserves interval sums under 60Hz subdivision and loop seams',()=>{
 const total=[0,0,0];for(let i=0;i<6;i++){const d=integrateRoot(clip,i/60,(i+1)/60);d.forEach((v,j)=>total[j]+=v);}assert.ok(Math.abs(total[0]-6)<1e-9);
 assert.ok(Math.abs(integrateRoot({...clip,loop:true},.075,.125)[0]-3)<1e-9);assert.deepEqual(integrateRoot(clip,.1,.2),[0,0,0]);
});
test('root handoff takes eight fixed steps and prevents reversal during its window',()=>{
 const state={weight:0},args={speed:0,motorDelta:[.02,0,0],rootDelta:[.01,0,0],dt:1/60};
 for(let i=0;i<7;i++)arbitrateRoot(state,args);assert.ok(state.weight<1);arbitrateRoot(state,args);assert.equal(state.weight,1);
 const other={weight:0};arbitrateRoot(other,args);const before=other.weight;arbitrateRoot(other,{...args,speed:5.6});assert.equal(other.weight,before);
});
test('exclusive root and warp modes clamp one combined displacement to 22cm',()=>{
 const args={speed:0,motorDelta:[99,0,0],rootDelta:[0,0,.1],warpDelta:[0,.5,0],dt:1/60};
 assert.deepEqual(arbitrateRoot({}, {...args,mode:'rootMotion'}).delta,[0,0,.1]);
 const warp=arbitrateRoot({}, {...args,mode:'warp'});assert.equal(warp.clamped,true);assert.deepEqual(warp.delta,[0,.22,0]);
});

test('loop integration terminates at floating point period multiples and negative boundaries',()=>{
 const looping={...clip,loop:true};assert.ok(Math.abs(integrateRoot(looping,.5,.55)[0]-2)<1e-9);
 assert.ok(Math.abs(integrateRoot(looping,-.1,0)[0]-6)<1e-9);
 assert.ok(Math.abs(integrateRoot(looping,0,100)[0]-6000)<1e-8);
});

test('real CMU root intervals conserve recorded path displacement',async()=>{
 const fs=await import('node:fs'),{decodeAnimation}=await import('../src/anim/skeleton.mjs');
 const manifest=JSON.parse(fs.readFileSync('public/data/combat/runtime-animations.json'));
 for(const meta of manifest.clips.filter(c=>c.measuredRoot)){
  const bytes=fs.readFileSync('public/data/combat/anim/'+meta.id+'.bin'),decoded=decodeAnimation(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  const total=integrateRoot(decoded,0,decoded.duration),expected=meta.rootPath.at(-1).map((v,i)=>v-meta.rootPath[0][i]);
  for(let i=0;i<3;i++)assert.ok(Math.abs(total[i]-expected[i])<1e-5,meta.id+' axis '+i);
 }
});
