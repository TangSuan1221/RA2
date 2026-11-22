import {decodeAnimation,sampleAnimation} from '../src/anim/skeleton.mjs';

import {toolNames,pairIds} from '../src/combat/execution-tools.mjs';
import {diveId,makeDive} from '../src/anim/dive.mjs';
async function resource(path,type){
  const response=await fetch('/data/combat/'+path);
  if(!response.ok)throw new Error(path+' '+response.status);
  return response[type]();
}
export async function gameClips(){
  const [runtime,longGun,rifle]=await Promise.all(['runtime-animations','tps-longgun','unv-rifle'].map(id=>resource(id+'.json','json')));
  const executions=Object.entries(toolNames).flatMap(([tool,label])=>
    pairIds(tool).map((id,i)=>({id,label:label+'处决 · '+(i===0?'玩家':'哨兵')+' · '+id})));
  return [...runtime.clips,...longGun,...rifle,{id:diveId},...executions];
}
export async function loadGameClip(id,bones){
  if(id===diveId){
    const sources=await Promise.all(['Idle_Loop','Prone_Crawl_Forward','Pistol_Aim_Neutral'].map(name=>loadGameClip(name)));
    return makeDive(bones,...sources);
  }
  return decodeAnimation(await resource('anim/'+encodeURIComponent(id)+'.bin','arrayBuffer'));
}
export function applyGamePose(bones,clip,time,loop){
  const pose=sampleAnimation(clip,time,loop);
  bones.forEach((bone,i)=>{
    bone.position.fromArray(pose.translations[i]);
    bone.quaternion.fromArray(pose.rotations[i]);
  });
}
