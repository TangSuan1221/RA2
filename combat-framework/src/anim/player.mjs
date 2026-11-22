import {applyProneAim,diveId} from './dive.mjs';
import {applyHandContact} from './hand-ik.mjs';
import {sampleAnimation,forwardKinematics,slerp} from './skeleton.mjs';
import {Q} from './inertial.mjs';
import {MM} from '../core/constants.mjs';
import reactionTable from '../combat/reactions.json' with {type:'json'};
const qlog=q=>{const s=q[3]<0?-1:1,w=Math.max(-1,Math.min(1,q[3]*s)),angle=Math.acos(w),n=Math.hypot(q[0],q[1],q[2]);return n<1e-8?[0,0,0]:q.slice(0,3).map(v=>v*s*angle/n);};
const qexp=v=>{const angle=Math.hypot(...v),s=angle<1e-8?1:Math.sin(angle)/angle;return Q.norm([...v.map(x=>x*s),Math.cos(angle)]);};
const residual=(x,v,t,T)=>{if(t>=T)return 0;const u=t/T;return x+v*t+(-10*x-6*v*T)*u**3+(15*x+8*v*T)*u**4+(-6*x-3*v*T)*u**5;};
// Compare successive source times so changing a multiplier does not jump phase.
function sampleClock(previous,id,raw,rate,clip,loop){
  if(!clip)return null;
  let delta=raw-(previous?.raw??raw);
  if(loop && delta < -clip.duration/2)delta+=clip.duration;
  const seek=!previous || previous.id!==id || Math.abs(delta)>.12 || (!loop && raw===0 && previous.raw>0);
  let time=seek?raw:previous.time+delta*rate;
  if(loop)time=((time%clip.duration)+clip.duration)%clip.duration;
  else time=Math.max(0,Math.min(clip.duration,time));
  return {id,raw,time};
}
export class SkeletonPlayer {
  applyReaction(pose,actor){const hit=actor.hitReaction;if(!hit||hit.poiseBreak||actor.hp<=0)return pose;const id=hit.part==='head'?'hit_head':hit.heavy?'hit_heavy_front':'hit_light_front',entry=reactionTable.reactions.find(r=>r.id===id),clip=this.clips.get(entry.additive.clip);if(!clip)return pose;const duration=entry.additive.decayMs/1000,t=hit.elapsed;if(t>=duration)return pose;const weight=entry.additive.weight*Math.sin(Math.PI*Math.min(1,t/duration)),reaction=sampleAnimation(clip,t/duration*clip.duration*(actor.rateFor?.(entry.additive.clip)??1),false),base=sampleAnimation(clip,0,false);for(let i=0;i<this.bones.length;i++)if(this.upperMask[i]){const delta=Q.mul(reaction.rotations[i],Q.conj(base.rotations[i]));pose.rotations[i]=Q.norm(Q.mul(slerp([0,0,0,1],delta,weight),pose.rotations[i]));}return pose;}
  constructor(bones,clips){this.bones=bones;this.handIndices=['r','l'].map(side=>bones.findIndex(b=>b.name==='hand_'+side));this.clips=clips;this.output=null;this.previous=null;this.offsets=null;this.elapsed=MM.BLEND_T;this.lastClip='';this.lastTime=0;this.lastUpper=null;this.upperMask=bones.map(b=>/spine|neck|Head|clavicle|upperarm|lowerarm|hand|index|middle|ring|pinky|thumb/i.test(b.name));}
  target(actor,time,upperTime=actor.upperTime||0){const clip=this.clips.get(actor.clip);if(!clip)throw Error('Unbaked animation '+actor.clip);const pose=sampleAnimation(clip,time,actor.state==='idle'&&clip.loop);if(actor.upperClip&&actor.state==='idle'){const upper=sampleAnimation(this.clips.get(actor.upperClip),upperTime,false);let neutral,aim,weight=0;const sightPitch=(actor.aimPitch??0)+.23;if(actor.aim){neutral=sampleAnimation(this.clips.get(actor.weapon?'TPS_LongGun_Aim_Center':'Pistol_Aim_Neutral'),0,false);aim=sampleAnimation(this.clips.get((actor.weapon?'TPS_LongGun_Aim_':'Pistol_Aim_')+(sightPitch>0?'Up':'Down')),0,false);weight=Math.min(1,Math.abs(sightPitch)/.9);}if(actor.posture==='prone'){
        if(weight)for(let i=0;i<this.bones.length;i++)upper.rotations[i]=Q.mul(slerp([0,0,0,1],Q.mul(aim.rotations[i],Q.conj(neutral.rotations[i])),weight),upper.rotations[i]);
        applyProneAim(this.bones,pose,upper);
        return this.applyReaction(pose,actor);
      }for(let i=0;i<this.bones.length;i++)if(this.upperMask[i]){pose.rotations[i]=upper.rotations[i];pose.translations[i]=upper.translations[i];if(weight){const delta=Q.mul(aim.rotations[i],Q.conj(neutral.rotations[i]));pose.rotations[i]=Q.norm(Q.mul(slerp([0,0,0,1],delta,weight),pose.rotations[i]));}}}if(actor.aim && actor.state==='idle' && actor.upperClip?.startsWith('Pistol_') && this.handIndices.every(i=>i>=0)){
      const fk=forwardKinematics(this.bones,pose.rotations,pose.translations);
      // Both wrists move together toward the chest in character space.
      const localActor={pose,boneWorld:fk,pos:[0,0,0],yaw:0};
      for(const [i,side] of ['r','l'].entries()){
        const [x,y,z]=fk.positions[this.handIndices[i]];
        applyHandContact(localActor,this.bones,[x,y,z-.085],{side,maxCorrection:.09});
      }
    }
    return this.applyReaction(pose,actor);}
  update(actor,dt){
    const clip=this.clips.get(actor.clip),loop=actor.state==='idle'&&clip.loop;
    const distanceOrPosture=actor.clip.startsWith('Prone_Crawl_')||actor.postureAction||actor.clip==='Crouch_To_Prone'&&actor.state.startsWith('prone_');
    if(actor.execLock || actor.clip.startsWith('Enemy_StealthVictim') || actor.clip===diveId || distanceOrPosture || actor.state==='vault')this.baseClock={id:actor.clip,raw:actor.clipTime,time:actor.clipTime};
    else this.baseClock=sampleClock(this.baseClock,actor.clip,actor.clipTime,actor.rateFor?.(actor.clip)??1,clip,loop);
    this.upperClock=sampleClock(this.upperClock,actor.upperClip,actor.upperTime??0,actor.rateFor?.(actor.upperClip)??1,this.clips.get(actor.upperClip),false);
    const time=this.baseClock.time, upperTime=this.upperClock?.time??0;
    if(this.lastPosture!==actor.posture){
      this.blendDuration=MM.BLEND_T/(actor.rateFor?.(actor.posture==='stand'?'@stand':'@crouch')??1);
      this.lastPosture=actor.posture;
    }else if(this.lastClip!==actor.clip)this.blendDuration=MM.BLEND_T;
    const target=this.target(actor,time,upperTime),expected=(this.lastTime+dt)%Math.max(clip.duration,dt),jump=Math.abs(time-expected)>.1&&Math.abs(time-this.lastTime)>.1;
    const switchPose=this.lastClip!==actor.clip||this.lastUpper!==actor.upperClip||jump;
    if(this.output&&switchPose){const targetPrev=this.target(actor,Math.max(0,time-dt),Math.max(0,upperTime-dt));this.offsets=this.bones.map((b,i)=>{const rotation=qlog(Q.mul(this.output.rotations[i],Q.conj(target.rotations[i]))),position=this.output.translations[i].map((v,j)=>v-target.translations[i][j]),oldVelocity=this.previous?qlog(Q.mul(this.output.rotations[i],Q.conj(this.previous.rotations[i]))).map(v=>v/dt):[0,0,0],targetVelocity=qlog(Q.mul(target.rotations[i],Q.conj(targetPrev.rotations[i]))).map(v=>v/dt);return {rotation,position,angularVelocity:oldVelocity.map((v,j)=>v-targetVelocity[j]),velocity:position.map((_,j)=>(this.previous?(this.output.translations[i][j]-this.previous.translations[i][j])/dt:0)-(target.translations[i][j]-targetPrev.translations[i][j])/dt)};});this.elapsed=0;}
    this.previous=this.output;this.output=target;
    if(this.offsets&&this.elapsed<this.blendDuration){for(let i=0;i<this.bones.length;i++){const o=this.offsets[i],rot=o.rotation.map((v,j)=>residual(v,o.angularVelocity[j],this.elapsed,this.blendDuration));target.rotations[i]=Q.norm(Q.mul(qexp(rot),target.rotations[i]));target.translations[i]=target.translations[i].map((v,j)=>v+residual(o.position[j],o.velocity[j],this.elapsed,this.blendDuration));}this.elapsed+=dt;}
    this.lastClip=actor.clip;this.lastTime=time;this.lastUpper=actor.upperClip;
    actor.previousPose=actor.pose||target;actor.pose={...target,rotations:target.rotations.map(q=>q.slice()),translations:target.translations.map(p=>p.slice())};actor.boneWorld=forwardKinematics(this.bones,actor.pose.rotations,actor.pose.translations);return actor.pose;
  }
}
