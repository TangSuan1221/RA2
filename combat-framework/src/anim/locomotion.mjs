import {phaseRate,sampleDatabasePhase} from './phase-sync.mjs';
import {predictTrajectory} from './trajectory.mjs';
import {CC,MM} from '../core/constants.mjs';
import {buildMMDB,makeFeature,SAMPLE_TIMES,cost} from './mm.mjs';
import {knnSearch} from './kdtree.mjs';
import {projectOne} from './mm.mjs';

// In-place source clips have no measured root translation. Calibrations are authored
// controller speeds, explicitly separate from captured pose evidence.
export const CALIBRATION={Idle_Loop:0,Walk_Loop:CC.SPD_WALK,Jog_Fwd_Loop:CC.SPD_JOG,Sprint_Loop:CC.SPD_SPRINT,Crouch_Fwd_Loop:CC.SPD_CROUCH,Crouch_Idle_Loop:0};
export function poseFeature(clip,index){const m=clip.landmarks[index],prev=clip.landmarks[Math.max(0,index-1)],next=clip.landmarks[Math.min(clip.frames-1,index+1)],dt=(Math.min(clip.frames-1,index+1)-Math.max(0,index-1))/30||1/30;return ['foot_l','foot_r'].flatMap(n=>[m[n][0]-m.pelvis[0],m[n][2]-m.pelvis[2],(next[n][0]-prev[n][0])/dt,(next[n][2]-prev[n][2])/dt]);}
export function createLocomotionDatabase(manifest){const clips=manifest.clips.filter(c=>c.id in CALIBRATION||c.measuredRoot),frames=[];clips.forEach((clip,clipIndex)=>{for(let f=0;f<clip.frames;f++){
  let speed=CALIBRATION[clip.id]||0,velocity=[0,speed],heading=[0,1],traj=SAMPLE_TIMES.map(t=>({pos:[0,speed*t],facing:[0,1]}));
  if(clip.measuredRoot){const i=Math.max(0,f-1),j=Math.min(clip.frames-1,f+1),delta=(j-i)/30||1/30,angle=clip.headings[f],co=Math.cos(angle),si=Math.sin(angle),local=(x,z)=>[x*co-z*si,x*si+z*co],root=clip.rootPath[f];velocity=local((clip.rootPath[j][0]-clip.rootPath[i][0])/delta,(clip.rootPath[j][2]-clip.rootPath[i][2])/delta);speed=Math.hypot(...velocity);heading=speed>.01?[-velocity[0]/speed,velocity[1]/speed]:[0,1];traj=SAMPLE_TIMES.map(t=>{const k=Math.max(0,Math.min(clip.frames-1,Math.round(f+t*30))),pos=local(clip.rootPath[k][0]-root[0],clip.rootPath[k][2]-root[2]),turn=clip.headings[k]-angle;return {pos,facing:[Math.sin(turn),Math.cos(turn)]};});}
  const tag=clip.locomotionTag??(clip.id.startsWith('Crouch')?4:speed<.1?0:speed<2.45?1:speed<4.48?2:3);
  const feature=makeFeature({traj,pose:poseFeature(clip,f),heading,velocity});if(!feature.every(Number.isFinite))throw Error('Invalid source features '+clip.id);frames.push({feature,clipIndex,clipId:clip.id,time:f/30,tag,footPhase:(clip.phases?.[f]||[0,0]).map(p=>Math.round(p*255))});
}});const db=buildMMDB(frames);db.sourceClips=clips;db.authoredRootCalibration=CALIBRATION;db.measuredFrameCount=clips.filter(c=>c.measuredRoot).reduce((n,c)=>n+c.frames,0);return db;}
export class LocomotionMatcher {
  constructor(db){this.db=db;this.current=null;this.time=0;this.lastSearch=-Infinity;this.recent=new Map();this.searches=0;this.lastSpeed=0;this.trajectoryHistory=[];
    if(!db.nodeTagMasks){const masks=new Uint8Array(db.tree.nodes.length),visit=ni=>{const node=db.tree.nodes[ni];let mask=0;if(node.count){for(let j=node.start;j<node.start+node.count;j++)mask|=1<<db.tagOfFrame[db.tree.idx[j]];}else{if(node.left>=0)mask|=visit(node.left);if(node.right>=0)mask|=visit(node.right);}return masks[ni]=mask;};visit(db.tree.root);db.nodeTagMasks=masks;}
  }
  update(actor,dt,step,allowSearch=true){const db=this.db,speed=Math.hypot(actor.vel[0],actor.vel[2]),now=step/60;
    this.trajectoryHistory.push({time:now,pos:[...actor.pos],yaw:actor.yaw});
    while(this.trajectoryHistory.length>1&&this.trajectoryHistory[1].time<now-.5)this.trajectoryHistory.shift();
    this.lastDecision=null;
    const tag=actor.posture==='crouch'?4:speed<.1?0:speed<2.45?1:speed<4.48?2:3;
    const playingClip=this.current===null?null:db.sourceClips[db.clipIndexOfFrame[this.current]];
    const playingFrame=playingClip?this.current-Math.round(db.timeOfFrame[this.current]*30)+Math.min(playingClip.frames-1,Math.floor(this.time*30)):null;
    const sourceSpeed=playingFrame===null?0:Math.hypot(db.features[playingFrame*32+30],db.features[playingFrame*32+31])*MM.MAX_DB_SPEED;
    const rawRate=sourceSpeed>.1?speed/sourceSpeed:1;
    this.playRate=Math.max(1-MM.PLAYRATE_MAX,Math.min(1+MM.PLAYRATE_MAX,rawRate));
    const anticipatedSearch=!playingClip||(!playingClip.loop&&this.time>=playingClip.duration-MM.BLEND_T)||db.tagOfFrame[playingFrame]!==tag||(this.lastVelocity&&Math.hypot(actor.vel[0]-this.lastVelocity[0],actor.vel[2]-this.lastVelocity[2])>MM.RESEARCH_DV);
    if(playingClip?.phaseReliable&&playingClip.cyclePeriod>0){
      const base=this.current-Math.round(db.timeOfFrame[this.current]*30),sourcePhase=sampleDatabasePhase(db,base,playingClip,this.time);
      if(this.gaitPhase===undefined)this.gaitPhase=sourcePhase;
      this.phaseControl=phaseRate({speed,sourceSpeed,sourcePhase,targetPhase:this.gaitPhase,cyclePeriod:playingClip.cyclePeriod,research:!!anticipatedSearch,maxRateDelta:MM.PLAYRATE_MAX});
      this.playRate=this.phaseControl.rate;
      // A reliable-to-reliable clip switch preserves this clock; never jump playback time to erase error.
      this.gaitPhase=(this.gaitPhase+Math.max(1-MM.PLAYRATE_MAX,Math.min(1+MM.PLAYRATE_MAX,rawRate))*dt/playingClip.cyclePeriod)%1;
    }else {this.gaitPhase=undefined;this.phaseControl=null;}
    this.time+=dt*this.playRate;
    const currentClip=this.current===null?null:db.sourceClips[db.clipIndexOfFrame[this.current]];
    if(currentClip)this.time=currentClip.loop?this.time%Math.max(currentClip.duration,1/30):Math.min(this.time,currentClip.duration);
    const nearEnd=currentClip&&!currentClip.loop&&this.time>=currentClip.duration-MM.BLEND_T;
    const dv=this.lastVelocity?Math.hypot(actor.vel[0]-this.lastVelocity[0],actor.vel[2]-this.lastVelocity[2]):0;
    this.lastVelocity=[actor.vel[0],0,actor.vel[2]];
    const force=!currentClip||nearEnd||dv>MM.RESEARCH_DV||db.tagOfFrame[playingFrame]!==tag;
    if(allowSearch&&(force||now-this.lastSearch>=MM.SEARCH_THROTTLE_MS/1000)){
      const sin=Math.sin(actor.yaw),cos=Math.cos(actor.yaw),vx=actor.vel[0]*cos-actor.vel[2]*sin,vz=actor.vel[0]*sin+actor.vel[2]*cos;
      const seedClip=currentClip||db.sourceClips.find(c=>c.id==='Idle_Loop')||db.sourceClips[0];
      let pose=poseFeature(seedClip,currentClip?Math.min(currentClip.frames-1,Math.floor(this.time*30)):0);
      if(actor.boneWorld&&actor.skeletonPlayer){const bones=actor.skeletonPlayer.bones,pelvis=actor.boneWorld.positions[bones.findIndex(b=>b.name==='pelvis')],feet=['foot_l','foot_r'].map(name=>actor.boneWorld.positions[bones.findIndex(b=>b.name===name)]),elapsed=Math.max(dt,now-this.lastSearch);pose=feet.flatMap((foot,i)=>[foot[0]-pelvis[0],foot[2]-pelvis[2],this.previousFeet?Math.max(-12,Math.min(12,(foot[0]-this.previousFeet[i][0])/elapsed)):0,this.previousFeet?Math.max(-12,Math.min(12,(foot[2]-this.previousFeet[i][2])/elapsed)):0]);this.previousFeet=feet.map(p=>p.slice());}
      const trajectory=SAMPLE_TIMES.map(t=>{
        if(t>=0){const predicted=predictTrajectory(actor,t),[x,z]=predicted.pos,turn=predicted.yaw-actor.yaw;return {pos:[x*cos-z*sin,x*sin+z*cos],facing:[Math.sin(turn),Math.cos(turn)]};}
        if(this.trajectoryHistory[0].time>now+t)return {pos:[vx*t,vz*t],facing:[0,1]};
        let i=0;while(i+1<this.trajectoryHistory.length&&this.trajectoryHistory[i+1].time<now+t)i++;
        const a=this.trajectoryHistory[i],b=this.trajectoryHistory[Math.min(i+1,this.trajectoryHistory.length-1)],u=(now+t-a.time)/(b.time-a.time||1),x=a.pos[0]+(b.pos[0]-a.pos[0])*u-actor.pos[0],z=a.pos[2]+(b.pos[2]-a.pos[2])*u-actor.pos[2],delta=Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw)),yaw=a.yaw+delta*u-actor.yaw;
        return {pos:[x*cos-z*sin,x*sin+z*cos],facing:[Math.sin(yaw),Math.cos(yaw)]};
      });
      const query=makeFeature({traj:trajectory,pose,heading:speed>.1?[-vx/speed,vz/speed]:[0,1],velocity:[vx,vz]});
      const eligible=index=>{const c=db.sourceClips[db.clipIndexOfFrame[index]];return db.tagOfFrame[index]===tag&&(c.loop||db.timeOfFrame[index]<c.duration-MM.BLEND_T)&&(tag!==4||((CALIBRATION[c.id]===0)===(speed<.1)));};
      const trajectoryError=index=>{let squared=0;for(let i=0;i<5;i++){const divisor=MM.MAX_DB_SPEED*Math.max(Math.abs(SAMPLE_TIMES[i]),.2);for(const axis of [0,1])squared+=((db.features[index*32+i*4+axis]-query[i*4+axis])*divisor)**2;}return Math.sqrt(squared/10);};
      let candidates=knnSearch(db.tree,projectOne(query,db.pca),MM.KNN,eligible,ni=>(db.nodeTagMasks[ni]&(1<<tag))!==0);
      const trajectoryCandidates=candidates.filter(c=>trajectoryError(c.index)<MM.TRAJ_REJECT_RMSE);this.expandedSearch=false;this.candidateCount=candidates.length;
      const trajectoryConstrained=trajectoryCandidates.length>0;if(trajectoryConstrained)candidates=trajectoryCandidates;
      let best=null;
      if(currentClip&&!nearEnd){const local=Math.min(currentClip.frames-1,Math.floor(this.time*30)),idx=this.current-Math.round(db.timeOfFrame[this.current]*30)+local;if(eligible(idx)&&(!trajectoryConstrained||trajectoryError(idx)<MM.TRAJ_RETAIN_RMSE))best={index:idx,cost:cost(query,db.features.subarray(idx*32,idx*32+32)).total+MM.CONTINUING_BIAS,continuing:true};}
      for(const {index}of candidates){if((this.recent.get(index)??-Infinity)>now-MM.RESELECT_T)continue;if(currentClip&&db.clipIndexOfFrame[index]===db.clipIndexOfFrame[this.current]&&Math.abs(db.timeOfFrame[index]-this.time)<MM.POSE_JUMP_T)continue;const value=cost(query,db.features.subarray(index*32,index*32+32)).total;if(!best||value<best.cost)best={index,cost:value};}
      if(best){const previous=this.current;this.lastDecision={step,frame:best.index,continuing:!!best.continuing,fallback:false,reselected:!best.continuing&&(this.recent.get(best.index)??-Infinity)>now-MM.RESELECT_T,poseJump:!best.continuing&&previous!==null&&db.clipIndexOfFrame[best.index]===db.clipIndexOfFrame[previous]&&Math.abs(db.timeOfFrame[best.index]-this.time)<MM.POSE_JUMP_T};this.current=best.index;if(!best.continuing){this.time=db.timeOfFrame[best.index];this.recent.set(best.index,now);}}
      else this.lastDecision={step,frame:this.current,continuing:true,fallback:true,reselected:false,poseJump:false};
      for(const [f,t]of this.recent)if(t<now-MM.RESELECT_T)this.recent.delete(f);
      this.lastSearch=now;this.lastSpeed=speed;this.searches++;
    }
    if(this.current===null)return null;
    return {clip:db.clips[db.clipIndexOfFrame[this.current]].id,time:this.time,frame:this.current,degraded:db.degraded};
  }
}


