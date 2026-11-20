import fs from 'node:fs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
import {decodeMMDB} from '../src/anim/database.mjs';
import {World} from '../src/world.mjs';
import {Q} from '../src/anim/inertial.mjs';
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),manifest=JSON.parse(fs.readFileSync('public/data/combat/runtime-animations.json')),skeleton=JSON.parse(fs.readFileSync('public/data/combat/bones.json')),db=decodeMMDB(ab(fs.readFileSync('public/data/combat/locomotion.mmdb')),manifest.clips),clips=new Map(manifest.clips.map(c=>[c.id,decodeAnimation(ab(fs.readFileSync(`public/data/combat/anim/${c.id}.bin`)))]));
const w=new World({enemyCount:0,obstacles:[]});w.setAnimationDatabase(db,manifest);w.setSkeletonAnimations(skeleton.bones,clips);const samples=[];
for(let step=0;step<1050;step++){
 w.update({z:step<400?1:step<800?-1:0,x:step>=800&&step<1000?1:0});const a=w.player;
 if(step>=998)samples.push({step,pos:[...a.pos],velocity:[...a.vel],clip:a.clip,time:a.clipTime,feet:['l','r'].map(side=>({side,position:w.bonePosition(a,'foot_'+side),lock:structuredClone(a.footLocks?.[side]),probe:a.footProbes?.[side]})),contact:w.animationClips.get(a.clip)?.contactOfFrame?.[Math.floor(a.clipTime*30)]});
}
fs.writeFileSync('combat-framework/evidence/stop-foot-diagnostic.json',JSON.stringify(samples,null,2));
console.log(JSON.stringify(samples.filter(s=>[1000,1008,1014,1022,1030].includes(s.step))));

