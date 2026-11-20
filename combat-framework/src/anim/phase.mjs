import {CALIBRATION} from './locomotion.mjs';
const median=a=>{const sorted=[...a].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
export function annotatePhases(clip){const contacts=[[],[]],strikes=[[],[]],worldFeet=[[],[]];
  for(let f=0;f<clip.frames;f++){const heading=clip.headings?.[f]||0,si=Math.sin(heading),co=Math.cos(heading),root=clip.rootPath?.[f]||[0,0,(CALIBRATION[clip.id]||0)*f/30];for(let side=0;side<2;side++){const p=clip.landmarks[f][side?'foot_r':'foot_l'];worldFeet[side].push([root[0]+p[0]*co+p[2]*si,p[1],root[2]-p[0]*si+p[2]*co]);}}
  const periods=[];
  for(let side=0;side<2;side++){const feet=worldFeet[side],floor=median(feet.map(p=>p[1]).sort((a,b)=>a-b).slice(0,Math.max(1,Math.floor(feet.length*.2))));for(let f=0;f<clip.frames;f++){const i=Math.max(0,f-1),j=Math.min(clip.frames-1,f+1),dt=(j-i)/30||1/30,speed=Math.hypot(feet[j][0]-feet[i][0],feet[j][2]-feet[i][2])/dt;contacts[side][f]=speed<.35&&feet[f][1]<floor+.04;}for(let f=1;f<clip.frames-1;f++)if(contacts[side][f]&&contacts[side][f+1]&&!contacts[side][f-1])strikes[side].push(f/30);const gaps=strikes[side].slice(1).map((t,i)=>t-strikes[side][i]).filter(t=>t>.2&&t<2);periods[side]=gaps.length?median(gaps):clip.loop&&strikes[side].length?clip.duration:0;}
  const period=periods.every(p=>p>0)?(periods[0]+periods[1])/2:0,phases=[];
  let reliable=period>0&&Math.abs(periods[0]-periods[1])/period<.1&&strikes.every(s=>s.length>0);
  for(let f=0;f<clip.frames;f++){const time=f/30;phases.push([0,1].map(side=>{const last=strikes[side].filter(t=>t<=time).at(-1)??strikes[side][0]??0;return periods[side]?((time-last)/periods[side]%1+1)%1:0;}));}
  if(reliable){const separation=median(phases.map(p=>Math.abs(p[0]-p[1])));reliable=Math.abs(separation-.5)<=.05;}
  return {...clip,contactOfFrame:contacts[0].map((v,i)=>[v,contacts[1][i]]),phases,phaseReliable:reliable,cyclePeriod:period};
}
