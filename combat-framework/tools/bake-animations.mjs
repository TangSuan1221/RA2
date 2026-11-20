import fs from 'node:fs/promises';
import {slerp,forwardKinematics} from '../src/anim/skeleton.mjs';
const source='public/assets/combat/character-female.glb',out='public/data/combat';
const bytes=await fs.readFile(source),jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+jsonLength)),binaryStart=20+jsonLength+8;
const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
function accessor(id){const a=gltf.accessors[id],v=gltf.bufferViews[a.bufferView];if(a.componentType!==5126||a.sparse)throw Error('Baker only accepts dense float32 animation accessors');const n=widths[a.type],stride=v.byteStride||n*4,base=binaryStart+(v.byteOffset||0)+(a.byteOffset||0),result=[];for(let i=0;i<a.count;i++){const row=[];for(let j=0;j<n;j++)row.push(bytes.readFloatLE(base+i*stride+j*4));result.push(row);}return result;}
const jointNodes=gltf.skins[0].joints,parents=new Map();gltf.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>parents.set(c,i)));
const bones=jointNodes.map((id,i)=>({id:i,name:gltf.nodes[id].name,parent:jointNodes.indexOf(parents.get(id)),rotation:gltf.nodes[id].rotation||[0,0,0,1],translation:gltf.nodes[id].translation||[0,0,0]}));
const hash=s=>{let n=2166136261;for(const c of new TextEncoder().encode(s)){n^=c;n=Math.imul(n,16777619);}return n>>>0;};const skeletonId=hash('Combat_Female');
await fs.mkdir(out+'/anim',{recursive:true});await fs.writeFile(out+'/bones.json',JSON.stringify({schemaVersion:1,skeletonId,bones},null,2));const manifest=[];
for(const animation of gltf.animations){
  const channels=animation.channels.map(c=>{const s=animation.samplers[c.sampler];if(!['LINEAR','STEP',undefined].includes(s.interpolation))throw Error('Unsupported interpolation');return {bone:jointNodes.indexOf(c.target.node),path:c.target.path,times:accessor(s.input).map(v=>v[0]),values:accessor(s.output),interpolation:s.interpolation};}).filter(c=>c.bone>=0&&c.path!=='scale');
  const duration=Math.max(...channels.map(c=>c.times.at(-1))),frames=Math.floor(duration*30+1e-4)+1,quat=new Float32Array(frames*bones.length*4),trans=new Float32Array(frames*bones.length*3),rootDelta=new Float32Array(frames*3),landmarks=[];let lastRoot=null;
  for(let f=0;f<frames;f++){const t=f/30,rotations=bones.map(b=>b.rotation.slice()),translations=bones.map(b=>b.translation.slice());for(const c of channels){let low=0,hi=c.times.length-1;while(low+1<hi){const mid=(low+hi)>>1;if(c.times[mid]<=t)low=mid;else hi=mid;}const blend=c.interpolation==='STEP'?0:Math.max(0,Math.min(1,(t-c.times[low])/(c.times[hi]-c.times[low]||1)));const value=c.path==='rotation'?slerp(c.values[low],c.values[hi],blend):c.values[low].map((v,j)=>v+(c.values[hi][j]-v)*blend);if(c.path==='rotation')rotations[c.bone]=value;else if(c.path==='translation')translations[c.bone]=value;}
    for(let b=0;b<bones.length;b++){quat.set(rotations[b],(f*bones.length+b)*4);trans.set(translations[b],(f*bones.length+b)*3);}const pose=forwardKinematics(bones,rotations,translations),root=pose.positions[0];if(lastRoot)rootDelta.set(root.map((v,j)=>v-lastRoot[j]),f*3);lastRoot=root;
    landmarks.push(Object.fromEntries(['root','pelvis','Head','hand_l','hand_r','foot_l','foot_r'].map(name=>[name,pose.positions[bones.findIndex(b=>b.name===name)]])));
  }
  const data=Buffer.alloc(21+(quat.length+trans.length+rootDelta.length)*4+2);data.write('ANIM');data.writeUInt16LE(1,4);data.writeUInt32LE(skeletonId,6);data.writeUInt16LE(bones.length,10);data.writeUInt32LE(frames,12);data.writeFloatLE(30,16);const loop=/Loop|Idle/.test(animation.name);data.writeUInt8(loop?1:0,20);let cursor=21;for(const a of [quat,trans])for(const v of a){data.writeFloatLE(v,cursor);cursor+=4;}data.writeUInt16LE(0,cursor);cursor+=2;for(const v of rootDelta){data.writeFloatLE(v,cursor);cursor+=4;}
  await fs.writeFile(`${out}/anim/${animation.name}.bin`,data);manifest.push({id:animation.name,frames,duration:(frames-1)/30,loop,source,landmarks});
}
await fs.writeFile(out+'/animations.json',JSON.stringify({schemaVersion:1,skeletonId,sampleHz:30,boneCount:bones.length,clips:manifest}));console.log(JSON.stringify({clips:manifest.length,frames:manifest.reduce((n,c)=>n+c.frames,0),bones:bones.length,output:out}));
