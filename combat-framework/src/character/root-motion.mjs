import {CC} from '../core/constants.mjs';
const rootPrefixes=new WeakMap();
/** Integrate baked interval displacements, including fractional samples and loop seams. */
export function integrateRoot(clip,start,end){
 if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)throw Error('Invalid root interval');
 const duration=clip.duration;if(!(duration>0))return [0,0,0];
 let prefix=rootPrefixes.get(clip);
 if(!prefix){prefix=new Float64Array(clip.frames*3);for(let frame=1;frame<clip.frames;frame++)for(let axis=0;axis<3;axis++)prefix[frame*3+axis]=prefix[(frame-1)*3+axis]+clip.rootDelta[frame*3+axis];rootPrefixes.set(clip,prefix);}
 const cumulative=time=>{
  const cycles=clip.loop?Math.floor(time/duration+1e-10):0,local=Math.max(0,Math.min(duration,time-cycles*duration)),f=Math.min(clip.frames-1,local*clip.fps),a=Math.floor(f),b=Math.min(clip.frames-1,a+1),u=f-a;
  return [0,1,2].map(axis=>cycles*prefix[(clip.frames-1)*3+axis]+prefix[a*3+axis]+u*(prefix[b*3+axis]-prefix[a*3+axis]));
 };
 const from=cumulative(start),to=cumulative(end);return to.map((v,i)=>v-from[i]);
}
/** Only this result may enter collision. Root and motor are never applied separately. */
export function arbitrateRoot(state,{mode='inPlace',speed,motorDelta,rootDelta,warpDelta,dt,maxStep=.22}){
 let weight=state.weight??0;
 if(mode==='inPlace'){
  const desired=speed<=CC.SPD_WALK?1:speed>=CC.SPD_JOG?0:(CC.SPD_JOG-speed)/(CC.SPD_JOG-CC.SPD_WALK);
  const direction=Math.sign(desired-weight);
  if(!(state.handoffRemaining>0)||!state.handoffDirection){state.handoffDirection=direction;state.handoffRemaining=direction?.12:0;}
  if(direction===state.handoffDirection||!direction)weight+=Math.max(-dt/.12,Math.min(dt/.12,desired-weight));
  state.handoffRemaining=Math.max(0,(state.handoffRemaining||0)-dt);
 }else if(mode==='rootMotion'){weight=1;state.handoffRemaining=0;}
 else if(mode==='warp'){weight=0;state.handoffRemaining=0;}
 else throw Error('Unknown root motion mode');
 state.weight=weight;
 const delta=mode==='warp'?[...warpDelta]:motorDelta.map((v,i)=>weight*rootDelta[i]+(1-weight)*v),length=Math.hypot(...delta),clamped=length>maxStep;
 if(clamped)for(let i=0;i<3;i++)delta[i]*=maxStep/length;
 return {delta,weight,clamped};
}
