import {motionResponse} from '../character/motion-response.mjs';
import {DT} from '../core/constants.mjs';
/** Predict the currently requested motor response; never invent future input. */
export function predictTrajectory(actor,time){
 const intent=actor.motionIntent;if(!intent)return {pos:[actor.vel[0]*time,actor.vel[2]*time],yaw:actor.yaw};
 let x=0,z=0,vx=actor.vel[0],vz=actor.vel[2],yaw=actor.yaw,elapsed=0;
 while(elapsed<time-1e-9){const dt=Math.min(DT,time-elapsed),response=intent.request?motionResponse({vel:[vx,0,vz],yaw,posture:intent.posture,brokenLeg:intent.brokenLeg,groundNormal:intent.groundNormal},intent.request,dt):intent,dx=response.velocity[0]-vx,dz=response.velocity[2]-vz,distance=Math.hypot(dx,dz),weight=Math.min(1,response.acceleration*dt/(distance||1));vx+=dx*weight;vz+=dz*weight;x+=vx*dt;z+=vz*dt;
  if(!response.rotationLocked){const error=Math.atan2(Math.sin(response.yaw-yaw),Math.cos(response.yaw-yaw)),limit=response.turnRate*dt;yaw+=Math.max(-limit,Math.min(limit,error));}elapsed+=dt;
 }
 return {pos:[x,z],yaw};
}
