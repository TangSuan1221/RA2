import {projectSetting,saveProjectSettings} from './project-action-settings.mjs';
const storageKey = 'ra2.action-rates.v1';
export const postureRates = {
  '@crouch': '站立 → 下蹲',
  '@stand': '蹲姿 → 起身',
  '@proneExit': '卧姿 → 起身'
};
const defaults = {'@crouch':1.5, '@stand':1.5, Crouch_To_Prone:2, '@proneExit':2};
let overrides = {};
function load(){
  try { overrides = JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { overrides = {}; }
}
load();
window.addEventListener('storage', e => { if (!e.key || e.key === storageKey) { load(); window.dispatchEvent(new Event('action-rates-updated')); } });
export function rateFor(id){
  const saved=projectSetting('rate.'+id);
  const n=import.meta.env.DEV?saved??overrides[id]:overrides[id]??saved;
  return Number.isFinite(n) && n>=.1 && n<=4 ? n : defaults[id] ?? 1;
}
export function bindRateInput(input,getId){
  const refresh=()=>{input.value=rateFor(getId());};
  input.min='.1';input.max='4';input.step='any';
  window.addEventListener('action-rates-updated',refresh);
  input.oninput=()=>{
    const value=input.valueAsNumber;
    if(Number.isFinite(value)&&value>=.1&&value<=4){
      load(); overrides[getId()]=value;
      saveProjectSettings({['rate.'+getId()]:value});
      localStorage.setItem(storageKey,JSON.stringify(overrides));
    }

  };
  input.onchange=()=>{input.oninput();refresh();};
  refresh();
  return refresh;
}

const vaultKey='ra2.vault-camera.';
export const vaultCamera={distance:2.7,hold:.8};
const limits={distance:[.8,10,2.7],hold:[0,5,.8]};
function valid(field,n){return Number.isFinite(n)&&n>=limits[field][0]&&n<=limits[field][1];}
export function setVaultCamera(field,n){
  if(!valid(field,n))return;
  localStorage.setItem(vaultKey+field,String(n));
  vaultCamera[field]=n;
  saveProjectSettings({['vault.'+field]:n});
}
function loadVaultCamera(){
  for(const field of Object.keys(limits)){
    const raw=localStorage.getItem(vaultKey+field),n=Number(raw);
    const local=raw!==null&&valid(field,n)?n:undefined,project=projectSetting('vault.'+field);
    vaultCamera[field]=(import.meta.env.DEV?project??local:local??project)??limits[field][2];
  }
}
loadVaultCamera();
window.addEventListener('storage',e=>{
  if(!e.key||e.key.startsWith(vaultKey)){
    loadVaultCamera();window.dispatchEvent(new Event('vault-camera-updated'));
  }
});

window.addEventListener('project-action-settings',()=>{loadVaultCamera();window.dispatchEvent(new Event('vault-camera-updated'));window.dispatchEvent(new Event('action-rates-updated'));});
