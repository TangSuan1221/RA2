import {MM} from '../core/constants.mjs';
import {trace} from '../character/collision.mjs';
import {Q} from './inertial.mjs';
import {V3} from '../core/math.mjs';
import {forwardKinematics,rotate} from './skeleton.mjs';
import {solveTwoBone} from './ik.mjs';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function between(a,b){a=V3.norm(a);b=V3.norm(b);const d=V3.dot(a,b);if(d<-.99999){const axis=V3.norm(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return [...axis,0];}return Q.norm([...cross(a,b),1+d]);}
export function footGroundProbe(actor,world,obstacles){
 const samples=[],si=Math.sin(actor.yaw),co=Math.cos(actor.yaw);
 for(const offset of [.09,0,-.07]){const origin=[world[0]+si*offset,world[1]+MM.IK_RAY_LEN/3,world[2]+co*offset],hit=trace(origin,[0,-1,0],MM.IK_RAY_LEN,obstacles);
  if(hit.object){const box=hit.object,insideBox=Array.isArray(box.max)&&origin[1]<box.max[1]-1e-8;
   if(!insideBox&&(!hit.normal||hit.normal[1]>0))samples.push({height:origin[1]-hit.distance,normal:hit.normal||[0,1,0]});
  }
  else if(!obstacles.geometryQuery&&origin[1]>=0&&origin[1]<=MM.IK_RAY_LEN)samples.push({height:0,normal:[0,1,0]});
 }
 samples.sort((a,b)=>a.height-b.height);const median=samples[Math.floor(samples.length/2)];return median?{...median,count:samples.length}:{count:0,height:null,normal:null};
}
export function applyFootIK(actor,bones,obstacles,dt,clip){
  if(actor.state!=='idle'||!actor.grounded||actor.posture==='prone'){actor.footLocks={};actor.footProbes={};actor.footProbeHeights={};actor.pelvisIKDrop=0;return;}
  const pose=actor.pose,s=actor.modelScale||1,si=Math.sin(actor.yaw),co=Math.cos(actor.yaw),offset=actor.modelYOffset||0;
  actor.footLocks??={};actor.footProbeHeights??={};
  const toWorld=v=>[actor.pos[0]+s*(v[0]*co+v[2]*si),actor.pos[1]+s*v[1]+offset,actor.pos[2]+s*(-v[0]*si+v[2]*co)];
  const toLocal=v=>{const x=(v[0]-actor.pos[0])/s,z=(v[2]-actor.pos[2])/s;return [x*co-z*si,(v[1]-actor.pos[1]-offset)/s,x*si+z*co];};
  const probes={};let lowest=0;
  for(const side of ['l','r']){const foot=bones.findIndex(b=>b.name==='foot_'+side),world=toWorld(actor.boneWorld.positions[foot]),lock=actor.footLocks[side],center=lock?.anchor?[lock.anchor[0],world[1],lock.anchor[2]]:world,probe=footGroundProbe(actor,center,obstacles),contact=clip?.contactOfFrame?.[Math.min(clip.frames-1,Math.floor(actor.clipTime*30))]?.[side==='l'?0:1];
    if(probe.count){const previous=actor.footProbeHeights[side]??probe.height;probe.rawHeight=probe.height;probe.height=previous-probe.height>MM.IK_SNAP_DROP?probe.height:previous+(probe.height-previous)*(1-Math.exp(-dt/MM.IK_FOOT_SMOOTH));actor.footProbeHeights[side]=probe.height;if(contact!==false&&world[1]-probe.height<.17*s)lowest=Math.min(lowest,probe.height-actor.pos[1]);}
    probes[side]=probe;
  }
  const drop=Math.min(MM.IK_PELVIS_MAX,Math.max(0,-MM.IK_PELVIS_FRAC*lowest)),pelvis=bones.findIndex(b=>b.name==='pelvis');actor.pelvisIKDrop=drop;
  if(drop&&pelvis>=0){const parent=bones[pelvis].parent,delta=parent>=0?rotate(Q.conj(actor.boneWorld.rotations[parent]),[0,-drop/s,0]):[0,-drop/s,0];pose.translations[pelvis]=pose.translations[pelvis].map((v,i)=>v+delta[i]);actor.boneWorld=forwardKinematics(bones,pose.rotations,pose.translations);}
  actor.footProbes=probes;
  for(const side of ['l','r']){
    const hip=bones.findIndex(b=>b.name==='thigh_'+side),knee=bones.findIndex(b=>b.name==='calf_'+side),foot=bones.findIndex(b=>b.name==='foot_'+side),fk=actor.boneWorld;
    if(hip<0||knee<0||foot<0)throw Error('Missing IK chain');
    const world=toWorld(fk.positions[foot]),probe=probes[side],floor=probe.height??0;
    const ankleHeight=.075*s,above=world[1]-floor,old=actor.footLocks[side]||{weight:0,anchor:null};
    const contact=clip?.contactOfFrame?.[Math.min(clip.frames-1,Math.floor(actor.clipTime*30))]?.[side==='l'?0:1];
    let released=false;
    if(old.anchor&&(!probe.count||contact===false||above>.17*s||Math.hypot(world[0]-old.anchor[0],world[2]-old.anchor[2])>.3*s)){old.releaseGoal=old.anchor;old.anchor=null;released=true;}
    // A release must blend out before a new anchor is acquired. Replacing a
    // fully weighted anchor in this same tick makes the planted foot teleport.
    if(!old.anchor&&!released&&old.weight===0&&probe.count&&contact!==false&&above<.115*s){old.anchor=[world[0],floor+ankleHeight,world[2]];old.normal=probe.normal;}
    const desiredWeight=old.anchor?probe.count/3:0;old.weight+=Math.max(-dt/.08,Math.min(dt/.08,desiredWeight-old.weight));actor.footLocks[side]=old;
    if(old.weight===0){old.releaseGoal=null;continue;}
    const anchor=old.anchor||old.releaseGoal;if(!anchor)continue;
    const goal=toLocal(anchor),a=fk.positions[hip],b=fk.positions[knee],c=fk.positions[foot],l1=V3.len(V3.sub(b,a)),l2=V3.len(V3.sub(c,b));
    if(V3.len(V3.sub(goal,a))>(l1+l2)*.995){old.releaseGoal=anchor;old.anchor=null;}
    const target=V3.lerp(c,goal,old.weight),solved=solveTwoBone(a,target,[side==='l'?-.213:.213,0,1],l1,l2),footRotation=old.anchor&&old.normal?Q.mul(between([0,1,0],[old.normal[0]*co-old.normal[2]*si,old.normal[1],old.normal[0]*si+old.normal[2]*co]),fk.rotations[foot]):fk.rotations[foot];
    const newHip=Q.mul(between(V3.sub(b,a),V3.sub(solved.knee,a)),fk.rotations[hip]);
    pose.rotations[hip]=Q.norm(Q.mul(Q.conj(fk.rotations[bones[hip].parent]),newHip));
    let updated=forwardKinematics(bones,pose.rotations,pose.translations);
    const newKnee=Q.mul(between(V3.sub(updated.positions[foot],updated.positions[knee]),V3.sub(solved.ankle,updated.positions[knee])),updated.rotations[knee]);
    pose.rotations[knee]=Q.norm(Q.mul(Q.conj(updated.rotations[hip]),newKnee));
    pose.rotations[foot]=Q.norm(Q.mul(Q.conj(newKnee),footRotation));
    actor.boneWorld=forwardKinematics(bones,pose.rotations,pose.translations);
  }
}
