import {ActionStateMachine} from '../../combat-framework/render/action-state-machine.mjs';
import {fitStandingCharacter} from '../../combat-framework/render/pose.mjs';
import {loadGameClip} from '../../combat-framework/render/game-clip-library.mjs';
import * as T from 'three';

import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export function metricMaterial(color) {
  const tile=document.createElement('canvas');
  tile.width=tile.height=128;
  const ctx=tile.getContext('2d');
  ctx.fillStyle=color;ctx.fillRect(0,0,128,128);
  ctx.fillStyle='#aaaaaa';ctx.fillRect(64,0,1,128);ctx.fillRect(0,64,128,1);
  ctx.fillStyle='#cecece';ctx.fillRect(0,0,2,128);ctx.fillRect(0,0,128,2);
  const map=new T.CanvasTexture(tile);
  map.wrapS=map.wrapT=T.RepeatWrapping;map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
  return new T.MeshStandardMaterial({map,roughness:1});
}

// Project each face onto world axes so adjoining segments share the ruler.
export function metricUV(geometry,x,y,z,yaw=0){
  const {position,normal,uv}=geometry.attributes;
  for(let i=0;i<position.count;i++){
    const c=Math.cos(yaw),s=Math.sin(yaw),lx=position.getX(i),lz=position.getZ(i);
    const X=x+c*lx+s*lz,Y=y+position.getY(i),Z=z-s*lx+c*lz;
    uv.setXY(i,Math.abs(Math.cos(yaw)*normal.getX(i)+Math.sin(yaw)*normal.getZ(i))>.5?Z:X,Math.abs(normal.getY(i))>.5?Z:Y);
  }
}

export function createWalker(){
  const group=new T.Group();
  function limb(parent,x,y,z,length,r,color){
    const pivot=new T.Group();pivot.position.set(x,y,z);parent.add(pivot);
    const mesh=new T.Mesh(new T.CapsuleGeometry(r,Math.max(.01,length-2*r),4,10),new T.MeshStandardMaterial({color}));
    mesh.position.y=-length/2;pivot.add(mesh);return pivot;
  }
  const jacket=0x285565, trousers=0x313a42;
  limb(group,0,1.51,0,.62,.21,jacket);
  limb(group,0,1.76,0,.27,.13,0xc49e82);
  const legs=[],arms=[];
  for(const side of [-1,1]){
    legs.push(limb(group,side*.125,.91,0,.91,.098,trousers));
    arms.push(limb(group,side*.235,1.45,0,.59,.078,jacket));
  }
  const placeholder=[...group.children];
  const status=document.querySelector('#motion-status');
  const names=['Idle_Loop','Walk_Loop','Sprint_Loop','Walk_Carry_Loop','Push_Loop','Crouch_Idle_Loop','Crouch_Fwd_Loop','Interact','Jump_Loop','Jump_Land','Roll','Safety_Vault','Prone_Crawl_Forward','Crouch_To_Prone'];
  let machine,rateFor,event=null,restart=false,previousCrouch=false;
  const ready=Promise.all([new GLTFLoader().loadAsync('/assets/combat/character-female.glb'),
    fetch('/data/combat/bones.json').then(r=>r.json()),
    Promise.all(names.map(async name=>[name,await loadGameClip(name)])),
    import('../../combat-framework/render/action-rates.mjs')]).then(([asset,rig,entries,rates])=>{
    const model=asset.scene,bones=rig.bones.map(b=>model.getObjectByName(b.name));
    if(bones.some(b=>!b)||entries.some(([,clip])=>clip.skeletonId!==rig.skeletonId||clip.bones!==bones.length))throw Error('骨架不匹配');
    rateFor=rates.rateFor;
    fitStandingCharacter(model,asset.animations);
    model.rotation.y=Math.PI;group.add(model);
    machine=new ActionStateMachine(model,bones,new Map(entries),{onFinished:()=>{event=null;}});
    for(const part of placeholder)part.visible=false;
  }).catch(e=>status.textContent='动作库加载失败：'+e.message);
  return {group,ready,trigger(name){event=name;restart=true;},animate(distance,bearing,state,dt){
    const moving=distance>.0001;
    if(moving)group.rotation.y=bearing;
    if(!machine)return;
    const exitingProne=event==='@proneExit';
    if(moving && !exitingProne && event!=='Crouch_To_Prone' && event!=='Roll')event=null;
    const name=state.vault?'Safety_Vault':exitingProne?'Crouch_To_Prone':event||(state.air?'Jump_Loop':state.prone?'Prone_Crawl_Forward':state.crouch?(moving?'Crouch_Fwd_Loop':'Crouch_Idle_Loop'):
      !moving?'Idle_Loop':state.push?'Push_Loop':state.carry?'Walk_Carry_Loop':distance/dt>3?'Sprint_Loop':'Walk_Loop');
    const duration=state.crouch===previousCrouch?.18:.18/rateFor(state.crouch?'@crouch':'@stand');
    machine.transitionTo(name,{loop:!event&&!state.vault,restart:restart&&!!event,
      startTime:exitingProne?machine.getClip(name).duration:0,duration});
    previousCrouch=state.crouch;restart=false;
    machine.current.timeScale=state.prone&&!moving&&!event?0:exitingProne?-rateFor('@proneExit'):rateFor(name);
    machine.update(dt);status.textContent=name;
  }};
}

// Flood a layered 0.5 m grid. Height is part of the key at overlapping floors.
export function routeTo(start,target,step){
  const snap=v=>Math.round(v*2)/2;
  const root={x:snap(start.x),y:start.y,z:snap(start.z),parent:null};
  const key=n=>n.x+','+Math.round(n.y*10)+','+n.z;
  const seen=new Set([key(root)]),queue=[root];
  for(let i=0;i<queue.length&&i<20000;i++){
    const n=queue[i];
    if(Math.hypot(n.x-target.x,n.z-target.z)<1.25&&Math.abs(n.y-target.y)<1){
      const path=[];for(let a=n;a;a=a.parent)path.push(new T.Vector3(a.x,a.y+.06,a.z));
      return path.reverse();
    }
    for(const [dx,dz] of [[.5,0],[-.5,0],[0,.5],[0,-.5]]){
      const x=n.x+dx,z=n.z+dz,y=step(n,x,z);
      if(y===null)continue;
      const next={x,y,z,parent:n},id=key(next);
      if(!seen.has(id)){seen.add(id);queue.push(next)}
    }
  }
  return [];
}

