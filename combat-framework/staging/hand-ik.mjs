import {Q} from '../src/anim/inertial.mjs';
import {V3} from '../src/core/math.mjs';
import {forwardKinematics,slerp} from '../src/anim/skeleton.mjs';
import {solveTwoBone} from '../src/anim/ik.mjs';
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function between(a,b){a=V3.norm(a);b=V3.norm(b);const dot=V3.dot(a,b);if(dot<-.99999){const axis=V3.norm(cross(a,Math.abs(a[0])<.8?[1,0,0]:[0,1,0]));return [...axis,0];}return Q.norm([...cross(a,b),1+dot]);}
export function handWorld(actor,point){const scale=actor.modelScale??1,si=Math.sin(actor.yaw),co=Math.cos(actor.yaw);return [actor.pos[0]+scale*(point[0]*co+point[2]*si),actor.pos[1]+scale*point[1]+(actor.modelYOffset??0),actor.pos[2]+scale*(-point[0]*si+point[2]*co)];}
export function applyHandContact(actor,bones,worldGoal,{side='r',maxCorrection=.05}={}){
 if(!worldGoal.every(Number.isFinite)||!Number.isFinite(maxCorrection)||maxCorrection<0)throw Error('Invalid hand contact');
 const shoulder=bones.findIndex(b=>b.name==='upperarm_'+side),elbow=bones.findIndex(b=>b.name==='lowerarm_'+side),hand=bones.findIndex(b=>b.name==='hand_'+side);if([shoulder,elbow,hand].some(i=>i<0))throw Error('Missing arm chain');
 const chain=[shoulder,elbow,hand],original=chain.map(i=>actor.pose.rotations[i].slice());
 const fk=actor.boneWorld,before=handWorld(actor,fk.positions[hand]),delta=V3.sub(worldGoal,before),distance=V3.len(delta),goal=V3.add(before,V3.mul(delta,Math.min(1,maxCorrection/(distance||1)))),scale=actor.modelScale??1,si=Math.sin(actor.yaw),co=Math.cos(actor.yaw),x=(goal[0]-actor.pos[0])/scale,z=(goal[2]-actor.pos[2])/scale,local=[x*co-z*si,(goal[1]-actor.pos[1]-(actor.modelYOffset??0))/scale,x*si+z*co];
 if(maxCorrection===0)return {anchorError:distance,displacement:0,reached:distance<1e-5};
 const a=fk.positions[shoulder],b=fk.positions[elbow],c=fk.positions[hand],solved=solveTwoBone(a,local,[side==='r'?-.5:.5,-1,.2],V3.len(V3.sub(b,a)),V3.len(V3.sub(c,b))),handRotation=fk.rotations[hand];
 const upper=Q.mul(between(V3.sub(b,a),V3.sub(solved.knee,a)),fk.rotations[shoulder]);actor.pose.rotations[shoulder]=Q.norm(Q.mul(Q.conj(fk.rotations[bones[shoulder].parent]),upper));
 const updated=forwardKinematics(bones,actor.pose.rotations,actor.pose.translations),lower=Q.mul(between(V3.sub(updated.positions[hand],updated.positions[elbow]),V3.sub(solved.ankle,updated.positions[elbow])),updated.rotations[elbow]);actor.pose.rotations[elbow]=Q.norm(Q.mul(Q.conj(updated.rotations[shoulder]),lower));actor.pose.rotations[hand]=Q.norm(Q.mul(Q.conj(lower),handRotation));
 actor.boneWorld=forwardKinematics(bones,actor.pose.rotations,actor.pose.translations);let after=handWorld(actor,actor.boneWorld.positions[hand]);if(V3.len(V3.sub(after,before))>maxCorrection){const solvedRotations=chain.map(i=>actor.pose.rotations[i].slice()),apply=u=>{for(let j=0;j<chain.length;j++)actor.pose.rotations[chain[j]]=slerp(original[j],solvedRotations[j],u);actor.boneWorld=forwardKinematics(bones,actor.pose.rotations,actor.pose.translations);return handWorld(actor,actor.boneWorld.positions[hand]);};let lo=0,hi=1;for(let j=0;j<16;j++){const mid=(lo+hi)/2;if(V3.len(V3.sub(apply(mid),before))<=maxCorrection)lo=mid;else hi=mid;}after=apply(lo);}return {anchorError:V3.len(V3.sub(after,worldGoal)),displacement:V3.len(V3.sub(after,before)),reached:V3.len(V3.sub(after,worldGoal))<1e-5};
}
