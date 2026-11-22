import {sampleAnimation,slerp,forwardKinematics} from './skeleton.mjs';

import {applyHandContact} from './hand-ik.mjs';
import {Q} from './inertial.mjs';

// Times are shared by both performers. Each key selects a normalized source pose.
const tracks={
  Player_StealthKill:[
    [0,'Crouch_Idle_Loop',0],[.42,'Idle_Loop',.12],[1.2,'Idle_Loop',.3],[2,'Idle_Loop',.55],[2.25,'Idle_Loop',.65],[2.75,'Crouch_Idle_Loop',.16],[3,'Crouch_Idle_Loop',.24]
  ],
  Enemy_StealthVictim:[
    [0,'Idle_Loop',0],[.52,'Idle_Loop',.15],[.9,'Idle_Loop',.35],[1.55,'Idle_Loop',.5],[1.95,'Idle_Loop',.72],[2.15,'Death01',.12],
    [2.4,'Death01',.55],[2.85,'Death01',.92],[3,'Death01',1]
  ]
};
export function bakeExecutionPair(clips,manifest,bones){
  for(const [id,track] of Object.entries(tracks)){
    const poses=track.map(([time,name,phase])=>{
      const clip=clips.get(name);
      return {time,...sampleAnimation(clip,phase*clip.duration,false)};
    });
    const frames=91,quat=[],trans=[];
    let segment=0;
    for(let frame=0;frame<frames;frame++){
      const time=frame/30;
      while(segment<poses.length-2 && time>poses[segment+1].time)segment++;
      const a=poses[segment],b=poses[segment+1],t=(time-a.time)/(b.time-a.time),w=t*t*(3-2*t);
      for(let i=0;i<a.rotations.length;i++){
        quat.push(...slerp(a.rotations[i],b.rotations[i],w));
        trans.push(...a.translations[i].map((v,j)=>v+(b.translations[i][j]-v)*w));
      }
    }
    const metadata={id,frames,duration:(frames-1)/30,loop:false};
    clips.set(id,{...clips.get(track[0][1]),...metadata,quat:new Float32Array(quat),trans:new Float32Array(trans),notifies:[],rootDelta:new Float32Array(frames*3)});
    manifest.clips.push(metadata);
  }

  const player=clips.get('Player_StealthKill'),enemy=clips.get('Enemy_StealthVictim');
  const index=name=>bones.findIndex(b=>b.name===name);
  const spine=index('spine_03'),shoulders=['upperarm_l','upperarm_r'].map(index);
  for(let frame=0;frame<player.frames;frame++){
    const time=frame/30;
    const ramp=x=>{const u=Math.min(1,Math.max(0,x));return u*u*(3-2*u)};
    const weight=ramp((time-.15)/.43)*(1-ramp((time-1.94)/.32));
    if(!weight)continue;
    const recoil=ramp((time-1.22)/.16)*(1-ramp((time-1.55)/.55));
    const actors=[player,enemy].map((clip,i)=>{
      const pose=sampleAnimation(clip,time,false);
      const swing=(i===1?.32:-.15)*Math.sin((time-.58)*10)*weight+(i===1?.55:-.30)*recoil;
      const lean=(i===1?.42:-.14)*recoil;
      pose.rotations[spine]=Q.mul(pose.rotations[spine],[Math.sin(lean/2),0,0,Math.cos(lean/2)]);
      pose.rotations[spine]=Q.mul(pose.rotations[spine],[0,Math.sin(swing/2),0,Math.cos(swing/2)]);
      return {pose,boneWorld:forwardKinematics(bones,pose.rotations,pose.translations),pos:[0,0,i===1?.39:0],yaw:0};
    });
    const [holder,sentry]=actors;
    for(const [i,side] of ['l','r'].entries()){
      const shoulder=sentry.boneWorld.positions[shoulders[i]];
      const goal=side==='l'
        ? [shoulder[0],shoulder[1]+.035,shoulder[2]+.36]
        : [shoulder[0]*1.9,shoulder[1]-.33+.22*recoil,shoulder[2]-.10+.16*recoil];
      const reaction=side==='l'
        ? [goal[0],goal[1]-.07,goal[2]+.075]
        : [shoulder[0]*2.6,shoulder[1]-.12+.17*Math.sin(time*9),shoulder[2]+.63];
      for(const [actor,point] of [[holder,goal],[sentry,reaction]]){
        const before=actor.pose.rotations.map(q=>q.slice());
        applyHandContact(actor,bones,point,{side,maxCorrection:2});
        actor.pose.rotations=before.map((q,j)=>slerp(q,actor.pose.rotations[j],weight));
        actor.boneWorld=forwardKinematics(bones,actor.pose.rotations,actor.pose.translations);
      }
    }
    actors.forEach((actor,i)=>[player,enemy][i].quat.set(actor.pose.rotations.flat(),frame*bones.length*4));
  }
}
