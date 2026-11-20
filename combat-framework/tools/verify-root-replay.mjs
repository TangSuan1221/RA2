import {FixedLoop} from '../src/core/loop.mjs';
import crypto from 'node:crypto';
import {evidenceStamp} from './evidence-stamp.mjs';
import fs from 'node:fs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
import {decodeMMDB} from '../src/anim/database.mjs';
import {World} from '../src/world.mjs';
import {Q} from '../src/anim/inertial.mjs';
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),manifest=JSON.parse(fs.readFileSync('public/data/combat/runtime-animations.json')),skeleton=JSON.parse(fs.readFileSync('public/data/combat/bones.json')),db=decodeMMDB(ab(fs.readFileSync('public/data/combat/locomotion.mmdb')),manifest.clips),clips=new Map(manifest.clips.map(c=>[c.id,decodeAnimation(ab(fs.readFileSync(`public/data/combat/anim/${c.id}.bin`)))]));
const stampBefore=await evidenceStamp(),results=[];
for(const hz of [30,60,144]){
 const w=new World({enemyCount:8,obstacles:[]});w.setAnimationDatabase(db,manifest);w.setSkeletonAnimations(skeleton.bones,clips);
 const loop=new FixedLoop((dt,step)=>{const angle=step*.009;w.update({x:Math.sin(angle),z:Math.cos(angle),sprint:step<180,commands:step===200?['light']:step===300?['dodge']:[]},dt);});
 for(let frame=0;frame<hz*10;frame++)loop.advance(1/hz);
 const state={snapshot:w.snapshot(),poses:[w.player,...w.enemies].map(a=>({pose:a.pose,root:a.rootHandoff,selected:a.selectedMotion,phase:a.matcher.gaitPhase}))};
 results.push({hz,steps:w.step,overrun:loop.overrun,hash:crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex')});
}
const result={...stampBefore,inputUnchanged:stampBefore.inputHash===(await evidenceStamp()).inputHash,scope:'10s deterministic fixed-clock replay; 8 AI, real ANIM/MMDB/FK/IK/root arbitration, empty collision fixture; not performance evidence',results,pass:results.every(r=>r.steps===600&&r.overrun===0&&r.hash===results[0].hash)};
fs.writeFileSync('combat-framework/evidence/root-fixed-replay.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.pass||!result.inputUnchanged)process.exitCode=1;
