import {forwardKinematics, sampleAnimation, slerp} from './skeleton.mjs';
import {Q} from './inertial.mjs';

export const diveId = 'Dive_Roll_To_Prone';
export const diveDuration = 1.4;
const smooth = t => (t = Math.max(0, Math.min(1, t)), t*t*(3-2*t));
export const diveTravel = time => 1.65 * (1 - (1 - Math.min(1, time/.76))**2);

// Preserve the prone spine. Transfer the authored aim in character space at
// the shoulders and neck, then use local rotations down each arm chain.
export function applyProneAim(bones, pose, upper) {
  const body = forwardKinematics(bones, pose.rotations, pose.translations);
  const aim = forwardKinematics(bones, upper.rotations, upper.translations);
  for (const [i,b] of bones.entries()) {
    if (/^(clavicle_[lr]|neck_01)$/.test(b.name))
      pose.rotations[i] = Q.mul(Q.conj(body.rotations[b.parent]), aim.rotations[i]);
    else if (/upperarm|lowerarm|hand|index|middle|ring|pinky|thumb|^Head$/i.test(b.name))
      pose.rotations[i] = upper.rotations[i];
  }
}

export function makeDive(bones, stand, crawl, aim) {
  const start = sampleAnimation(stand, 0, false);
  const low = sampleAnimation(crawl, 3, false);
  const ready = structuredClone(low);
  applyProneAim(bones, ready, sampleAnimation(aim, 0, false));
  const quat = [], trans = [], frames = 43;
  for (let f=0; f<frames; f++) {
    const t=f/30, drop=smooth(t/.52), brace=smooth((t-.95)/.45);
    const roll=Math.PI*(smooth((t-.06)/.44)-smooth((t-.68)/.62));
    const rotations=start.rotations.map((q,i)=>slerp(slerp(q,low.rotations[i],drop),ready.rotations[i],brace));
    const translations=start.translations.map((p,i)=>p.map((v,j)=>v+(low.translations[i][j]-v)*drop));
    rotations[0]=Q.mul([0,0,Math.sin(roll/2),Math.cos(roll/2)],rotations[0]);
    const fk=forwardKinematics(bones,rotations,translations);
    const pelvis=fk.positions[1];
    translations[0][0]-=pelvis[0]*drop;
    const lowest=Math.min(...fk.positions.filter((_,i)=>bones[i].name!=='root').map(p=>p[1]));
    translations[0][1]+=(.065-lowest)*drop + .16*Math.sin(Math.PI*Math.min(1,t/.5));
    quat.push(...rotations.flat());trans.push(...translations.flat());
  }
  return {bones:bones.length,skeletonId:stand.skeletonId,frames,fps:30,duration:diveDuration,
    loop:false,quat:new Float32Array(quat),trans:new Float32Array(trans),notifies:[],rootDelta:new Float32Array(frames*3)};
}
