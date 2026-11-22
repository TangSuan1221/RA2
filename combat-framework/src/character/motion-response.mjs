import {CC} from '../core/constants.mjs';
import {CFG} from '../config.mjs';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
export function motionResponse(a,input,dt){
  let speed=input.aim?CC.SPD_AIM_WALK:input.sprint?CC.SPD_SPRINT:input.walk?CC.SPD_WALK:CC.SPD_JOG;
  if(a.posture==='crouch')speed=CC.SPD_CROUCH;
  if(a.posture==='prone'){
    const forward=(input.x||0)*Math.sin(a.yaw)+(input.z||0)*Math.cos(a.yaw);
    const clip=forward<0?'Prone_Crawl_Backward':'Prone_Crawl_Forward';
    speed=CFG.proneSpeed*(a.rateFor?.(clip)??1);
  }
  if(a.brokenLeg)speed=Math.min(speed,CC.SPD_WALK);
  const slope=a.groundNormal?Math.acos(Math.max(-1,Math.min(1,a.groundNormal[1]))):0;
  const sliding=a.onSlope&&slope>CC.SLOPE_SLIDE*Math.PI/180;
  if(slope>CC.SLOPE_MAX*Math.PI/180&&slope<=CC.SLOPE_SLIDE*Math.PI/180)speed*=Math.cos(slope)*1.15;
  speed*=input.scale??1;
  const mag=Math.hypot(input.x||0,input.z||0),norm=Math.max(1,mag);
  const x=(input.x||0)/norm,z=(input.z||0)/norm;
  const goal=input.backpedal?a.yaw:input.aim||input.lookDriven||a.posture==='prone'?(input.yaw??a.yaw):(mag?Math.atan2(x,z):a.yaw),currentSpeed=Math.hypot(a.vel[0],a.vel[2]);
  const reversing=!!((input.sprint||currentSpeed>CC.SPD_JOG+1e-6)&&!input.aim&&a.posture==='stand'&&mag&&Math.abs(wrap((input.lookDriven||input.backpedal?Math.atan2(x,z):goal)-a.yaw))>CC.SPRINT_TURN_THRESHOLD*Math.PI/180);
  a.sprintBraking=reversing&&currentSpeed>CC.SPD_JOG+1e-6;
  if(reversing)speed=Math.min(speed,CC.SPD_JOG);
  const change=(a.sprintBraking||!mag?CC.DECEL:CC.ACCEL)*dt;
  let targetX=x*speed,targetZ=z*speed;
  const aimYaw=input.backpedal?a.yaw:(input.yaw??a.yaw);
  if(input.aim&&a.posture==='stand'&&!a.brokenLeg){const si=Math.sin(aimYaw),co=Math.cos(aimYaw),side=x*co-z*si,forward=x*si+z*co,scale=input.scale??1;targetX=(co*side*CC.SPD_AIM_STRAFE+si*forward*CC.SPD_AIM_WALK)*scale;targetZ=(-si*side*CC.SPD_AIM_STRAFE+co*forward*CC.SPD_AIM_WALK)*scale;}
  if(a.sprintBraking){targetX=a.vel[0]/currentSpeed*CC.SPD_JOG;targetZ=a.vel[2]/currentSpeed*CC.SPD_JOG;}
  return {velocity:[targetX,0,targetZ],yaw:goal,acceleration:change/dt,turnRate:(input.aim?CC.TURN_AIM:input.sprint||a.posture==='prone'?CC.TURN_SPRINT:CC.TURN_FREE)*Math.PI/180,rotationLocked:a.sprintBraking||!(mag||input.aim||input.lookDriven)};
}
