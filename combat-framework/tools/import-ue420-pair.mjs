import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Q} from '../src/anim/inertial.mjs';
import {forwardKinematics as fk,rotate,slerp,decodeAnimation,sampleAnimation} from '../src/anim/skeleton.mjs';

// Editor assets, UE 4.20: read reference transforms and uncompressed raw tracks.
const [skeletonFile,...animations]=process.argv.slice(2);
const ref=fs.readFileSync(skeletonFile);
const target=JSON.parse(fs.readFileSync('public/data/combat/bones.json'));
const floats=(b,o,n)=>Array.from({length:n},(_,i)=>b.readFloatLE(o+4*i));
// Reference records include a parent index and export name.
const marker=Buffer.from('ffffffff05000000726f6f7400','hex');
let offset=ref.indexOf(marker)-8;
assert.ok(offset>0);
const count=ref.readInt32LE(offset-4),source=[];
for(let i=0;i<count;i++){
  const parent=ref.readInt32LE(offset+8),size=ref.readInt32LE(offset+12);
  assert.ok(parent<i && size>0 && size<100);
  source.push({parent,name:ref.toString('ascii',offset+16,offset+15+size)});
  offset+=16+size;
}
assert.equal(ref.readInt32LE(offset),count);offset+=4;
for(const b of source){b.rotation=Q.norm(floats(ref,offset,4));b.translation=floats(ref,offset+16,3);offset+=40;}
const rest=bones=>fk(bones,bones.map(b=>b.rotation),bones.map(b=>b.translation));
const sr=rest(source),tr=rest(target.bones);
const lookup=target.bones.map(b=>source.findIndex(s=>s.name.toLowerCase()===b.name.toLowerCase()));
const bone=(name)=>sr.positions[source.findIndex(b=>b.name===name)];
const lateral=bone('hand_l')[0]>bone('hand_r')[0]?1:-1;
const forward=bone('ball_l')[1]>bone('foot_l')[1]?1:-1;
const convert=v=>[lateral*v[0],v[2],forward*v[1]];
const parity=-lateral*forward;
const convertQ=q=>[...convert(q).map(v=>v*parity),q[3]];
// Compensate for the different reference arm spreads while preserving axial twist.
const aimChildren={upperarm:'lowerarm',lowerarm:'hand',hand:'middle_01',thigh:'calf',calf:'foot',foot:'ball'};
const unit=v=>{const length=Math.hypot(...v);return v.map(x=>x/length)};
const correction=target.bones.map((b,i)=>{
  const match=/^(.*)_([lr])$/.exec(b.name);
  if(!match||!aimChildren[match[1]])return [0,0,0,1];
  const child=aimChildren[match[1]]+'_'+match[2],k=target.bones.findIndex(b=>b.name===child),j=source.findIndex(b=>b.name===child);
  if(k<0||j<0)return [0,0,0,1];
  const a=unit(tr.positions[k].map((v,d)=>v-tr.positions[i][d]));
  const c=unit(convert(sr.positions[j].map((v,d)=>v-sr.positions[lookup[i]][d])));
  return Q.norm([a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0],1+a.reduce((sum,v,d)=>sum+v*c[d],0)]);
});
const scale=tr.positions[1][1]/sr.positions[1][2];
const idleBytes=Uint8Array.from(fs.readFileSync('public/data/combat/anim/Idle_Loop.bin'));
const neutral=sampleAnimation(decodeAnimation(idleBytes.buffer),0,false);
for(const [role,file] of animations.entries()){
  const b=fs.readFileSync(file);
  let o=b.indexOf(Buffer.from('/Game/'))-4;
  const names=[];
  while(o+8<b.length){const len=b.readInt32LE(o);if(len<=0||len>512||b[o+3+len]!==0)break;names.push(b.toString('ascii',o+4,o+3+len));o+=len+8;}
  const signature=Buffer.alloc(16);signature.writeInt32LE(names.indexOf('root'));signature.writeInt32LE(names.indexOf('pelvis'),8);
  const table=b.indexOf(signature);assert.equal(b.readInt32LE(table-4),count);
  const ordered=source.map((_,i)=>names[b.readInt32LE(table+8*i)]);
  const raw=Buffer.alloc(8);raw.writeInt32LE(count);raw.writeInt32LE(12,4);
  o=b.indexOf(raw,table);assert.ok(o>table);o+=4;
  const tracks=new Map();
  function keys(dim){assert.equal(b.readInt32LE(o),dim*4);const n=b.readInt32LE(o+4);assert.ok(n>=0&&n<=1000);o+=8;return Array.from({length:n},()=>{const v=floats(b,o,dim);o+=4*dim;return v;});}
  for(const name of ordered)tracks.set(name,{p:keys(3),q:keys(4),s:keys(3)});
  const frames=Math.max(...[...tracks.values()].map(t=>Math.max(t.p.length,t.q.length)));
  const quat=[],trans=[],key=(arr,f,fallback)=>arr[f]??arr[0]??fallback;
  for(let frame=0;frame<frames;frame++){
    const pose=fk(source,source.map(s=>Q.norm(key(tracks.get(s.name).q,frame,s.rotation))),source.map(s=>key(tracks.get(s.name).p,frame,s.translation)));
    const world=[];
    for(const [i,t] of target.bones.entries()){
      const j=lookup[i],parent=t.parent<0?[0,0,0,1]:world[t.parent];
      world[i]=j<0?Q.mul(parent,t.rotation):Q.mul(convertQ(Q.mul(pose.rotations[j],Q.conj(sr.rotations[j]))),Q.mul(correction[i],tr.rotations[i]));
      let local=Q.norm(Q.mul(Q.conj(parent),world[i]));
      if(t.name==='hand_l'){
        const rest=neutral.rotations[i];
        const angle=2*Math.acos(Math.min(1,Math.abs(Q.mul(Q.conj(rest),local)[3])));
        local=slerp(rest,local,Math.min(1,.85/Math.max(angle,1e-6)));
      }
      if(/^(thumb|index|middle|ring|pinky)_.*_l$/.test(t.name))local=neutral.rotations[i];
      world[i]=Q.mul(parent,local);
      quat.push(...local);
      let p=t.translation;
      if(t.name==='pelvis'){
        const delta=convert(pose.positions[j].map((v,k)=>v-sr.positions[j][k]));
        const pos=tr.positions[i].map((v,k)=>v+scale*delta[k]-tr.positions[t.parent][k]);
        p=rotate(Q.conj(parent),pos);
      }
      trans.push(...p);
    }
  }
  // Editorial pass: one continuous arm gesture over the repeated accents of B1.
  const variant=/Char[AB]_(Knife|Hands|Axe|Bat)_B1/.exec(path.basename(file))[1];
  const suffix=variant==='Knife'?'':'_'+variant;
  if(role===0 && variant==='Knife'){
    const joints=target.bones.flatMap((bone,i)=>/^(clavicle|upperarm|lowerarm|hand)_r$/.test(bone.name)?[i]:[]);
    const anchors=[22,36,77];
    for(const j of joints){
      const at=f=>(f*target.bones.length+j)*4;
      const poses=anchors.map(f=>quat.slice(at(f),at(f)+4));
      for(let segment=0;segment<2;segment++)for(let f=anchors[segment];f<=anchors[segment+1];f++){
        const t=(f-anchors[segment])/(anchors[segment+1]-anchors[segment]);
        const rotation=slerp(poses[segment],poses[segment+1],t*t*(3-2*t));
        for(let k=0;k<4;k++)quat[at(f)+k]=rotation[k];
      }
    }
  }
  assert.ok(quat.every(Number.isFinite)&&trans.every(Number.isFinite));
  const bones=target.bones.length,out=Buffer.alloc(23+frames*(bones*7+3)*4);
  out.write('ANIM');out.writeUInt16LE(1,4);out.writeUInt32LE(target.skeletonId,6);out.writeUInt16LE(bones,10);out.writeUInt32LE(frames,12);out.writeFloatLE(30,16);
  let cursor=21;for(const values of [quat,trans])for(const v of values){out.writeFloatLE(v,cursor);cursor+=4;}
  fs.writeFileSync(path.join('public/data/combat/anim',(role?'Enemy_StealthVictim':'Player_StealthKill')+suffix+'.bin'),out);
  console.log(path.basename(file),{frames,mapped:lookup.filter(i=>i>=0).length,tracks:tracks.size,lateral,forward});
}
