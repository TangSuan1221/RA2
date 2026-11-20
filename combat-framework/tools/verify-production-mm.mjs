import fs from 'node:fs';
import {decodeMMDB} from '../src/anim/database.mjs';
import {LocomotionMatcher} from '../src/anim/locomotion.mjs';
import {SAMPLE_TIMES} from '../src/anim/mm.mjs';
import {World} from '../src/world.mjs';
import {CC,MM} from '../src/core/constants.mjs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
const manifest=JSON.parse(fs.readFileSync('public/data/combat/runtime-animations.json')),bytes=fs.readFileSync('public/data/combat/locomotion.mmdb'),db=decodeMMDB(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),manifest.clips);
const matcher=new LocomotionMatcher(db),actor={pos:[0,0,0],yaw:0,vel:[0,0,CC.SPD_JOG],posture:'stand'},result=matcher.update(actor,1/60,0),feature=db.features.subarray(result.frame*32,result.frame*32+32);let squared=0;
for(let i=0;i<5;i++){const divisor=MM.MAX_DB_SPEED*Math.max(Math.abs(SAMPLE_TIMES[i]),.2),x=feature[i*4]*divisor,z=feature[i*4+1]*divisor;squared+=x*x+(z-CC.SPD_JOG*SAMPLE_TIMES[i])**2;}
const rmse=Math.sqrt(squared/10),b2={clip:result.clip,tag:db.tagOfFrame[result.frame],rmseMeters:rmse,threshold:.18,pass:db.tagOfFrame[result.frame]!==0&&rmse<.18};
const w=new World({enemyCount:0,obstacles:[]});w.setAnimationDatabase(db,manifest);
const ab=b=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),bones=JSON.parse(fs.readFileSync('public/data/combat/bones.json')).bones,clips=new Map(manifest.clips.map(c=>[c.id,decodeAnimation(ab(fs.readFileSync(`public/data/combat/anim/${c.id}.bin`)))]));
w.setSkeletonAnimations(bones,clips);let switches=0,hard=0,fallback=0,searches=0,last=null,expanded=0;const switchDetails=[];
for(let step=0;step<1500;step++){const yaw=step*.7*Math.PI/180,speed=1+4*Math.abs(Math.sin(step*.01));w.update({x:Math.sin(yaw)*speed/CC.SPD_SPRINT,z:Math.cos(yaw)*speed/CC.SPD_SPRINT,sprint:true});const a=w.player,d=a.matcher.lastDecision;if(last!==null&&a.clip!==last){switches++;switchDetails.push({step,from:last,to:a.clip,speed:Math.hypot(a.vel[0],a.vel[2]),time:a.clipTime,frame:a.matcher.current,tag:db.tagOfFrame[a.matcher.current]});}last=a.clip;if(d){searches++;hard+=Number(d.reselected||d.poseJump);fallback+=Number(d.fallback);expanded+=Number(a.matcher.expandedSearch);}}
const b3={steps:1500,input:'yaw=(step*.7) degrees, desired speed=1+4*abs(sin(step*.01)); exact 60Hz motor; real MMDB',switches,switchRate:switches/1500,searches,hardViolations:hard,fallbacks:fallback,fallbackRate:fallback/1500,pass:hard===0&&switches/1500<=.08&&fallback/1500<=.1};
fs.writeFileSync('combat-framework/evidence/mm-switch-details.json',JSON.stringify(switchDetails,null,2));
const report={sourceFrames:db.count,B2:b2,B3:{...b3,expandedSearches:expanded},scope:'B2 is startup query. B3 includes production ANIM sampling, final skeleton, inertial blending and foot IK feedback. Expanded full-tag searches are separate from no-result fallbacks and violate the strict 32-candidate budget. Does not certify M3 or all support-phase slip.'};fs.writeFileSync('combat-framework/evidence/production-mm.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!b2.pass||!b3.pass)process.exitCode=1;
