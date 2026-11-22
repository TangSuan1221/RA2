import {projectSetting,saveProjectSettings} from './project-action-settings.mjs';
import {shoulderDefaults} from '../../src/demo/station-shoulder-camera.js';

const storageKey='ra2.practice.shoulder-camera.v1';
const fields=[
  ['idleDistance','站立距离（米）',.6,4,.01],
  ['walkDistance','行走距离（米）',.8,5,.01],
  ['fov','垂直视野（度）',35,80,1],
  ['shoulderOffset','肩侧距离（米）',0,.7,.01],
  ['horizontal','人物横向偏移（画宽 %）',-15,15,.5],
  ['vertical','人物纵向偏移（画高 %）',-15,15,.5],
  ['response','跟随响应（每秒）',2,18,.5]
];

export const practiceCameraSettings={...shoulderDefaults};
function load(){
  let saved;
  try{saved=JSON.parse(localStorage.getItem(storageKey));}catch{}
  for(const [key,,min,max] of fields){
    const project=projectSetting('camera.'+key);
    const value=import.meta.env.DEV?project??saved?.[key]:saved?.[key]??project;
    practiceCameraSettings[key]=Number.isFinite(value)?Math.max(min,Math.min(max,value)):shoulderDefaults[key];
  }
}
load();
window.addEventListener('project-action-settings',load);
window.addEventListener('storage',event=>{if(event.key===storageKey||event.key===null)load();});

export function bindPracticeCameraPanel(panel){
  const refresh=[];
  function save(keys){
    saveProjectSettings(Object.fromEntries(keys.map(key=>['camera.'+key,practiceCameraSettings[key]])));
    try{localStorage.setItem(storageKey,JSON.stringify(practiceCameraSettings));}catch{}
    // Keep the same-origin iframe live even when persistent storage is disabled.
    document.getElementById('practice-pane')?.contentWindow?.postMessage({type:storageKey,settings:{...practiceCameraSettings}},location.origin);
  }
  for(const [key,title,min,max,step] of fields){
    const row=document.createElement('label'),text=document.createElement('span');
    text.textContent=title;
    const slider=document.createElement('input'),number=document.createElement('input');
    slider.type='range';number.type='number';
    for(const input of [slider,number]){
      Object.assign(input,{min,max,step});
      input.setAttribute('aria-label',title+(input===slider?' 滑条':' 数值'));
      input.oninput=()=>{
        const value=input.valueAsNumber;
        if(!Number.isFinite(value)||value<min||value>max)return;
        practiceCameraSettings[key]=value;
        (input===slider?number:slider).value=value;
        save([key]);
      };
    }
    const sync=()=>{slider.value=number.value=Number(practiceCameraSettings[key].toFixed(2));};
    number.onchange=sync;refresh.push(sync);sync();
    row.append(text,slider,number);panel.append(row);
  }
  const reset=document.createElement('button');reset.textContent='恢复消防站默认值';
  reset.onclick=()=>{Object.assign(practiceCameraSettings,shoulderDefaults);refresh.forEach(fn=>fn());save(fields.map(([key])=>key));};
  panel.append(reset);
  window.addEventListener('project-action-settings',()=>refresh.forEach(fn=>fn()));
  window.addEventListener('storage',e=>{if(e.key===storageKey||e.key===null)refresh.forEach(fn=>fn());});
}
if(window.parent!==window)window.addEventListener('message',e=>{
  if(e.origin!==location.origin||e.source!==window.parent||e.data?.type!==storageKey)return;
  for(const [key,,min,max] of fields){
    const value=e.data.settings?.[key];
    if(Number.isFinite(value)&&value>=min&&value<=max)practiceCameraSettings[key]=value;
  }
});
