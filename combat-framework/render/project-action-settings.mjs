import initial from './action-settings.json';

let settings=initial;
const pending=new Map();
let saving=false,retryTimer;
let revision=0;
export function projectSetting(key){return pending.get(key)??settings[key];}

async function refreshProjectSettings(){
  const requestedAt=++revision;
  try{
    const response=await fetch('/api/action-settings',{cache:'no-store'});
    if(!response.ok)return;
    const latest=await response.json();
    if(requestedAt!==revision)return;
    settings=latest;
    window.dispatchEvent(new Event('project-action-settings'));
  }catch(error){console.warn('读取动作参数失败',error);}
}
if(import.meta.env.DEV){
  window.addEventListener('pageshow',refreshProjectSettings);
  window.addEventListener('focus',refreshProjectSettings);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProjectSettings();});
}

export async function saveProjectSettings(changes){
  if(!import.meta.env.DEV)return;
  for(const [key,value] of Object.entries(changes))pending.set(key,value);
  if(saving)return;
  clearTimeout(retryTimer);
  saving=true;
  try{
    while(pending.size){
      const patch=Object.fromEntries(pending);
      const response=await fetch('/api/action-settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(patch)});
      if(!response.ok)throw Error('HTTP '+response.status);
      revision++;
      settings={...settings,...patch};
      for(const [key,value] of Object.entries(patch))if(pending.get(key)===value)pending.delete(key);
    }
  }catch(error){console.error('动作参数未写入项目',error);window.dispatchEvent(new Event('action-settings-save-error'));
    retryTimer=setTimeout(()=>saveProjectSettings({}),3000);}
  finally{saving=false;}
}
if(import.meta.hot)import.meta.hot.accept('./action-settings.json',module=>{
  if(module){revision++;settings=module.default;window.dispatchEvent(new Event('project-action-settings'));}
});
