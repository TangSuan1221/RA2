import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createLocomotionDatabase} from '../src/anim/locomotion.mjs';
import {encodeMMDB,decodeMMDB} from '../src/anim/database.mjs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
import {annotatePhases} from '../src/anim/phase.mjs';
const dir='public/data/combat',base=JSON.parse(await fs.readFile(dir+'/animations.json')),cmu=JSON.parse(await fs.readFile(dir+'/cmu-animations.json')),accepted=[],excluded=[];
for(const c of cmu.clips){const invalid=new Set();for(let f=1;f<c.frames;f++){const speed=Math.hypot(c.rootPath[f][0]-c.rootPath[f-1][0],c.rootPath[f][2]-c.rootPath[f-1][2])*30;if(speed>12){for(let j=Math.max(0,f-1);j<=Math.min(c.frames-1,f+1);j++)invalid.add(j);excluded.push({clip:c.id,frame:f,speed,reason:'root speed exceeds 12 m/s; adjacent samples excluded'});}}
  if(!invalid.size){accepted.push(c);continue;}
  const bytes=await fs.readFile(dir+'/anim/'+c.id+'.bin'),clip=decodeAnimation(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));let start=0,part=0;
  while(start<c.frames){while(invalid.has(start))start++;let end=start;while(end<c.frames&&!invalid.has(end))end++;if(end-start>=2){const frames=end-start,id=c.id+'_segment'+part++,next={...c,id,frames,duration:(frames-1)/30,sourceSampleRange:[start,end],landmarks:c.landmarks.slice(start,end),rootPath:c.rootPath.slice(start,end),headings:c.headings.slice(start,end)};const q=clip.quat.subarray(start*clip.bones*4,end*clip.bones*4),t=clip.trans.subarray(start*clip.bones*3,end*clip.bones*3),root=clip.rootDelta.slice(start*3,end*3);root.fill(0,0,3);const out=Buffer.alloc(23+(q.length+t.length+root.length)*4);out.write('ANIM');out.writeUInt16LE(1,4);out.writeUInt32LE(clip.skeletonId,6);out.writeUInt16LE(clip.bones,10);out.writeUInt32LE(frames,12);out.writeFloatLE(30,16);out.writeUInt8(0,20);let p=21;for(const values of [q,t])for(const x of values){out.writeFloatLE(x,p);p+=4;}out.writeUInt16LE(0,p);p+=2;for(const x of root){out.writeFloatLE(x,p);p+=4;}await fs.writeFile(dir+'/anim/'+id+'.bin',out);accepted.push(next);}start=end+1;}
}
const sourceIndex=await fs.readFile('combat-framework/assets-source/CMU-113-128/cmu-mocap-index-text.txt','utf8'),descriptions=new Map([...sourceIndex.matchAll(/^(\d{2,3}_\d+)\s+([^\r\n]+)/gm)].map(m=>[m[1],m[2]])),tagging=[];
for(const clip of accepted){const sourceId=clip.id.slice(4).split('_segment')[0],description=descriptions.get(sourceId)||'',speeds=clip.rootPath.slice(1).map((p,i)=>Math.hypot(p[0]-clip.rootPath[i][0],p[2]-clip.rootPath[i][2])*30),meanSpeed=speeds.reduce((a,b)=>a+b,0)/Math.max(1,speeds.length),mixed=/stop|walk.*run|run.*walk/i.test(description);
 if(!mixed&&/walk|stride/i.test(description))clip.locomotionTag=1;
 else if(!mixed&&/run|jog/i.test(description))clip.locomotionTag=meanSpeed<4.48?2:3;
 clip.sourceDescription=description;clip.tagging={method:clip.locomotionTag===undefined?'instantaneous-transition-provisional':'source-semantics-and-path-mean-speed',meanSpeed};tagging.push({id:clip.id,description,tag:clip.locomotionTag??'per-frame',...clip.tagging});
}
await fs.writeFile('combat-framework/evidence/mm-tagging.json',JSON.stringify(tagging,null,2));
const extra=JSON.parse(await fs.readFile(dir+'/extra-animations.json'));
const manifest={...base,clips:[...base.clips,...accepted,...extra.clips].map(annotatePhases)},db=createLocomotionDatabase(manifest),binary=encodeMMDB(db);decodeMMDB(binary,db.sourceClips);
await fs.writeFile(dir+'/runtime-animations.json',JSON.stringify(manifest));await fs.writeFile(dir+'/locomotion.mmdb',new Uint8Array(binary));
const report={schemaVersion:1,source:'CMU measured root + Quaternius in-place authored root calibration',frameCount:db.count,measuredFrames:db.measuredFrameCount,clipCount:db.clips.length,uniqueSourceFrames:db.count,mirroredFrames:0,syntheticFrames:0,excluded,kdNodes:db.tree.nodes.length,sha256:crypto.createHash('sha256').update(new Uint8Array(binary)).digest('hex'),minimum6000:db.count>=6000,remainingGates:['phase cycles reliable only for a subset; contacts are estimated','no mirrored turn augmentation','visual foot sliding/turning metrics not yet certified']};await fs.writeFile('combat-framework/evidence/mm-bake.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
