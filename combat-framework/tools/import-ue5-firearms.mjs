import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {forwardKinematics as fk, rotate, decodeAnimation} from '../src/anim/skeleton.mjs';
import {Q} from '../src/anim/inertial.mjs';
import {annotatePhases} from '../src/anim/phase.mjs';

// UE5.0 editor assets store the original FBoneAnimationTracks as tagged properties.
const pack=process.argv[2], data='public/data/combat';
const read=name=>JSON.parse(fs.readFileSync(path.join(data,name+'.json')));
const files=fs.readdirSync(pack,{recursive:true}).filter(file=>file.endsWith('.uasset'));
const byName=new Map(files.map(file=>[path.basename(file,'.uasset'),file]));
const ref=fs.readFileSync(path.join(pack,files.find(file=>file.replaceAll('\\','/').endsWith('/Mannequins/Meshes/SK_Mannequin.uasset'))));
const marker=ref.indexOf(Buffer.from('ffffffff05000000726f6f7400','hex'));
assert.ok(marker>12);
let offset=marker-8;
const count=ref.readInt32LE(offset-4),source=[];
for(let i=0;i<count;i++){
  const parent=ref.readInt32LE(offset+8),length=ref.readInt32LE(offset+12);
  assert.ok(parent<i && length>0 && length<128);
  source.push({parent,name:ref.toString('ascii',offset+16,offset+15+length)});
  offset+=16+length;
}
assert.equal(ref.readInt32LE(offset),count);
offset+=4;
for(const bone of source){
  const values=Array.from({length:10},(_,i)=>ref.readDoubleLE(offset+8*i));
  bone.rotation=values.slice(0,4);bone.translation=values.slice(4,7);
  offset+=80;
}

function rawTracks(file){
  const b=fs.readFileSync(path.join(pack,file));
  const summary=28+20*b.readInt32LE(24);
  const exportStart=b.readInt32LE(summary);
  const packageNameLength=b.readInt32LE(summary+4);
  const nameHeader=summary+12+packageNameLength;
  const names=[],nameCount=b.readInt32LE(nameHeader);
  let p=b.readInt32LE(nameHeader+4);
  for(let i=0;i<nameCount;i++){
    const n=b.readInt32LE(p);
    assert.ok(n>0 && n<2048);
    names.push(b.toString('utf8',p+4,p+3+n));p+=8+n;
  }
  function findTag(key,type,start){
    const signature=Buffer.alloc(16);
    signature.writeInt32LE(names.indexOf(key));signature.writeInt32LE(names.indexOf(type),8);
    const at=b.indexOf(signature,start);assert.ok(at>=start,key+' in '+file);
    return at;
  }
  const table=findTag('BoneAnimationTracks','ArrayProperty',exportStart);
  const n=b.readInt32LE(table+33),tracks=new Map();
  p=table;
  for(let i=0;i<n;i++){
    const track={};
    for(const [key,dim] of [['PosKeys',3],['RotKeys',4],['ScaleKeys',3]]){
      const at=findTag(key,'ArrayProperty',p),size=b.readInt32LE(at+16),keys=b.readInt32LE(at+33);
      p=at+33+size;
      const start=p-keys*dim*4;
      assert.ok(start>=at+37 && keys>0);
      if(key!=='ScaleKeys')track[key]=Array.from({length:keys},(_,f)=>Array.from({length:dim},(_,d)=>b.readFloatLE(start+(f*dim+d)*4)));
    }
    const at=findTag('Name','NameProperty',p);
    tracks.set(names[b.readInt32LE(at+25)],track);p=at+33;
  }
  const frames=b.readInt32LE(findTag('NumberOfKeys','IntProperty',p)+25);
  assert.equal(b.readInt32LE(findTag('Numerator','IntProperty',p)+25),30);
  return {tracks,frames};
}

const target=read('bones'),bones=target.bones;
const rest=b=>fk(b,b.map(x=>x.rotation),b.map(x=>x.translation));
const sr=rest(source),tr=rest(bones);
const index=name=>source.findIndex(b=>b.name===name);
const pos=name=>sr.positions[index(name)];
const hands=pos('hand_l').map((v,i)=>v-pos('hand_r')[i]);
const side=Math.abs(hands[0])>Math.abs(hands[1])?0:1,front=1-side;
const left=Math.sign(hands[side]),forward=Math.sign(pos('ball_l')[front]-pos('foot_l')[front]);
const convert=v=>[left*v[side],v[2],forward*v[front]];
const parity=(side===0?-1:1)*left*forward;
const convertQ=q=>[...convert(q).map(v=>parity*v),q[3]];
const alias={spine_02:'spine_03',spine_03:'spine_05',head:'head'};
const lookup=bones.map(b=>index(alias[b.name.toLowerCase()]??b.name.toLowerCase()));
assert.ok(lookup.every((j,i)=>j>=0||bones[i].name.includes('_leaf_')),'Unmapped target: '+bones.filter((_,i)=>lookup[i]<0).map(b=>b.name));
const scale=tr.positions[1][1]/pos('pelvis')[2];
const unit=v=>v.map(x=>x/Math.hypot(...v));
const delta=(a,b)=>a.map((v,i)=>v-b[i]);
const correction=bones.map((b,i)=>{
  const [part,side]=b.name.split('_');
  const tip={upperarm:'lowerarm',lowerarm:'hand',hand:'middle_01',thigh:'calf',calf:'foot',foot:'ball'}[part];
  if(!tip)return [0,0,0,1];
  const child=bones.findIndex(b=>b.name===tip+'_'+side);
  const a=unit(delta(tr.positions[child],tr.positions[i])),c=unit(convert(delta(sr.positions[lookup[child]],sr.positions[lookup[i]])));
  return Q.norm([a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0],1+a.reduce((s,v,k)=>s+v*c[k],0)]);
});

const pistol={Shoot:'aim_fire',Reload:'aim_reload',Idle_Loop:'stand_idle',Aim_Up:'front_up',Aim_Down:'front_down',Aim_Neutral:'front_center'};
const longGun={Idle:'aim_idle',Walk:'aim_walk_fwd_loop',Run:'jog_fwd_loop',Aim_Run:'jog_fwd_loop',Strafe_Forward:'aim_walk_fwd_loop',Strafe_Back:'aim_walk_bwd_loop',Strafe_Left:'aim_walk_left_loop',Strafe_Right:'aim_walk_right_loop',Aim_Up:'front_up',Aim_Down:'front_down',Aim_Center:'front_center'};
const rifle={Idle:'stand_idle',Walk:'walk_fwd_loop',Run:'jog_fwd_loop',CrouchWalk:'crouch_fwd_loop',Fire:'aim_fire',Hold:'aim_idle',Reload:'aim_reload'};
const base=read('animations'),runtime=read('runtime-animations'),tps=read('tps-longgun'),unv=read('unv-rifle');
if(!unv.some(c=>c.id==='Unv_Rifle_Reload'))unv.push({id:'Unv_Rifle_Reload',loop:false});
const outputs=new Map();
for(const [group,prefix,map,weapon] of [[base.clips,'Pistol_',pistol,'pistol'],[tps,'TPS_LongGun_',longGun,'m4a1'],[unv,'Unv_Rifle_',rifle,'m4a1']]){
  for(const entry of group.filter(c=>c.id.startsWith(prefix))){
    const file=byName.get('anim_'+weapon+'_'+map[entry.id.slice(prefix.length)]);
    assert.ok(file,entry.id);
    const raw=rawTracks(file),frames=Math.max(2,raw.frames),n=bones.length;
    const bin=Buffer.alloc(23+frames*(7*n+3)*4);
    bin.write('ANIM');bin.writeUInt16LE(1,4);bin.writeUInt32LE(target.skeletonId,6);bin.writeUInt16LE(n,10);bin.writeUInt32LE(frames,12);bin.writeFloatLE(30,16);bin[20]=Number(entry.loop);
    const landmarks=[];
    for(let f=0;f<frames;f++){
      function sample(b,key,rest){
        const keys=raw.tracks.get(b.name)?.[key];if(!keys)return rest;
        assert.ok(keys.length===1||keys.length===raw.frames);
        return keys[Math.min(keys.length-1,f)];
      }
      const pose=fk(source,source.map(b=>sample(b,'RotKeys',b.rotation)),source.map(b=>sample(b,'PosKeys',b.translation)));
      const world=[],rot=[],trans=[];
      for(const [i,b] of bones.entries()){
        const j=lookup[i],parent=b.parent<0?[0,0,0,1]:world[b.parent];
        world[i]=j<0?Q.mul(parent,b.rotation):Q.norm(Q.mul(convertQ(Q.mul(pose.rotations[j],Q.conj(sr.rotations[j]))),Q.mul(correction[i],tr.rotations[i])));
        rot[i]=Q.norm(Q.mul(Q.conj(parent),world[i]));
        trans[i]=b.translation;
        if(b.name==='pelvis'){
          const d=convert(delta(pose.positions[j],sr.positions[j]));
          trans[i]=rotate(Q.conj(parent),tr.positions[i].map((v,k)=>v+scale*d[k]-tr.positions[b.parent][k]));
        }
        rot[i].forEach((v,k)=>bin.writeFloatLE(v,21+4*((f*n+i)*4+k)));
        trans[i].forEach((v,k)=>bin.writeFloatLE(v,21+4*(frames*n*4+(f*n+i)*3+k)));
      }
      if(group===base.clips){
        const {positions}=fk(bones,rot,trans);
        landmarks.push(Object.fromEntries(Object.keys(entry.landmarks[0]).map(name=>[name,positions[bones.findIndex(b=>b.name===name)]])));
      }
    }
    decodeAnimation(bin.buffer.slice(bin.byteOffset,bin.byteOffset+bin.byteLength));
    outputs.set(entry.id,bin);
    Object.assign(entry,{source:file.replaceAll('\\','/'),frames,duration:(frames-1)/30});
    if(group===base.clips){
      entry.landmarks=landmarks;
      Object.assign(runtime.clips.find(c=>c.id===entry.id),annotatePhases(entry));
    }
    console.log(entry.id,frames);
  }
}
for(const [id,bin] of outputs)fs.writeFileSync(path.join(data,'anim',id+'.bin'),bin);
for(const [name,content] of Object.entries({'animations':base,'runtime-animations':runtime,'unv-rifle':unv,'tps-longgun':tps}))
  fs.writeFileSync(path.join(data,name+'.json'),JSON.stringify(content,null,Array.isArray(content)?2:undefined));

