/** Circular phase control. targetPhase is the continuing gait clock; sourcePhase is the sampled new clip. */
export const wrapPhase=value=>((value+.5)%1+1)%1-.5;
export function phaseRate({speed,sourceSpeed,sourcePhase,targetPhase,cyclePeriod,reliable=true,research=false,maxRateDelta=.12,tolerance=.08,settleTime=.4}){
 const raw=sourceSpeed>.1?speed/sourceSpeed:1,lo=1-maxRateDelta,hi=1+maxRateDelta;
 const speedClamped=raw<lo||raw>hi,valid=reliable&&Number.isFinite(sourcePhase)&&Number.isFinite(targetPhase)&&Number.isFinite(cyclePeriod)&&cyclePeriod>0;
 const error=valid?wrapPhase(targetPhase-sourcePhase):0;
 const correction=valid&&!research&&!speedClamped&&Math.abs(error)>tolerance?error*cyclePeriod/settleTime:0;
 return {rate:Math.max(lo,Math.min(hi,raw+correction)),raw,error,correction,speedClamped};
}

export function sampleDatabasePhase(db,base,clip,time){
 const f=Math.max(0,Math.min(clip.frames-1,time*30)),a=Math.floor(f),b=Math.min(clip.frames-1,a+1),u=f-a;
 const first=db.footPhase[(base+a)*2]/255,next=db.footPhase[(base+b)*2]/255;
 return ((first+wrapPhase(next-first)*u)%1+1)%1;
}
