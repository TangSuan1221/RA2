import {createShoulderCamera} from '../../src/demo/station-shoulder-camera.js';
import {syncExecutionCamera} from './execution-camera-controls.mjs';
import {practiceCameraSettings} from './practice-camera-settings.mjs';
import {movementInput} from '../src/input/buffer.mjs';
import {rateFor,postureRates,bindRateInput} from './action-rates.mjs';
import {vaultCamera} from './action-rates.mjs';
import * as T from 'three';
import {mountFirearm,poseMagazine} from './long-gun-grip.mjs';
import {PracticePlayback} from './practice-playback.mjs';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {World} from '../src/world.mjs';
import {FixedLoop} from '../src/core/loop.mjs';
import {CAM} from '../src/core/constants.mjs';
import {trace,rayBox} from '../src/character/collision.mjs';
import {CameraRig} from '../src/camera/rig.mjs';
import {fitStandingCharacter} from './pose.mjs';
import {decodeMMDB} from '../src/anim/database.mjs';
import {diveId,makeDive} from '../src/anim/dive.mjs';
import {bakeExecutionPair} from '../src/anim/execution-clips.mjs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
import {GamepadInput} from './gamepad.mjs';
import {pairRateId,timingFor} from './execution-timing.mjs';
import {toolNames,pairIds} from '../src/combat/execution-tools.mjs';
import {createExecutionProps,createPistol,createKnife,createPracticeLongGun} from './weapons.mjs';
import {GeometryQueries} from './geometry-query.mjs';

const practice=new URLSearchParams(location.search).get('mode')==='practice';
let playback = null;
let crossFadeEnabled = practice;
function switchPlayback(enabled) {
  playback?.dispose();
  playback = null;
  crossFadeEnabled = enabled;
  if (enabled && actors.has(world.player.id)) {
    playback = new PracticePlayback(world.player, actors.get(world.player.id));
  }
  const select = document.querySelector('#playback-mode');
  if (select) select.value = enabled ? 'crossfade' : 'production';
}
if(practice){
  document.title='玩家实操 · 动作验收台';
  document.querySelector('header b').textContent='动作验收台';
  document.querySelector('header small').textContent='玩家实操';
  document.querySelector('.eyebrow').textContent='潜行训练 · 固定哨兵';
  document.querySelector('h1').textContent='动作实操';
  document.querySelector('#start p').textContent='Tab 切换处决道具，C 蹲下，在哨兵背后按 E 处决。按 X 朝移动方向扑倒并翻身，按住右键瞄准，左键射击，Z 起身。出生点正前方是窗台。站立靠近窗台、矮栏或高台，面向障碍按 E。';
  document.querySelector('#play').textContent='开始 / 继续实操';
  const label=document.createElement('label');
  label.style.cssText='display:block;margin:12px 0;color:inherit';
  label.innerHTML='动画播放器　<select id="playback-mode"><option value="crossfade">CrossFade</option><option value="production">现有播放器</option></select>';
  document.querySelector('#play').before(label);
  label.querySelector('select').onchange=e=>switchPlayback(e.target.value==='crossfade');
  const back=document.querySelector('a[href="/motion.html"]');
  back.textContent='返回动作预览';
  if(window.parent!==window)back.onclick=e=>{e.preventDefault();window.parent.location.hash='preview';};
  document.querySelector('footer').innerHTML='<b>1 / 2 / 3</b> 手枪 / 步枪 / 狙击枪　<b>WASD</b> 八向走　<b>Shift</b> 跑　<b>C / Z</b> 蹲 / 趴　<b>空格</b> 闪避　<b>E</b> 翻窗 / 翻越 / 攀上　<b>B</b> 切换播放器　<b>Esc</b> 暂停<br><b>右键</b> 举枪　<b>V</b> 换肩　<b>左键</b> 轻击 / 射击　<b>R</b> 换弹　<b>Q / F</b> 重击 / 招架';
}
const canvas=document.querySelector('#game'),renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new T.Scene();scene.background=new T.Color(0x7d8b85);scene.fog=new T.FogExp2(0x7d8b85,.017);
const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.08,120);scene.add(new T.HemisphereLight(0xd0e4e3,0x353a2b,2.1));const sun=new T.DirectionalLight(0xffe1b0,3.5);sun.position.set(-12,24,-8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,far:70});sun.shadow.bias=-.0002;scene.add(sun);
const practiceObstacles = [
  {id:"窗台",min:[-1.3,0,-2],max:[1.3,.82,-1.8]},
  {id:"窗框左",min:[-1.5,0,-2],max:[-1.3,3,-1.8]},
  {id:"窗框右",min:[1.3,0,-2],max:[1.5,3,-1.8]},
  {id:"窗框上",min:[-1.3,2.85,-2],max:[1.3,3,-1.8]},
  {id:"矮栏",min:[-5,0,-2],max:[-3,.7,-1.8]},
  {id:"高台",min:[3,0,-2],max:[5,1.65,.4]}
];
const world=new World(practice?{enemyCount:1,obstacles:practiceObstacles,flatGroundPractice:true}:{}),actors=new Map(),props=new Map(),keys=new Set(),commands=[];let yaw=0,pitch=practice?-.18:-.08,aim=false,fire=false,playing=false,ready=false,debug=false,shoulder=1,last=performance.now();const rig=new CameraRig();rig.update(world.player,{yaw,pitch,shoulder},world.obstacles);const arm=rig.arm;
if(practice)Object.assign(world.enemies[0],{practiceSentry:true,pos:[0,0,-4.75],prev:[0,0,-4.75],yaw:0});
if(practice)syncExecutionCamera(rig.executionSettings);
const gamepad=new GamepadInput();
const collisionMeshes=[];
const mat=new T.MeshStandardMaterial({color:0x666d60,roughness:.96});
const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0x5b6253,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);collisionMeshes.push({mesh:ground,object:{id:"ground",min:[-40,-.01,-40],max:[40,0,40]}});
for(const b of world.obstacles){const mesh=new T.Mesh(new T.BoxGeometry(...b.max.map((v,i)=>v-b.min[i])),mat.clone());mesh.position.fromArray(b.min.map((v,i)=>(v+b.max[i])/2));mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);collisionMeshes.push({mesh,object:b});const edges=new T.LineSegments(new T.EdgesGeometry(mesh.geometry),new T.LineBasicMaterial({color:0x8e9680,transparent:true,opacity:.25}));mesh.add(edges);}
const followPractice=practice?createShoulderCamera(camera,practiceCameraSettings):null;
const cameraObstacles=collisionMeshes.map(entry=>entry.mesh);
const windowHeader=practiceObstacles.find(box=>box.id==='窗框上');
world.obstacles.geometryQuery=new GeometryQueries(collisionMeshes);world.obstacles.geometryQuery.movementEnabled=true;
// Fixed environment dressing; never enters the authoritative simulation.
for(let i=0;i<(practice?0:85);i++){const x=Math.sin(i*127.1)*16,z=Math.cos(i*43.7)*16;const stone=new T.Mesh(new T.DodecahedronGeometry(.04+(i%5)*.025),mat);stone.position.set(x,.03,z);stone.scale.set(1,.3,1);scene.add(stone);}
const grid=new T.GridHelper(34,34,0x89917b,0x6a735f);grid.position.y=.006;grid.material.transparent=true;grid.material.opacity=practice?.55:.13;scene.add(grid);
const loader=new GLTFLoader();
try{const [gltf,manifest,skeleton,mmBytes]=await Promise.all([loader.loadAsync('/assets/combat/character-female.glb'),fetch('/data/combat/runtime-animations.json').then(r=>{if(!r.ok)throw Error('Missing animation manifest');return r.json();}),fetch('/data/combat/bones.json').then(r=>r.json()),fetch('/data/combat/locomotion.mmdb').then(r=>r.arrayBuffer())]);
if(practice){const extra=(await Promise.all(["tps-longgun","unv-rifle"].map(name=>fetch("/data/combat/"+name+".json").then(r=>r.json())))).flat();manifest.clips.push(...extra.map(c=>({...c,duration:(c.frames-1)/30})));}
const clips=new Map(await Promise.all(manifest.clips.map(async c=>{const r=await fetch('/data/combat/anim/'+c.id+'.bin');if(!r.ok)throw Error('Missing ANIM '+c.id);const clip=decodeAnimation(await r.arrayBuffer());if(clip.skeletonId!==skeleton.skeletonId)throw Error('Skeleton mismatch');return [c.id,clip];})));
if(practice){
  const clip=makeDive(skeleton.bones,...['Idle_Loop','Prone_Crawl_Forward','Pistol_Aim_Neutral'].map(id=>clips.get(id)));
  clips.set(diveId,clip);
  manifest.clips.push({id:diveId,frames:clip.frames,duration:clip.duration,loop:false});
}
if(practice){
  const savedTool=sessionStorage.getItem('execution-tool');
  world.player.executionTool=Object.hasOwn(toolNames,savedTool)?savedTool:'Knife';
  for(const id of Object.keys(toolNames).flatMap(pairIds)){
    const response=await fetch('/data/combat/anim/'+id+'.bin');
    if(!response.ok)throw Error('Missing paired animation '+id);
    const clip=decodeAnimation(await response.arrayBuffer());
    if(clip.skeletonId!==skeleton.skeletonId)throw Error('Pair skeleton mismatch');
    clips.set(id,clip);
    manifest.clips.push({id,frames:clip.frames,duration:clip.duration,loop:false});
  }
}else bakeExecutionPair(clips,manifest,skeleton.bones);
world.player.rateFor=rateFor;
if(practice)world.executionTiming=(id,length)=>timingFor(id,length,rateFor(id));
world.player.vaultCamera=vaultCamera;
if(practice){
  const label=document.createElement('label');
  label.style.cssText='display:block;margin:10px 0';
  label.innerHTML='动作倍率　<select aria-label="配置动作"></select> <input type="number" aria-label="动作播放倍率" style="width:5em"> ×';
  const select=label.querySelector('select');
  for(const [id,title] of Object.entries(postureRates))select.add(new Option(title,id));
  for(const c of manifest.clips)select.add(new Option(c.id==='Crouch_To_Prone'?'蹲姿 → 卧姿':c.id,c.id));
  select.value='Prone_Crawl_Forward';
  select.onchange=bindRateInput(label.querySelector('input'),()=>pairRateId(select.value));
  document.querySelector('#play').before(label);
}
world.setAnimationDatabase(decodeMMDB(mmBytes,manifest.clips),manifest);world.setSkeletonAnimations(skeleton.bones,clips);for(const a of [world.player,...world.enemies]){
  const model=clone(gltf.scene),group=new T.Group();group.add(model);scene.add(group);
  model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;o.material=o.material.clone();if(a!==world.player)o.material.color.multiply(new T.Color(0xb5aa90));}});
  const pose=fitStandingCharacter(model,gltf.animations);pose.bindSkeleton(skeleton.bones);a.modelScale=model.scale.x;a.modelYOffset=model.position.y;
  const ring=new T.Mesh(new T.RingGeometry(.39,.43,32),new T.MeshBasicMaterial({color:0xba5c42,side:T.DoubleSide,transparent:true,opacity:.85}));ring.rotation.x=-Math.PI/2;ring.position.y=.015;group.add(ring);ring.visible=false;
  const pistol=createPistol(),knife=createKnife();mountFirearm(model,pistol,skeleton.bones,clips.get('Pistol_Aim_Neutral'),true);model.getObjectByName('hand_r').add(knife);pistol.visible=knife.visible=false;
    const longGuns={};
  if(practice){
    for(const id of ['rifle','sniper']){
      const gun=createPracticeLongGun(id==='sniper');
      mountFirearm(model,gun,skeleton.bones,clips.get('TPS_LongGun_Aim_Center'));gun.visible=false;longGuns[id]=gun;
    }
  }
  const executionProps=practice&&a===world.player?createExecutionProps():{};
  for(const prop of Object.values(executionProps)){model.getObjectByName('hand_r').add(prop);prop.visible=false;}
  actors.set(a.id,{executionProps,group,model,pose,ring,pistol,knife,longGuns});
}if(practice)switchPlayback(crossFadeEnabled);ready=true;document.querySelector('#loading').textContent='资源已载入。点击进入后捕获鼠标；Esc 释放并暂停。';}catch(e){document.querySelector('#loading').textContent='资源载入失败：'+e.message;console.error(e);}
const startPanel=document.querySelector('#start'),controlHint=document.createElement('div');
controlHint.id='control-hint';controlHint.style.cssText='position:fixed;top:76px;left:24px;color:#e7e9da;font:14px sans-serif;pointer-events:none;z-index:5';document.body.appendChild(controlHint);
let hadPointerLock=false;
function setPlaying(value){playing=value;world.paused=!value;loop.paused=!value;keys.clear();commands.length=0;fire=aim=false;startPanel.classList.toggle('hidden',value);controlHint.textContent=value?(document.pointerLockElement===canvas?'':'按住鼠标右键拖动视角 · Esc 暂停'):'';last=performance.now();}
function pointerFallback(){if(playing)controlHint.textContent='当前浏览器未允许鼠标锁定：按住右键拖动视角 · Esc 暂停';}
function start(){
  if(!ready)return;
  canvas.tabIndex=-1;canvas.focus({preventScroll:true});
  setPlaying(true);
  try{if(canvas.requestPointerLock){const request=canvas.requestPointerLock();request?.catch(pointerFallback);}else pointerFallback();}catch{pointerFallback();}
}
document.querySelector('#play').onclick=start;
document.addEventListener('pointerlockerror',pointerFallback);
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(locked){hadPointerLock=true;if(playing)controlHint.textContent='';else document.exitPointerLock();}else if(hadPointerLock){hadPointerLock=false;setPlaying(false);}});
window.addEventListener('blur',()=>{if(playing){setPlaying(false);if(document.pointerLockElement===canvas)document.exitPointerLock();}});
document.addEventListener('mousemove',e=>{if(playing&&(document.pointerLockElement===canvas||(e.target===canvas&&(e.buttons&2)))){yaw-=e.movementX*(aim?.0016:.0025);pitch=Math.max(-1.05,Math.min(.9,pitch-e.movementY*(aim?.0014:.002)));}});
const keyCommand={KeyC:'crouch',KeyZ:'prone',Space:'dodge',KeyQ:'heavy',KeyF:'parry',KeyE:'execute',KeyR:'reload',KeyG:'throw',KeyH:'heal'};
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&playing){e.preventDefault();setPlaying(false);if(document.pointerLockElement===canvas)document.exitPointerLock();return;}if(practice&&playing&&e.code==='Tab'){e.preventDefault();if(!e.repeat&&!world.exec){const tools=Object.keys(toolNames);world.player.executionTool=tools[(tools.indexOf(world.player.executionTool)+1)%tools.length];sessionStorage.setItem('execution-tool',world.player.executionTool);}return;}if(e.code==='Tab'&&(!practice||playing)){e.preventDefault();debug=!debug;document.querySelector('#debug').classList.toggle('visible',debug);}if(!playing)return;if(practice&&!e.repeat&&['Digit1','Digit2','Digit3'].includes(e.code)){world.player.weapon={Digit1:null,Digit2:'rifle',Digit3:'sniper'}[e.code];}if(practice&&e.code==='KeyB'&&!e.repeat)switchPlayback(!crossFadeEnabled);if(practice&&e.code==='KeyX'&&!e.repeat)commands.push('dive');keys.add(e.code);if(!e.repeat&&keyCommand[e.code])commands.push(keyCommand[e.code]);if(!e.repeat&&e.code==='KeyV')shoulder*=-1;if(e.code==='Space')e.preventDefault();});function releaseKey(event){keys.delete(event.code);}
window.addEventListener('keyup',releaseKey,true);
if(practice && window.parent!==window && document.referrer && new URL(document.referrer).origin===location.origin){
  window.parent.addEventListener('keyup',releaseKey,true);
  window.addEventListener('pagehide',event=>{
    if(!event.persisted)window.parent.removeEventListener('keyup',releaseKey,true);
  });
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden && playing)setPlaying(false);
});
canvas.addEventListener('mousedown',e=>{if(!playing)return;if(e.button===2)aim=true;if(e.button===0){fire=true;if(!aim)commands.push('light');}});document.addEventListener('mouseup',e=>{if(e.button===0)fire=false;if(e.button===2)aim=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
// Brief additive muzzle light, attached to the animated weapon.
const flashCanvas=document.createElement('canvas');
flashCanvas.width=flashCanvas.height=64;
const ctx=flashCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
gradient.addColorStop(0,'white');gradient.addColorStop(.24,'#ffebaa');gradient.addColorStop(1,'rgba(255,135,40,0)');
ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
const flash=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(flashCanvas),blending:T.AdditiveBlending,depthWrite:false}));
flash.position.set(0,.21,.025);flash.scale.setScalar(.42);flash.visible=false;
actors.get(world.player.id)?.pistol.add(flash);
const muzzleLight=new T.PointLight(0xffcd84,0,2);
flash.add(muzzleLight);
let flashTime=0,kick=0;
const loop=new FixedLoop(dt=>{const pad=gamepad.sample(dt);if(pad){yaw+=pad.yawDelta;pitch=Math.max(-1.05,Math.min(.9,pitch+pad.pitchDelta));commands.push(...pad.commands);}const forward=(pad?.forward||0)+(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(pad?.side||0)+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const movementYaw=yaw;const freeMove=!!(forward||side)&&!(aim||pad?.aim)&&world.player.posture!=='prone';for(const actor of [world.player,...world.enemies])actor.previousRenderYaw=actor.yaw;world.update({...movementInput(forward,side,movementYaw,world.player.yaw),yaw:movementYaw,lookDriven:!freeMove,freeMove,pitch,cameraOrigin:rig.current.aimOrigin||rig.current.position,cameraDirection:rig.current.direction,aim:aim||pad?.aim,fire:fire||pad?.fire,sprint:pad?.sprint||keys.has('ShiftLeft')||keys.has('ShiftRight'),walk:practice?!(keys.has('ShiftLeft')||keys.has('ShiftRight')||pad?.sprint):keys.has('AltLeft'),commands:commands.splice(0)},dt);playback?.update(dt);kick*=Math.exp(-dt/.09);flashTime=Math.max(0,flashTime-dt);if(world.shot){kick=Math.min(.045,kick+.024);flashTime=.065;}flash.visible=flashTime>0;flash.material.opacity=flashTime/.065;muzzleLight.intensity=3*flash.material.opacity;rig.update(world.player,{yaw:movementYaw,pitch:pitch+kick,aspect:camera.aspect,shoulder,aim:aim||!!pad?.aim},world.obstacles,dt);});loop.paused=true;
const frameTimes=[];let frames=0,elapsed=0;const temp=new T.Vector3();
function frame(now){requestAnimationFrame(frame);const dt=Math.max(0,Math.min(.1,(now-last)/1000));last=now;const alpha=loop.advance(dt);if(playing){frames++;elapsed+=dt;frameTimes.push(dt*1000);if(frameTimes.length>36000)frameTimes.shift();}
  for(const a of [world.player,...world.enemies]){const v=actors.get(a.id);if(!v)continue;v.group.position.fromArray(a.pos.map((n,i)=>a.prev[i]+(n-a.prev[i])*alpha));const previousYaw=a.previousRenderYaw??a.yaw;v.group.rotation.y=previousYaw+Math.atan2(Math.sin(a.yaw-previousYaw),Math.cos(a.yaw-previousYaw))*alpha;if(playback&&a===world.player)playback.render(alpha);else if(a.pose)v.pose.applyPose(a.previousPose,a.pose,alpha);for(const [id,gun] of Object.entries(v.longGuns)){gun.visible=id===a.weapon&&a.hp>0&&!a.execLock;if(gun.visible){poseMagazine(gun,a.state==='reload'?a.skeletonPlayer.baseClock.time/a.skeletonPlayer.clips.get(a.clip).duration:0);if(flash.parent!==gun){gun.add(flash);flash.position.set(0,.085,id==="sniper"?.79:.56);}}}if(practice&&!a.weapon&&flash.parent!==v.pistol){v.pistol.add(flash);flash.position.set(0,.21,.025);}v.pistol.visible=!a.weapon&&a.hp>0&&(a.aim||a.state==='reload');const showTool=practice&&a===world.player&&a.hp>0&&!a.aim&&!a.attack&&!a.weapon&&(a.state==='idle'||!!world.exec?.stealth);for(const [tool,prop] of Object.entries(v.executionProps))prop.visible=(showTool||a===world.player&&!!world.exec?.stealth)&&a.executionTool===tool;v.knife.visible=a.hp>0&&(a.attack?.move.id==='atk_heavy_01'||a===world.player&&(showTool||!!world.exec?.stealth)&&(a.executionTool??'Knife')==='Knife');v.ring.visible=a.hp>0&&!!a.attack;v.ring.material.color.setHex(a.attack&&a.actionTime>=a.attack.windup?0xe3ac56:0xa84d36);}
  const p=world.player,view=rig.interpolate(alpha);const playerVisual=actors.get(p.id);
  const shoulderView=practice && playerVisual && !rig.aim && !rig.anchor;
  if(shoulderView){
    const position=playerVisual.group.position;
    const nearDoor=position.x>=windowHeader.min[0] && position.x<=windowHeader.max[0] &&
      Math.abs(position.z-(windowHeader.min[2]+windowHeader.max[2])/2)<1.4;
    followPractice({position,jumpHeight:0,crouched:p.posture==='crouch',prone:p.posture==='prone',
      yaw:yaw+Math.PI,pitch,moving:Math.hypot(p.vel[0],p.vel[2])>.05,nearDoor,dt,side:shoulder,obstacles:cameraObstacles});
    if(rig.executionBlend>.001){
      const baseRotation=camera.quaternion.clone();
      camera.position.lerp(temp.fromArray(view.position),rig.executionBlend);
      camera.lookAt(temp.fromArray(view.look));
      camera.quaternion.slerp(baseRotation,1-rig.executionBlend);
    }
  }else{
    camera.filmOffset=0;camera.position.fromArray(view.position);temp.fromArray(view.look);
    camera.lookAt(temp);camera.fov=view.fov;camera.updateProjectionMatrix();
  }
  for(const g of world.projectiles){if(!props.has(g)){const mesh=new T.Mesh(new T.SphereGeometry(.09,8,8),new T.MeshStandardMaterial({color:0x4b492d}));scene.add(mesh);props.set(g,mesh);}props.get(g).position.fromArray(g.pos);}for(const [g,mesh]of props)if(!world.projectiles.includes(g)){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();props.delete(g);}
  if(practice){const visual=playback?.machine.getSnapshot();document.querySelector('#hud').textContent=['Tab · '+toolNames[p.executionTool],({rifle:'步枪',sniper:'狙击枪'})[p.weapon]||'手枪',crossFadeEnabled?'CrossFade':'现有播放器',visual?.name||p.clip,p.executionHint&&!world.exec?'E · 潜行处决':p.traversalCandidate?'按 E '+(p.traversalCandidate.type==='vault'?'翻越':'攀上'):'','动作倍率 '+rateFor(p.state==='prone_exit'?'@proneExit':p.clip)+'×',visual?visual.time.toFixed(2)+' s'+(visual.blending?' · 过渡中':''):'',p.upperClip||'',p.state+' · '+p.posture,Math.hypot(p.vel[0],p.vel[2]).toFixed(2)+' m/s',world.ammo+' / '+world.reserve].join('　');}else document.querySelector('#hud').innerHTML=`生命 ${Math.ceil(p.hp)}<div class="bar"><i style="width:${p.hp}%"></i></div><div class="ammo">${world.ammo} <small>/ ${world.reserve}</small></div>治疗 ${world.medkits}　投掷 ${world.grenades}<br>敌人 ${world.enemies.filter(e=>e.hp>0).length}　${p.hp<=0?'已倒下 · 刷新重试':p.state==='stagger'?'失衡':p.state==='reload'?'换弹中':p.state==='heal'?'治疗中':''}`;
  if(debug)document.querySelector('#debug').textContent=`step ${world.step}\nrender ${Math.round(1/dt)} Hz\noverrun ${loop.overrun}\ntokens ${world.table.tokens.size}\nstate ${p.state}\nclip ${p.clip}\nposture ${p.posture}\narm ${arm.len.toFixed(2)} m\n真实移动匹配：7685 帧 / 74 段\n尚未通过完整规格验收`;
  // Only visual occluders fade; movement and weapon collision remain enabled.
  const cameraBack=view.position.map((v,i)=>v-view.pivot[i]),cameraDistance=Math.hypot(...cameraBack),cameraRay=cameraBack.map(v=>v/(cameraDistance||1));
  for(const {mesh,object} of collisionMeshes){if(!object.min||mesh===ground)continue;
    const fade=!shoulderView&&view.fadeObstacles&&rayBox(view.pivot,cameraRay,object,cameraDistance+.35,.35)<cameraDistance+.35;
    if(mesh.material.transparent!==fade){mesh.material.transparent=fade;mesh.material.needsUpdate=true;}mesh.material.opacity=fade?.12:1;mesh.material.depthWrite=!fade;
    for(const child of mesh.children)if(child.isLineSegments)child.material.opacity=fade?.025:.25;
  }
  renderer.render(scene,camera);
}requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.combatLab={world,loop,actors,renderer,scene,camera,rig,get ready(){return ready;},startTest(){playing=true;world.paused=false;loop.paused=false;document.querySelector('#start').classList.add('hidden');},input:commands,keys,metrics(){const sorted=[...frameTimes].sort((a,b)=>a-b);return {elapsed,frames,step:world.step,overrun:loop.overrun,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};}};







addEventListener('pagehide',event=>{if(!event.persisted)playback?.dispose();});