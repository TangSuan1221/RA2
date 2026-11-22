import {CC,CB,DT} from '../core/constants.mjs';
import {fits,trace} from './collision.mjs';
import {clearSegment} from '../ai/navigation.mjs';

// Box-fixture traversal. Curved surfaces and authored hand-contact warping are
// separate gates; this module never disables collision to force a traversal.
export function probeTraversal(actor,obstacles){
  if(!actor.grounded||actor.aim||actor.attack||actor.posture==='prone')return null;
  const dir=[Math.sin(actor.yaw),0,Math.cos(actor.yaw)],origin=[actor.pos[0],actor.pos[1]+.35,actor.pos[2]],hit=trace(origin,dir,1.2,obstacles);
  if(!hit.object||!Array.isArray(hit.object.min)||!Array.isArray(hit.object.max))return null;
  const box=hit.object,rise=box.max[1]-actor.pos[1];
  if(rise<=CC.STEP_UP||rise>CC.CLIMB_MAX)return null;
  const at=origin.map((v,i)=>v+dir[i]*hit.distance),face=[0,2].map(axis=>({axis,error:Math.min(Math.abs(at[axis]-box.min[axis]),Math.abs(at[axis]-box.max[axis]))})).sort((a,b)=>a.error-b.error)[0].axis;
  if(Math.abs(dir[face])<Math.cos(40*Math.PI/180))return null;
  const type=rise<=CC.VAULT_MAX?'vault':'climb',speed=Math.hypot(actor.vel[0],actor.vel[2]);
  if(type==='vault'&&speed>=.1&&speed<CC.SPD_WALK*.6)return null;
  const end=[...actor.pos],edge=dir[face]>0?box.max[face]:box.min[face];
  if(type==='vault'){
    const distance=(edge-actor.pos[face])/dir[face]+(actor.radius+.05)/Math.abs(dir[face]);
    if(distance>1.6)return null;
    end[0]+=dir[0]*distance;end[2]+=dir[2]*distance;end[1]=0;
    for(const b of obstacles)if(end[0]>b.min[0]&&end[0]<b.max[0]&&end[2]>b.min[2]&&end[2]<b.max[2]&&b.max[1]<=box.max[1])end[1]=Math.max(end[1],b.max[1]);
  }else{
    const distance=hit.distance+(actor.radius+.05)/Math.abs(dir[face]);
    end[0]+=dir[0]*distance;end[2]+=dir[2]*distance;end[1]=box.max[1];
    if(end[0]-actor.radius<box.min[0]||end[0]+actor.radius>box.max[0]||end[2]-actor.radius<box.min[2]||end[2]+actor.radius>box.max[2])return null;
  }
  let height=CC.STAND_H,posture='stand';
  if(!fits(end,actor.radius,height,obstacles)){if(type!=='climb'||!fits(end,actor.radius,CC.CROUCH_H,obstacles))return null;height=CC.CROUCH_H;posture='crouch';}
  const top=box.max[1]+.05,points=[[...actor.pos],[actor.pos[0],top,actor.pos[2]],[end[0],top,end[2]],end];
  for(let i=1;i<points.length;i++)if(!clearSegment(points[i-1],points[i],obstacles,actor.radius,height))return null;
  return {id:box.id||obstacles.indexOf(box),type,points,height,posture,duration:type==='vault'?.8:1.2};
}
export function updateTraversalCandidate(actor,obstacles,step,intent){
  if(!intent||step<(actor.traversalCooldown||0)||step<actor.busyUntil){actor.traversalCandidate=null;return;}
  const candidate=probeTraversal(actor,obstacles),old=actor.traversalCandidate;
  actor.traversalCandidate=candidate?{...candidate,since:old?.id===candidate.id?old.since:step}:null;
}
export function beginTraversal(actor,step,obstacles){
  const cached=actor.traversalCandidate;if(!cached)return false;
  const runningVault=cached.type==='vault' && Math.hypot(actor.vel[0],actor.vel[2])>=CC.SPD_JOG;
  if(!runningVault && step-cached.since<Math.ceil(CB.CTX_PICK_MS/1000/DT))return false;
  const c=probeTraversal(actor,obstacles);if(!c||c.id!==cached.id)return false;
  actor.traversal={...c,duration:c.type==='vault'?c.duration/(actor.rateFor?.('Safety_Vault')??1):c.duration,elapsed:0};actor.traversalCandidate=null;actor.state=c.type;actor.busyUntil=Infinity;actor.vel=[0,0,0];actor.height=c.height;actor.posture=c.posture;actor.clip=c.type==='vault'?'Safety_Vault':'ClimbUp_2m';actor.clipTime=0;actor.grounded=false;return true;
}
export function advanceTraversal(actor,dt,obstacles,step){
  const t=actor.traversal;if(!t)return false;
  t.elapsed=Math.min(t.duration,t.elapsed+dt);const phase=t.elapsed/t.duration*3,index=Math.min(2,Math.floor(phase)),u=Math.min(1,phase-index),smooth=u*u*(3-2*u),from=t.points[index],to=t.points[index+1],next=from.map((v,i)=>v+(to[i]-v)*smooth);
  if(!clearSegment(actor.pos,next,obstacles,actor.radius,actor.height)||!fits(next,actor.radius,actor.height,obstacles)){actor.traversal=null;actor.state='idle';actor.busyUntil=step;actor.traversalCooldown=step+15;return false;}
  actor.pos=next;actor.clipTime=t.elapsed/t.duration*(t.type==='vault'?22/30:39/30);
  if(t.elapsed>=t.duration){actor.traversal=null;actor.state='idle';actor.busyUntil=step;actor.traversalCooldown=step+15;actor.grounded=true;}
  return true;
}
