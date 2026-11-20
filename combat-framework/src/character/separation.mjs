import {CC} from '../core/constants.mjs';
import {fitsBody,trace} from './collision.mjs';
function cornerBehind(actor,direction,obstacles){
 const normals=[];
 for(const angle of [-Math.PI/4,0,Math.PI/4]){const co=Math.cos(angle),si=Math.sin(angle),dir=[direction[0]*co-direction[2]*si,0,direction[0]*si+direction[2]*co],origin=[actor.pos[0],actor.pos[1]+actor.height*.5,actor.pos[2]],hit=trace(origin,dir,CC.PUSH_CORNER_DISTANCE,obstacles);if(!hit.object)continue;let normal=hit.normal;
 if(!normal&&hit.object.min){const point=origin.map((v,i)=>v+dir[i]*hit.distance),faces=[];for(const axis of [0,2])for(const sign of [-1,1])faces.push({axis,sign,distance:Math.abs(point[axis]-(sign<0?hit.object.min[axis]:hit.object.max[axis]))});faces.sort((a,b)=>a.distance-b.distance);normal=[0,0,0];normal[faces[0].axis]=faces[0].sign;}if(normal)normals.push(normal);
 }
 return normals.some((a,i)=>normals.slice(i+1).some(b=>a.reduce((sum,v,j)=>sum+v*b[j],0)<=1e-6));
}
/** Upright capsule separation, position-only; paired actions remain anchored. */
export function separateActors(actors,player,obstacles,dt,step){
 for(const actor of actors){actor.separationDelta=[0,0,0];actor.separationSpent=0;}
 for(let i=0;i<actors.length;i++)for(let j=i+1;j<actors.length;j++){
 const a=actors[i],b=actors[j];if(a.hp<=0||b.hp<=0||a.posture==='prone'||b.posture==='prone'||a.pos[1]+a.height<=b.pos[1]||b.pos[1]+b.height<=a.pos[1])continue;
 const dx=b.pos[0]-a.pos[0],dz=b.pos[2]-a.pos[2],distance=Math.hypot(dx,dz),overlap=a.radius+b.radius-distance;if(overlap<=0)continue;const n=distance>1e-6?[dx/distance,0,dz/distance]:[1,0,0],total=Math.min(overlap,CC.PUSH_SPEED*dt);
 const locked=x=>x.execLock||x.traversal||x.postureAction||x.attack||step<x.hitstopUntil;let wa=(b.mass||CC.MASS)/((a.mass||CC.MASS)+(b.mass||CC.MASS)),wb=1-wa;
 if(a===player){wa=Math.min(.5,wa);wb=1-wa;}if(b===player){wb=Math.min(.5,wb);wa=1-wb;}
 if(locked(a)){wa=0;wb=locked(b)?0:1;}if(locked(b)){wb=0;wa=locked(a)?0:1;}
 if(a===player&&(locked(b)||cornerBehind(a,n.map(v=>-v),obstacles))){wa=0;wb=locked(b)?0:1;}if(b===player&&(locked(a)||cornerBehind(b,n,obstacles))){wb=0;wa=locked(a)?0:1;}
 let da=n.map(v=>-v*total*wa),db=n.map(v=>v*total*wb);
 const clear=(actor,d)=>fitsBody(actor,actor.pos.map((v,k)=>v+d[k]),actor.height,obstacles);
 if(!clear(a,da)){da=[0,0,0];if(!locked(b))db=n.map(v=>v*total);}if(!clear(b,db)){db=[0,0,0];if(a!==player&&!locked(a))da=n.map(v=>-v*total);}
 if(!clear(a,da))da=[0,0,0];if(!clear(b,db))db=[0,0,0];
 for(const [actor,d]of [[a,da],[b,db]]){const length=Math.hypot(...d),remaining=Math.max(0,CC.PUSH_SPEED*dt-actor.separationSpent);if(length>remaining)for(let k=0;k<3;k++)d[k]*=remaining/length;}
 // If the AI cannot yield, never transfer its missing displacement to the player.
 const la=Math.hypot(...da),lb=Math.hypot(...db);if(a===player&&la>lb)da=da.map(v=>v*lb/la);if(b===player&&lb>la)db=db.map(v=>v*la/lb);
 for(const [actor,d]of [[a,da],[b,db]]){actor.separationSpent+=Math.hypot(...d);for(let k=0;k<3;k++){actor.pos[k]+=d[k];actor.separationDelta[k]+=d[k];}}
 }
}
