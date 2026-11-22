export const pairRateId=id=>id.replace(/^Enemy_StealthVictim/,'Player_StealthKill');
const fields=[
  ['first','主动作起帧',1,1,999,13],['last','主动作止帧',1,2,999,45],
  ['intro','起势倍率',.05,.1,4,1],['main','主动作倍率',.05,.1,4,1],
  ['hold','停留（秒）',.01,0,2,0],['outro','收势倍率',.05,.1,4,1]
];
const cache=new Map();
const storageKey=id=>'ra2.execution.timing.'+pairRateId(id);
function values(id){
  const key=storageKey(id);
  if(!cache.has(key)){
    let saved={};try{saved=JSON.parse(localStorage.getItem(key))||{}}catch{}
    cache.set(key,Object.fromEntries(fields.map(([k,, ,min,max,initial])=>[k,Number.isFinite(saved[k])?Math.max(min,Math.min(max,saved[k])):initial])));
  }
  return cache.get(key);
}
window.addEventListener('storage',e=>cache.delete(e.key));
export function timingFor(id,length,rate){
  const v=values(id),a=Math.min(length,(v.first-1)/30),b=Math.min(length,Math.max(v.first,v.last-1)/30);
  const r1=v.intro*rate,r2=v.main*rate,r3=v.outro*rate;
  const t1=a/r1,t2=t1+(b-a)/r2,t3=t2+(b<length?v.hold:0);
  return {duration:t3+(length-b)/r3,
    sample:t=>t<t1?t*r1:t<t2?a+(t-t1)*r2:t<t3?b:Math.min(length,b+(t-t3)*r3),
    clock:s=>s<=a?s/r1:s<=b?t1+(s-a)/r2:t3+(s-b)/r3};
}
export function bindExecutionTiming(container,getId){
  const inputs=fields.map(([key,title,step,min,max])=>{
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='number';Object.assign(input,{step,min,max});input.style.width='4.4em';
    label.append(title+' ',input);container.append(label,' ');
    input.onchange=()=>{
      const v=values(getId()),n=input.valueAsNumber;
      if(input.validity.valid&&Number.isFinite(n)){
        v[key]=n;if(v.last<=v.first){if(key==='last')v.first=v.last-1;else v.last=v.first+1}
        localStorage.setItem(storageKey(getId()),JSON.stringify(v));
      }
      refresh();
    };
    return [key,input];
  });
  function refresh(){const id=getId();container.hidden=!/^Player_StealthKill/.test(pairRateId(id));if(!container.hidden)for(const [k,i] of inputs)i.value=values(id)[k];}
  return refresh;
}
