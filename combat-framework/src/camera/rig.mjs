import {CAM,CC} from '../core/constants.mjs';
import {trace} from '../character/collision.mjs';
import {createSpringArmState,solveSpringArm,fovFor,stepFov,fovTransition} from './springarm.mjs';

export const executionCameraDefaults={angle:55,distance:2.05,height:1.45,hold:.45,duration:.85,curve:"smootherstep"};
export function executionCameraBlend(time,settings){
  const t=Math.min(1,Math.max(0,(time-settings.hold)/settings.duration));
  if(settings.curve==='linear')return t;
  if(settings.curve==='smoothstep')return t*t*(3-2*t);
  return t*t*t*(10+t*(-15+6*t));
}
export function vaultFollow(seconds,hold){
  const t=Math.min(1,Math.max(0,(seconds-hold)/.42));
  return t*t*(3-2*t);
}

/** Camera dynamics run on the same fixed clock as movement; render interpolates. */
export class CameraRig {
  followPosition(actor,dt){
    const vault=actor.traversal?.type==='vault'?actor.traversal:null;
    if(vault && vault!==this.vault){
      this.anchor=this.followedPosition || vault.points[0];
      this.vaultTime=0;
    }
    this.vault=vault;
    this.followedPosition=[...actor.pos];
    if(this.anchor){
      const blend=vaultFollow(this.vaultTime,actor.vaultCamera?.hold ?? .8);
      this.followedPosition=this.anchor.map((v,i)=>v+(actor.pos[i]-v)*blend);
      this.vaultTime+=dt;
      if(!vault && blend===1)this.anchor=null;
    }
    return this.followedPosition;
  }
  constructor(){this.executionSettings={...executionCameraDefaults};this.arm=createSpringArmState();this.shoulder=-CAM.SHOULDER_X;this.current=null;this.previous=null;this.aim=false;this.fov=CAM.FOV_BASE;this.fovBlend=null;this.recoveryYaw=0;}
  update(actor,{yaw=actor.yaw,pitch=0,shoulder=1,aim=false,aspect=16/9}={},obstacles=[],dt=1/60){
    this.obstacles=obstacles;
    const settings=this.executionSettings;
    this.executionTime=actor.execLock?(this.executionTime??0)+dt:0;
    const blend=executionCameraBlend(this.executionTime,settings);
    this.executionBlend=actor.execLock?blend:(this.executionBlend??0)*Math.exp(-dt/.2);
    yaw+=this.executionBlend*Math.atan2(Math.sin(actor.yaw+settings.angle*Math.PI/180-yaw),Math.cos(actor.yaw+settings.angle*Math.PI/180-yaw));

    this.shoulder+=(-(aim?.31*Math.min(1.4,Math.max(.65,aspect/(16/9))):CAM.SHOULDER_X)*shoulder-this.shoulder)*(1-Math.exp(-dt/.12));
    const [x,y,z]=this.followPosition(actor,dt);
    const aimHeight=actor.weapon==='sniper'?-.135:actor.weapon==='rifle'?-.075:.045;
    let center=[x,y+Math.max(.85,(CAM.PIVOT_H+(aim?aimHeight:0))*actor.height/CC.STAND_H),z];center[1]+=(y+settings.height-center[1])*this.executionBlend;
    let side=[Math.cos(yaw)*Math.sign(this.shoulder),0,-Math.sin(yaw)*Math.sign(this.shoulder)],distance=trace(center,side,Math.abs(this.shoulder),obstacles,CAM.PROBE_R).distance,pivot=center.map((v,i)=>v+side[i]*Math.max(0,distance-.005)),dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    // Preserve the requested rear-facing azimuth. Nearby scenery fades instead of forcing an orbit.
    const desiredLength=this.executionBlend>.001?CAM.ARM_LEN+(settings.distance-CAM.ARM_LEN)*this.executionBlend:aim?.76:this.anchor?(actor.vaultCamera?.distance ?? CAM.ARM_LEN):CAM.ARM_LEN,minimumDistance=aim?.62:Math.min(1.7,desiredLength);
    solveSpringArm(pivot,dir,desiredLength,(o,d,len)=>trace(o,d,len,obstacles,CAM.PROBE_R).distance,this.arm,dt);
    const recovering=this.arm.target<minimumDistance;
    this.recoveryYaw=0;
    if(recovering){if(!aim)pivot=center;this.arm.len=minimumDistance;this.arm.v=0;}
    const target=fovFor(Math.hypot(actor.vel[0],actor.vel[2]),aim);
    if(aim!==this.aim){this.aim=aim;this.fovBlend={from:this.fov,to:target,elapsed:0};}
    if(this.fovBlend){const b=this.fovBlend;b.elapsed+=dt*1000;this.fov=fovTransition(b.from,b.to,b.elapsed);if(b.elapsed>=CAM.FOV_T_MS)this.fovBlend=null;}else this.fov=stepFov(this.fov,target,dt*1000);
    const next={position:pivot.map((v,i)=>v-dir[i]*this.arm.len),pivot,direction:dir,look:pivot.map((v,i)=>v+dir[i]*10),fov:this.fov,recovering,aimOrigin:recovering?[...pivot]:pivot.map((v,i)=>v-dir[i]*this.arm.len)};this.previous=this.current||next;this.current=next;return next;
  }
  interpolate(alpha){
    const a=this.previous,b=this.current;if(!b)return null;
    const pivot=b.pivot.map((v,i)=>a.pivot[i]+(v-a.pivot[i])*alpha);
    let position=b.position.map((v,i)=>a.position[i]+(v-a.position[i])*alpha);
    const delta=position.map((v,i)=>v-pivot[i]),len=Math.hypot(...delta),back=delta.map(v=>v/(len||1));
    const free=trace(pivot,back,len,this.obstacles,CAM.PROBE_R).distance;
    if(!b.recovering&&free<len)position=pivot.map((v,i)=>v+back[i]*Math.max(0,free-.005));
    if((a.recovering||b.recovering)&&Math.hypot(...position.map((v,i)=>v-pivot[i]))<1.2)position=[...b.position];
    return {position,look:b.look.map((v,i)=>a.look[i]+(v-a.look[i])*alpha),fov:a.fov+(b.fov-a.fov)*alpha,fadeObstacles:!!(a.recovering||b.recovering),pivot};
  }
}
