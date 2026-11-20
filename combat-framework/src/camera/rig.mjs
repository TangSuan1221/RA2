import {CAM,CC} from '../core/constants.mjs';
import {trace} from '../character/collision.mjs';
import {createSpringArmState,solveSpringArm,fovFor,stepFov,fovTransition} from './springarm.mjs';

/** Camera dynamics run on the same fixed clock as movement; render interpolates. */
export class CameraRig {
  constructor(){this.arm=createSpringArmState();this.shoulder=CAM.SHOULDER_X;this.current=null;this.previous=null;this.aim=false;this.fov=CAM.FOV_BASE;this.fovBlend=null;this.recoveryYaw=0;}
  update(actor,{yaw=actor.yaw,pitch=0,shoulder=1,aim=false}={},obstacles=[],dt=1/60){
    this.obstacles=obstacles;
    this.shoulder+=(CAM.SHOULDER_X*shoulder-this.shoulder)*(1-Math.exp(-dt/.12));
    let center=[actor.pos[0],actor.pos[1]+Math.max(.85,CAM.PIVOT_H*actor.height/CC.STAND_H),actor.pos[2]],side=[Math.cos(yaw)*Math.sign(this.shoulder),0,-Math.sin(yaw)*Math.sign(this.shoulder)],distance=trace(center,side,Math.abs(this.shoulder),obstacles,CAM.PROBE_R).distance,pivot=center.map((v,i)=>v+side[i]*Math.max(0,distance-.005)),dir=[Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)];
    // Preserve the requested rear-facing azimuth. Nearby scenery fades instead of forcing an orbit.
    const desiredLength=aim?1.8:CAM.ARM_LEN,minimumDistance=aim?1.5:1.7;
    solveSpringArm(pivot,dir,desiredLength,(o,d,len)=>trace(o,d,len,obstacles,CAM.PROBE_R).distance,this.arm,dt);
    const recovering=this.arm.target<minimumDistance;
    this.recoveryYaw=0;
    if(recovering){pivot=center;this.arm.len=minimumDistance;this.arm.v=0;}
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
