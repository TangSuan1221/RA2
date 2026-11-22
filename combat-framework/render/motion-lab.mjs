import {bindPracticeCameraPanel} from './practice-camera-settings.mjs';
import {executionCameraControls} from './execution-camera-controls.mjs';
import {executionCameraDefaults,executionCameraBlend,vaultFollow} from "../src/camera/rig.mjs";
import {vaultCamera,setVaultCamera,rateFor,bindRateInput} from './action-rates.mjs';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {BVHLoader} from 'three/addons/loaders/BVHLoader.js';
import {gameClips,loadGameClip,applyGamePose} from './game-clip-library.mjs';
import {mountFirearm,poseMagazine} from './long-gun-grip.mjs';
import {createPracticeLongGun,createPistol} from './weapons.mjs';

const el=id=>document.getElementById(id);
const scene=new T.Scene();
scene.background=new T.Color(0x687577);
scene.fog=new T.FogExp2(0x687577,.065);
const camera=new T.PerspectiveCamera(37,1,.02,150);
const renderer=new T.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
const controls=new OrbitControls(camera,renderer.domElement);
controls.minDistance=.5;
controls.maxDistance=14;
const canvas=renderer.domElement;
canvas.tabIndex=0;
canvas.setAttribute('aria-label','动作预览视口，WASD 移动，Q 下降，E 上升，右键拖动环视');
const flightKeys=new Set();
const flightCodes=new Set(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight']);
let manualCamera=false,lookPointer=null;
const flightDelta=new T.Vector3(),lookAngles=new T.Euler(0,0,0,'YXZ');
function stopFlight(){
 flightKeys.clear();
 if(lookPointer!==null && canvas.hasPointerCapture(lookPointer))canvas.releasePointerCapture(lookPointer);
 lookPointer=null;
}
canvas.addEventListener('keydown',event=>{
 if(event.ctrlKey||event.metaKey||event.altKey||!flightCodes.has(event.code))return;
 event.preventDefault();flightKeys.add(event.code);
});
window.addEventListener('keyup',event=>flightKeys.delete(event.code),true);
canvas.addEventListener('blur',stopFlight);
window.addEventListener('blur',stopFlight);
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFlight();});
canvas.addEventListener('pointerdown',event=>{
 canvas.focus({preventScroll:true});
 if(event.button!==2)return;
 event.preventDefault();event.stopImmediatePropagation();
 lookPointer=event.pointerId;canvas.setPointerCapture(lookPointer);
},true);
canvas.addEventListener('pointermove',event=>{
 if(event.pointerId!==lookPointer)return;
 manualCamera=true;
 const distance=camera.position.distanceTo(controls.target);
 lookAngles.setFromQuaternion(camera.quaternion);
 lookAngles.y-=event.movementX*.003;
 lookAngles.x=T.MathUtils.clamp(lookAngles.x-event.movementY*.003,-Math.PI/2+.01,Math.PI/2-.01);
 camera.quaternion.setFromEuler(lookAngles);
 camera.getWorldDirection(flightDelta);
 controls.target.copy(camera.position).addScaledVector(flightDelta,distance);
 controls.update();
});
for(const type of ['pointerup','pointercancel','lostpointercapture']){
 canvas.addEventListener(type,event=>{if(event.pointerId===lookPointer)lookPointer=null;});
}
function fly(dt){
 const axis=(positive,negative)=>Number(flightKeys.has(positive))-Number(flightKeys.has(negative));
 flightDelta.set(axis('KeyD','KeyA'),0,axis('KeyS','KeyW')).applyQuaternion(camera.quaternion);
 flightDelta.y+=axis('KeyE','KeyQ');
 if(!flightDelta.lengthSq())return;
 manualCamera=true;
 const fast=flightKeys.has('ShiftLeft')||flightKeys.has('ShiftRight');
 flightDelta.normalize().multiplyScalar((fast?6:2)*dt);
 camera.position.add(flightDelta);controls.target.add(flightDelta);controls.update();
}
function resetView(){stopFlight();manualCamera=false;controls.target.set(0,.95,0);camera.position.set(2.1,1.55,3.8);controls.update();}
resetView();
el('reset').onclick=()=>{resetView();appliedVaultDistance=undefined;drawPose();};
scene.add(new T.HemisphereLight(0xfff8ed,0xb2cbd1,2));
const light=new T.DirectionalLight(0xffebca,2.4);
light.position.set(-3,5,3);scene.add(light);
const ground=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:0x515e60}));
ground.rotation.x=-Math.PI/2;ground.position.y=-.012;scene.add(ground);
scene.add(new T.GridHelper(100,100,0x839494,0x647476));
new ResizeObserver(()=>{const {clientWidth:w,clientHeight:h}=el('view');if(!w||!h)return;renderer.setSize(w,h,false);camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();}).observe(el('view'));
async function fetchAsset(url,type){const r=await fetch(url);if(!r.ok)throw Error(url+' '+r.status);return r[type]();}
import {diveId,diveTravel} from '../src/anim/dive.mjs';
const aliases=[[/TPS_LongGun|Unv_Rifle/i,'步枪 长枪 持枪'],[/vault/i,'翻窗 窗户 翻越 障碍 矮栏'],[/climb/i,'攀爬 攀上 高台 障碍'],[/walk/i,'走 步行'],[/run|jog|sprint/i,'跑'],[/pistol/i,'持枪'],[/reload/i,'换弹'],[/shoot/i,'射击'],[/side.?step|strafe/i,'侧移'],[/back/i,'后退'],[/turn/i,'转身'],[/crouch/i,'蹲'],[/prone|crawl/i,'俯卧 爬'],[/idle|stand/i,'站立 待机'],[/punch|kick|sword/i,'近战'],[/hit/i,'受击']];
let catalogs,model,bones,rig,pistol,rifle,active,preview,version=0,time=0,playing=true;
const bvhLoader=new BVHLoader();
function clearPreview(){
  if(preview){scene.remove(preview.group,preview.helper);preview.helper.dispose();preview.mixer.stopAllAction();preview.mixer.uncacheRoot(preview.root);preview=null;}
  if(model)model.visible=false;
}
function rebuild(){
 const q=el('query').value.trim().toLowerCase();
 const rows=catalogs[el('library').value].filter(c=>[c.name,...aliases.filter(([re])=>re.test(c.name)).map(([,words])=>words)].join(' ').toLowerCase().includes(q));
 el('list').replaceChildren(...rows.map(c=>new Option(c.name,c.file)));
 el('count').textContent=rows.length+' 段动作';
 const first=rows.find(c=>c.name==='Walk_Loop')||rows[0];
 if(first)el('list').value=first.file;
 selectClip();
}
import {pairRateId,timingFor,bindExecutionTiming} from './execution-timing.mjs';
const rateId=()=>el('library').value==='game'?pairRateId(el('list').value):'accad/'+el('list').value;
const refreshTiming=bindExecutionTiming(el('execution-timing'),rateId);
const executionCamera={...executionCameraDefaults};
const cameraPanel=executionCameraControls(executionCamera,el('execution-timing'),drawPose);
let pairClock=0,lastPairTime=-1,lastTiming='';
const refreshNumber=bindRateInput(el('clip-rate'),rateId);
const refreshVaultSpeed=bindRateInput(el('vault-speed'),()=>'Safety_Vault');
el('vault-speed').addEventListener('input',()=>{refreshNumber();el('clip-slider').value=el('clip-rate').value;});
el('clip-rate').addEventListener('input',refreshVaultSpeed);
let vaultBaseY=0;
let appliedVaultDistance;
const orbitOffset=new T.Vector3();
for(const field of ['hold','distance']){
 const input=el('vault-'+field);
 const refresh=()=>{input.value=vaultCamera[field];};
 refresh();window.addEventListener('vault-camera-updated',refresh);
 input.oninput=()=>{setVaultCamera(field,input.valueAsNumber);drawPose();};
 input.onchange=refresh;
}
function refreshRate(){refreshVaultSpeed();refreshNumber();el('clip-slider').value=el('clip-rate').value;}
el('clip-slider').oninput=()=>{el('clip-rate').value=el('clip-slider').value;el('clip-rate').dispatchEvent(new Event('change'));};
window.addEventListener('action-rates-updated',refreshRate);
el('clip-rate').addEventListener('change',refreshRate);
el('rate').oninput=()=>{el('preview-number').value=el('rate').value;};
el('preview-number').oninput=()=>{if(el('preview-number').value && el('preview-number').validity.valid)el('rate').value=el('preview-number').value;};
el('preview-number').onchange=()=>{el('preview-number').value=el('rate').value;};
async function selectClip(){
 if(!cameraPanel.hidden)resetView();
 refreshTiming();cameraPanel.hidden=el('execution-timing').hidden;lastPairTime=-1;
 const token=++version,library=el('library').value;
 const entry=catalogs[library].find(c=>c.file===el('list').value);
 if(active?.dive)model.position.z=0;
 if(active?.vaultPath){model.position.set(0,vaultBaseY,0);resetView();}
 appliedVaultDistance=undefined;
 el('vault-settings').hidden=rateId()!=='Safety_Vault';
 refreshRate();el('clip-slider').disabled=el('clip-rate').disabled=!entry; clearPreview();active=null;time=0;el('frame').textContent='';
 if(!entry){el('info').textContent='没有匹配的动作';return;}
 el('info').textContent='载入 '+entry.name;
 try{
 if(library==='game'){
  const clip=await loadGameClip(entry.file,rig.bones);
  if(token!==version)return;
  if(clip.skeletonId!==rig.skeletonId||clip.bones!==bones.length)throw Error('骨架不匹配');
  active={clip,rifleReload:entry.file==='Unv_Rifle_Reload',dive:entry.file===diveId,frames:clip.frames,fps:clip.fps,duration:clip.duration};if(entry.file==='Safety_Vault'){active.vaultPath=entry.rootPath;vaultBaseY=model.position.y;}model.visible=true;rifle.visible=/^(Unv_Rifle|TPS_LongGun)_/.test(entry.file);pistol.visible=active.dive||/Pistol/.test(entry.name);
 }else{
  const data=await fetchAsset('/data/action-lab/accad/'+entry.file,'text');
  if(token!==version)return;
  const {skeleton,clip}=bvhLoader.parse(data);
  const root=skeleton.bones[0],group=new T.Group();group.scale.setScalar(.01);group.add(root);
  const helper=new T.SkeletonHelper(root);scene.add(helper);helper.material.color.setHex(0xffe6af);
  const mixer=new T.AnimationMixer(root);
  const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
  mixer.setTime(0);
  // Preserve the capture's height; recenter horizontal travel around the subject.
  preview={group,root,helper,mixer,action};scene.add(group);
  const frames=clip.tracks[0].times.length;
  active={frames,fps:(frames-1)/clip.duration,duration:clip.duration};
 }
 el('time').max=active.frames-1;el('info').textContent=entry.name+' · '+(library==='game'?'工程角色':'原始骨架');
 setPlaying(true);drawPose();
 }catch(error){if(token===version)el('info').textContent='载入失败 · '+error.message;}
}
function drawPose(){
 if(!active)return;
 if(preview){
  preview.action.paused=false;preview.mixer.setTime(time);
  preview.group.position.set(-preview.root.position.x*.01,0,-preview.root.position.z*.01);
 }else{
  if(rifle.visible)poseMagazine(rifle,active.rifleReload?time/active.duration:0);
  applyGamePose(bones,active.clip,Math.min(time,active.duration),false);
 }
 if(!cameraPanel.hidden){
   const elapsed=lastPairTime===time?pairClock:timingFor(rateId(),active.duration,rateFor(rateId())).clock(time);
   const mix=executionCameraBlend(elapsed,executionCamera);
   const angle=T.MathUtils.degToRad(executionCamera.angle)*mix;
   const distance=T.MathUtils.lerp(2.8,executionCamera.distance,mix);
   controls.target.set(T.MathUtils.lerp(-.32,0,mix),T.MathUtils.lerp(1.16,executionCamera.height,mix),0);
   camera.position.set(controls.target.x-Math.sin(angle)*distance,controls.target.y+.18,controls.target.z-Math.cos(angle)*distance);
   controls.update();
 }
 if(active.dive)model.position.z=diveTravel(time);
 if(active.vaultPath){
   const path=active.vaultPath,sample=Math.min(path.length-1,time*active.fps);
   const i=Math.floor(sample),j=Math.min(path.length-1,i+1);
   const travel=path[i].map((v,k)=>T.MathUtils.lerp(v,path[j][k],sample-i)-path[0][k]);
   model.position.set(travel[0],vaultBaseY+travel[1],travel[2]);
   if(!manualCamera){
   const follow=vaultFollow(time/rateFor(rateId()),vaultCamera.hold);
   orbitOffset.copy(camera.position).sub(controls.target);
   if(appliedVaultDistance!==vaultCamera.distance){
     orbitOffset.setLength(vaultCamera.distance);
     appliedVaultDistance=vaultCamera.distance;
   }
   controls.target.set(travel[0]*follow,.95+travel[1]*follow,travel[2]*follow);
   camera.position.copy(controls.target).add(orbitOffset);controls.update();
   }
 }
 const frame=Math.min(active.frames-1,Math.round(time*active.fps));
 el('time').value=frame;el('frame').textContent=(frame+1)+' / '+active.frames+' 帧 · '+active.fps.toFixed(0)+' fps';
}
function setPlaying(value){playing=value;el('play').textContent=value?'暂停':'播放';}
function seek(frame){if(!active)return;setPlaying(false);lastPairTime=-1;time=Math.max(0,Math.min(active.frames-1,frame))/active.fps;drawPose();}
el('time').oninput=()=>seek(+el('time').value);
el('prev').onclick=()=>seek(+el('time').value-1);
el('next').onclick=()=>seek(+el('time').value+1);
el('play').onclick=()=>{if(!active)return;if(!playing&&time>=active.duration)time=0;setPlaying(!playing);};
let last=performance.now();
renderer.setAnimationLoop(now=>{
 const dt=Math.min(.1,(now-last)/1000);last=now;
 if(el('preview-pane').hidden)return;
 fly(dt);
 if(playing&&active){if(!el('execution-timing').hidden){
   const timing=timingFor(rateId(),active.duration,rateFor(rateId()));
   const signature=Array.from(el('execution-timing').querySelectorAll('input'),i=>i.value).join('/')+'/'+rateFor(rateId());
   if(time!==lastPairTime||signature!==lastTiming)pairClock=timing.clock(time);
   pairClock+=dt*Number(el('rate').value);
   time=timing.sample(pairClock);lastPairTime=time;lastTiming=signature;
 }else time+=dt*Number(el('rate').value)*rateFor(rateId());const end=active.vaultPath?Math.max(active.duration,(vaultCamera.hold+.42)*rateFor(rateId())):active.duration;if(time>=end){if(el('loop').checked)time%=end;else{time=end;setPlaying(false);}}drawPose();}
 renderer.render(scene,camera);
});
async function init(){
 const [gltf,skeleton,clips,raw]=await Promise.all([new GLTFLoader().loadAsync('/assets/combat/character-female.glb'),fetchAsset('/data/combat/bones.json','json'),gameClips(),fetchAsset('/data/action-lab/accad/index.json','json')]);
 rig=skeleton;model=gltf.scene;bones=rig.bones.map(b=>model.getObjectByName(b.name));
 const box=new T.Box3().setFromObject(model);model.scale.setScalar(1.78/(box.max.y-box.min.y));model.position.y=-box.min.y*model.scale.y;
 const [pistolAim,rifleAim]=await Promise.all(['Pistol_Aim_Neutral','TPS_LongGun_Aim_Center'].map(id=>loadGameClip(id)));
 pistol=createPistol();rifle=createPracticeLongGun(false);
 mountFirearm(model,pistol,rig.bones,pistolAim,true);mountFirearm(model,rifle,rig.bones,rifleAim);scene.add(model);
 catalogs={game:clips.map(c=>({file:c.id,name:c.id===diveId?'前扑落地 · 翻身俯卧瞄准':(c.label??c.id),rootPath:c.rootPath})),accad:raw};
 el('library').onchange=rebuild;el('query').oninput=rebuild;el('list').onchange=selectClip;rebuild();
}
init().catch(error=>el('info').textContent='启动失败 · '+error.message);

window.addEventListener('action-settings-save-error',()=>{el('info').textContent='动作参数暂未写入项目，正在重试…';});
bindPracticeCameraPanel(el('camera-fields'));
function showMode(){
  const practice=location.hash==='#practice';
  el('camera-tools').hidden=!practice;
  if(!practice)el('camera-tools').open=false;
  if(practice)stopFlight();
  const pane=el('practice-pane');
  if(!practice && !pane.hidden)pane.contentWindow?.dispatchEvent(new Event('blur'));
  el('preview-pane').hidden=practice;
  pane.hidden=!practice;
  if(practice && !pane.hasAttribute('src'))pane.src='/combat.html?mode=practice';
  el('preview-tab').setAttribute('aria-pressed',String(!practice));
  el('practice-tab').setAttribute('aria-pressed',String(practice));
}
el('practice-tab').onclick=()=>{location.hash='practice';};
el('preview-tab').onclick=()=>{location.hash='preview';};
window.addEventListener('hashchange',showMode);
showMode();
