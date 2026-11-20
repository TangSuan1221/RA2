import {CC} from '../core/constants.mjs';
import { CFG } from '../config.mjs';

export function raySphere(origin,dir,center,radius){
  const offset=origin.map((v,i)=>v-center[i]),b=offset.reduce((sum,v,i)=>sum+v*dir[i],0),c=offset.reduce((sum,v)=>sum+v*v,0)-radius*radius,disc=b*b-c;
  if(c<=0)return 0;if(disc<0)return Infinity;const t=-b-Math.sqrt(disc);return t>=0?t:Infinity;
}

export function rayBox(origin,dir,box,maxDistance=Infinity,padding=0) {
  let near=0,far=maxDistance;
  for(let i=0;i<3;i++) {
    const lo=box.min[i]-padding,hi=box.max[i]+padding;
    if(Math.abs(dir[i])<1e-10) { if(origin[i]<lo || origin[i]>hi) return Infinity; continue; }
    let a=(lo-origin[i])/dir[i],b=(hi-origin[i])/dir[i];
    if(a>b) [a,b]=[b,a];
    near=Math.max(near,a); far=Math.min(far,b);
    if(near>far) return Infinity;
  }
  return near;
}
export function trace(origin,dir,maxDistance,obstacles,padding=0) {
  if(obstacles.geometryQuery)return obstacles.geometryQuery.trace(origin,dir,maxDistance,padding);
  let distance=maxDistance,object=null;
  for(const box of obstacles) { const d=rayBox(origin,dir,box,maxDistance,padding); if(d<distance){distance=d;object=box;} }
  return {distance,object};
}
export function fits(pos,radius,height,obstacles) {
  if(obstacles.geometryQuery?.movementEnabled){const result=obstacles.geometryQuery.resolveCapsule({radius,height,posture:'stand',yaw:0},pos);return result.valid!==false&&Math.hypot(...result.position.map((v,i)=>v-pos[i]))<.006;}
  for(const b of obstacles) {
    if(pos[1]+height<=b.min[1]+CFG.skin || pos[1]>=b.max[1]-CFG.skin) continue;
    const x=Math.max(b.min[0],Math.min(b.max[0],pos[0]));
    const z=Math.max(b.min[2],Math.min(b.max[2],pos[2]));
    if(Math.hypot(pos[0]-x,pos[2]-z)<radius-CFG.skin) return false;
  }
  return true;
}
export function fitsBody(actor,pos,height,obstacles){
  if(obstacles.geometryQuery?.movementEnabled){const result=obstacles.geometryQuery.resolveCapsule({...actor,height},pos);return result.valid!==false&&Math.hypot(...result.position.map((v,i)=>v-pos[i]))<.006;}
  if(actor.posture!=='prone')return fits(pos,actor.radius,height,obstacles);
  const si=Math.sin(actor.yaw),co=Math.cos(actor.yaw),a=[pos[0]-.7*si,pos[2]-.7*co],b=[pos[0]+.6*si,pos[2]+.6*co],d=[b[0]-a[0],b[1]-a[1]],length=Math.hypot(...d),radius=actor.radius*.8-CFG.skin;
  for(const box of obstacles){
    if(pos[1]+height<=box.min[1]+CFG.skin||pos[1]>=box.max[1]-CFG.skin)continue;
    const hit=rayBox([a[0],0,a[1]],[d[0]/length,0,d[1]/length],{min:[box.min[0],-1,box.min[2]],max:[box.max[0],1,box.max[2]]},length);
    if(hit<=length)return false;
    const pointRect=p=>Math.max(box.min[0]-p[0],0,p[0]-box.max[0])**2+Math.max(box.min[2]-p[1],0,p[1]-box.max[2])**2;
    let dist2=Math.min(pointRect(a),pointRect(b));
    for(const x of [box.min[0],box.max[0]])for(const z of [box.min[2],box.max[2]]){const t=Math.max(0,Math.min(1,((x-a[0])*d[0]+(z-a[1])*d[1])/(length*length)));dist2=Math.min(dist2,(x-a[0]-t*d[0])**2+(z-a[1]-t*d[1])**2);}
    if(dist2<radius*radius)return false;
  }
  return true;
}
/** Substepped upright capsule against box fixtures; arbitrary triangle BVH remains a separate gate. */
export function moveCapsule(actor,delta,obstacles,stepHeight) {
  if(obstacles.geometryQuery?.movementEnabled)return moveTriangles(actor,delta,obstacles.geometryQuery,stepHeight);
  const length=Math.hypot(...delta),n=Math.max(1,Math.ceil(length/(actor.radius*0.45)));
  let blocked=false;
  for(let i=0;i<n;i++) {
    for(const axis of [0,2]) {
      const candidate=[...actor.pos]; candidate[axis]+=delta[axis]/n;
      if(fitsBody(actor,candidate,actor.height,obstacles)) actor.pos[axis]=candidate[axis];
      else {
        let stepped=false;
        for(const b of obstacles) {
          const rise=b.max[1]-actor.pos[1];
          if(rise>CFG.skin && rise<=stepHeight && candidate[0]+actor.radius>b.min[0] && candidate[0]-actor.radius<b.max[0] && candidate[2]+actor.radius>b.min[2] && candidate[2]-actor.radius<b.max[2]) {
            const lifted=[candidate[0],b.max[1],candidate[2]];
            if(fitsBody(actor,lifted,actor.height,obstacles)){actor.pos=lifted;stepped=true;break;}
          }
        }
        if(!stepped){blocked=true;actor.vel[axis]=0;}
      }
    }
    const candidate=[...actor.pos]; candidate[1]+=delta[1]/n;
    if(fitsBody(actor,candidate,actor.height,obstacles)) actor.pos[1]=candidate[1];
    else actor.vel[1]=0;
  }
  let floor=0;
  for(const b of obstacles) if(actor.pos[0]>b.min[0] && actor.pos[0]<b.max[0] && actor.pos[2]>b.min[2] && actor.pos[2]<b.max[2] && b.max[1]<=actor.pos[1]+CFG.skin) floor=Math.max(floor,b.max[1]);
  actor.grounded=actor.pos[1]<=floor+0.35 && actor.vel[1]<=0;
  if(actor.grounded){actor.pos[1]=floor;actor.vel[1]=0;}
  return blocked;
}

function moveTriangles(actor,delta,query,stepHeight){
  const count=Math.max(1,Math.ceil(Math.hypot(...delta)/.08));let blocked=false,normal=null,friction=false;
  for(let i=0;i<count;i++){
    const candidate=[actor.pos[0]+delta[0]/count,actor.pos[1],actor.pos[2]+delta[2]/count];let result=query.resolveCapsule(actor,candidate);
    if(result.valid===false){actor.collisionError=result.reason;actor.vel=[0,0,0];return true;}actor.collisionError=null;
    const lateral=Math.hypot(result.position[0]-candidate[0],result.position[2]-candidate[2]);
    if(lateral>.001&&stepHeight>0&&Math.hypot(delta[0],delta[2])>0){const length=Math.hypot(delta[0],delta[2]),probe=[candidate[0]+delta[0]/length*(actor.radius+.1),actor.pos[1]+stepHeight+.05,candidate[2]+delta[2]/length*(actor.radius+.1)],ground=query.trace(probe,[0,-1,0],stepHeight+.05),top=probe[1]-ground.distance,rise=top-actor.pos[1];if(ground.object&&ground.normal?.[1]>=Math.cos(Math.PI/4)&&rise>.005&&rise<=stepHeight){const lifted=[candidate[0],top+.005,candidate[2]],test=query.resolveCapsule(actor,lifted);if(test.valid!==false&&Math.hypot(test.position[0]-lifted[0],test.position[2]-lifted[2])<.001){result=test;actor.stepGuard=CC.STEP_GUARD_STEPS+1;actor.vel[1]=0;}}}
    actor.pos=result.position;
    const vertical=query.resolveCapsule(actor,[actor.pos[0],actor.pos[1]+(actor.stepGuard>0?Math.max(0,delta[1]):delta[1])/count,actor.pos[2]]);if(vertical.valid===false){actor.collisionError=vertical.reason;actor.vel=[0,0,0];return true;}actor.pos=vertical.position;
    for(const n of [...result.normals,...vertical.normals]){
      if(n[1]>.01&&(!normal||n[1]>normal[1]))normal=n;
      if(Math.abs(n[1])<.5){blocked=true;const length=Math.hypot(n[0],n[2]),nx=n[0]/length,nz=n[2]/length,dot=actor.vel[0]*nx+actor.vel[2]*nz;if(dot<0){actor.vel[0]-=dot*nx;actor.vel[2]-=dot*nz;if(!friction){actor.vel[0]*=CFG.wallFriction;actor.vel[2]*=CFG.wallFriction;friction=true;}}}
      if(n[1]<-.5&&actor.vel[1]>0)actor.vel[1]=0;
    }
  }
  const ray=query.trace([actor.pos[0],actor.pos[1]+.05,actor.pos[2]],[0,-1,0],.4),n=ray.normal;
  if(ray.object&&n?.[1]>=Math.cos(50*Math.PI/180)&&actor.vel[1]<=0){const radius=Math.min(actor.radius,actor.height/2),floor=actor.pos[1]+.05-ray.distance+(radius+.005)/n[1]-radius;if(Math.abs(actor.pos[1]-floor)<=.35&&!(actor.stepGuard>0&&floor<actor.pos[1]-CFG.skin)){const snapped=query.resolveCapsule(actor,[actor.pos[0],floor,actor.pos[2]]);if(snapped.valid!==false){actor.pos=snapped.position;normal=n;}else actor.collisionError=snapped.reason;}}
  if(actor.stepGuard>0&&!actor.collisionError){normal??=[0,1,0];actor.vel[1]=Math.max(0,actor.vel[1]);}
  actor.groundNormal=normal;actor.onSlope=!!normal;actor.grounded=!!normal&&normal[1]>=Math.cos(50*Math.PI/180)&&actor.vel[1]<=0;
  if(actor.grounded)actor.vel[1]=0;
  // World owns countdown: motor and knockback may both move in one tick.
  return blocked;
}
