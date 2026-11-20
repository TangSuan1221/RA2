import {arbitrateRoot,integrateRoot} from './root-motion.mjs';
import {motionResponse} from './motion-response.mjs';
import {CC} from '../core/constants.mjs';
import {CFG} from '../config.mjs';
import {fits,moveCapsule,fitsBody} from './collision.mjs';
export const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function motor(a,input,dt,obstacles) {
  const desiredHeight=a.posture==='prone'?CFG.proneHeight:a.posture==='crouch'?CC.CROUCH_H:CC.STAND_H;
  if(a.heightTransition?.to!==desiredHeight)a.heightTransition={from:a.height,to:desiredHeight,elapsed:0};
  const transition=a.heightTransition,nextElapsed=Math.min(CFG.postureSeconds,transition.elapsed+dt),height=transition.from+(transition.to-transition.from)*nextElapsed/CFG.postureSeconds;
  if(height<a.height || fits(a.pos,a.radius,height,obstacles)){a.height=height;transition.elapsed=nextElapsed;}
  const slope=a.groundNormal?Math.acos(Math.max(-1,Math.min(1,a.groundNormal[1]))):0;
  const sliding=a.onSlope&&slope>CC.SLOPE_SLIDE*Math.PI/180;
  if(sliding&&a.slideVelocity){a.vel[0]-=a.slideVelocity[0];a.vel[2]-=a.slideVelocity[2];}
  const response=motionResponse(a,input,dt),targetX=response.velocity[0],targetZ=response.velocity[2],change=response.acceleration*dt,goal=response.yaw,mag=Math.hypot(input.x||0,input.z||0);
  a.motionIntent={...response,request:{...input},posture:a.posture,brokenLeg:a.brokenLeg,groundNormal:a.groundNormal};
  const dx=targetX-a.vel[0],dz=targetZ-a.vel[2],delta=Math.hypot(dx,dz);
  const amount=Math.min(1,change/Math.max(delta,1e-9));a.vel[0]+=dx*amount;a.vel[2]+=dz*amount;
  if((mag || input.aim || input.lookDriven)&&!a.sprintBraking){const limit=(input.aim?CC.TURN_AIM:input.sprint||a.posture==='prone'?CC.TURN_SPRINT:CC.TURN_FREE)*Math.PI/180*dt,previous=a.yaw;a.yaw+=Math.max(-limit,Math.min(limit,wrap(goal-a.yaw)));if(a.posture==='prone'&&!fitsBody(a,a.pos,a.height,obstacles))a.yaw=previous;}
  if(sliding){const n=a.groundNormal,sin=Math.sin(slope),acceleration=CFG.gravity*(sin-Math.tan(CC.SLOPE_SLIDE*Math.PI/180)*n[1]),down=[n[0]*n[1]/sin,-sin,n[2]*n[1]/sin],previous=a.slideVelocity||[0,0,0];a.vel[1]=0;a.slideVelocity=previous.map((v,i)=>v+down[i]*acceleration*dt);for(let axis=0;axis<3;axis++)a.vel[axis]+=a.slideVelocity[axis];}
  else {a.slideVelocity=null;if(a.grounded&&a.groundNormal)a.vel[1]=0;else a.vel[1]-=CFG.gravity*dt;}
  const before=[...a.pos],desiredSpeed=Math.hypot(targetX,targetZ);
  a.prepareLocomotion?.(dt);
  let displacementDelta=a.vel.map(v=>v*dt),usedRoot=false;
  const source=a.rootAnimation?.clips.get(a.clip),meta=a.rootAnimation?.metadata?.get(a.clip);
  if(source&&a.grounded&&a.state==='idle'&&a.posture!=='prone'&&!input.aim&&!sliding){
    const rate=a.matcher?.playRate??1,local=meta?.measuredRoot?integrateRoot(source,source.loop?a.clipTime-dt*rate:Math.max(0,a.clipTime-dt*rate),a.clipTime):null;
    let root=displacementDelta;
    if(local){const frame=Math.min(meta.frames-1,Math.floor(a.clipTime*30)),heading=meta.headings?.[frame]??0,angle=a.yaw-heading,si=Math.sin(angle),co=Math.cos(angle),scale=a.modelScale??1;root=[scale*(local[0]*co+local[2]*si),displacementDelta[1],scale*(-local[0]*si+local[2]*co)];usedRoot=true;}
    a.rootHandoff??={weight:0};const motion=arbitrateRoot(a.rootHandoff,{speed:Math.hypot(a.vel[0],a.vel[2]),motorDelta:displacementDelta,rootDelta:root,dt});displacementDelta=motion.delta;a.rootMotionClamped=motion.clamped;
  }else {a.rootMotionClamped=false;}
  const blocked=moveCapsule(a,displacementDelta,obstacles,a.posture==='prone'?0:CC.STEP_UP);
  if(usedRoot){a.vel[0]=(a.pos[0]-before[0])/dt;a.vel[2]=(a.pos[2]-before[2])/dt;}
  if(blocked){a.motionIntent.velocity=[a.vel[0],0,a.vel[2]];delete a.motionIntent.request;}
  const displacement=Math.hypot(a.pos[0]-before[0],a.pos[2]-before[2]);
  a.blockedSteps=desiredSpeed>CC.STUCK_DESIRED_SPEED&&displacement<CC.STUCK_DISTANCE?(a.blockedSteps||0)+1:0;
  a.stuck=!!a.rootMotionClamped||!!a.collisionError||a.blockedSteps>=CC.STUCK_STEPS;
}
