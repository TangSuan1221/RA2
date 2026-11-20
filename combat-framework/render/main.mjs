import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {World} from '../src/world.mjs';
import {FixedLoop} from '../src/core/loop.mjs';
import {CAM} from '../src/core/constants.mjs';
import {trace,rayBox} from '../src/character/collision.mjs';
import {CameraRig} from '../src/camera/rig.mjs';
import {PosePlayer} from './pose.mjs';
import {decodeMMDB} from '../src/anim/database.mjs';
import {decodeAnimation} from '../src/anim/skeleton.mjs';
import {GamepadInput} from './gamepad.mjs';
import {createPistol,createKnife} from './weapons.mjs';
import {GeometryQueries} from './geometry-query.mjs';

const canvas=document.querySelector('#game'),renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
const scene=new T.Scene();scene.background=new T.Color(0x7d8b85);scene.fog=new T.FogExp2(0x7d8b85,.017);
const camera=new T.PerspectiveCamera(55,innerWidth/innerHeight,.08,120);scene.add(new T.HemisphereLight(0xd0e4e3,0x353a2b,2.1));const sun=new T.DirectionalLight(0xffe1b0,3.5);sun.position.set(-12,24,-8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:23,bottom:-23,far:70});sun.shadow.bias=-.0002;scene.add(sun);
const world=new World(),actors=new Map(),props=new Map(),keys=new Set(),commands=[];let yaw=0,pitch=-.08,aim=false,fire=false,playing=false,ready=false,debug=false,shoulder=1,last=performance.now();const rig=new CameraRig();rig.update(world.player,{yaw,pitch,shoulder},world.obstacles);const arm=rig.arm;
const gamepad=new GamepadInput();
const collisionMeshes=[];
const mat=new T.MeshStandardMaterial({color:0x666d60,roughness:.96});
const ground=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshStandardMaterial({color:0x5b6253,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);collisionMeshes.push({mesh:ground,object:{id:"ground",min:[-40,-.01,-40],max:[40,0,40]}});
for(const b of world.obstacles){const mesh=new T.Mesh(new T.BoxGeometry(...b.max.map((v,i)=>v-b.min[i])),mat.clone());mesh.position.fromArray(b.min.map((v,i)=>(v+b.max[i])/2));mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);collisionMeshes.push({mesh,object:b});const edges=new T.LineSegments(new T.EdgesGeometry(mesh.geometry),new T.LineBasicMaterial({color:0x8e9680,transparent:true,opacity:.25}));mesh.add(edges);}
world.obstacles.geometryQuery=new GeometryQueries(collisionMeshes);world.obstacles.geometryQuery.movementEnabled=true;
// Fixed environment dressing; never enters the authoritative simulation.
for(let i=0;i<85;i++){const x=Math.sin(i*127.1)*16,z=Math.cos(i*43.7)*16;const stone=new T.Mesh(new T.DodecahedronGeometry(.04+(i%5)*.025),mat);stone.position.set(x,.03,z);stone.scale.set(1,.3,1);scene.add(stone);}
const grid=new T.GridHelper(34,34,0x89917b,0x6a735f);grid.position.y=.006;grid.material.transparent=true;grid.material.opacity=.13;scene.add(grid);
const loader=new GLTFLoader();
try{const [gltf,manifest,skeleton,mmBytes]=await Promise.all([loader.loadAsync('/assets/combat/character-female.glb'),fetch('/data/combat/runtime-animations.json').then(r=>{if(!r.ok)throw Error('Missing animation manifest');return r.json();}),fetch('/data/combat/bones.json').then(r=>r.json()),fetch('/data/combat/locomotion.mmdb').then(r=>r.arrayBuffer())]);
const clips=new Map(await Promise.all(manifest.clips.map(async c=>{const r=await fetch('/data/combat/anim/'+c.id+'.bin');if(!r.ok)throw Error('Missing ANIM '+c.id);const clip=decodeAnimation(await r.arrayBuffer());if(clip.skeletonId!==skeleton.skeletonId)throw Error('Skeleton mismatch');return [c.id,clip];})));
world.setAnimationDatabase(decodeMMDB(mmBytes,manifest.clips),manifest);world.setSkeletonAnimations(skeleton.bones,clips);for(const a of [world.player,...world.enemies]){
  const model=clone(gltf.scene),group=new T.Group();group.add(model);scene.add(group);
  model.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;o.frustumCulled=false;o.material=o.material.clone();if(a!==world.player)o.material.color.multiply(new T.Color(0xb5aa90));}});
  const pose=new PosePlayer(model,gltf.animations);pose.sample('Idle_Loop',0,1);pose.bindSkeleton(skeleton.bones);const bounds=new T.Box3().setFromObject(model),height=bounds.max.y-bounds.min.y;model.scale.setScalar(1.78/height);a.modelScale=model.scale.x;model.position.y=-bounds.min.y*model.scale.y;a.modelYOffset=model.position.y;
  const ring=new T.Mesh(new T.RingGeometry(.39,.43,32),new T.MeshBasicMaterial({color:0xba5c42,side:T.DoubleSide,transparent:true,opacity:.85}));ring.rotation.x=-Math.PI/2;ring.position.y=.015;group.add(ring);ring.visible=false;
  const pistol=createPistol(),knife=createKnife();model.getObjectByName('hand_r').add(pistol,knife);pistol.visible=knife.visible=false;
  actors.set(a.id,{group,model,pose,ring,pistol,knife});
}ready=true;document.querySelector('#loading').textContent='资源已载入。点击进入后捕获鼠标；Esc 释放并暂停。';}catch(e){document.querySelector('#loading').textContent='资源载入失败：'+e.message;console.error(e);}
const startPanel=document.querySelector('#start'),controlHint=document.createElement('div');
controlHint.id='control-hint';controlHint.style.cssText='position:fixed;top:76px;left:24px;color:#e7e9da;font:14px sans-serif;pointer-events:none;z-index:5';document.body.appendChild(controlHint);
let hadPointerLock=false;
function setPlaying(value){playing=value;world.paused=!value;loop.paused=!value;keys.clear();commands.length=0;fire=aim=false;startPanel.classList.toggle('hidden',value);controlHint.textContent=value?(document.pointerLockElement===canvas?'':'按住鼠标右键拖动视角 · Esc 暂停'):'';last=performance.now();}
function pointerFallback(){if(playing)controlHint.textContent='当前浏览器未允许鼠标锁定：按住右键拖动视角 · Esc 暂停';}
function start(){
  if(!ready)return;
  setPlaying(true);
  try{if(canvas.requestPointerLock){const request=canvas.requestPointerLock();request?.catch(pointerFallback);}else pointerFallback();}catch{pointerFallback();}
}
document.querySelector('#play').onclick=start;
document.addEventListener('pointerlockerror',pointerFallback);
document.addEventListener('pointerlockchange',()=>{const locked=document.pointerLockElement===canvas;if(locked){hadPointerLock=true;if(playing)controlHint.textContent='';else document.exitPointerLock();}else if(hadPointerLock){hadPointerLock=false;setPlaying(false);}});
window.addEventListener('blur',()=>{if(playing){setPlaying(false);if(document.pointerLockElement===canvas)document.exitPointerLock();}});
document.addEventListener('mousemove',e=>{if(playing&&(document.pointerLockElement===canvas||(e.target===canvas&&(e.buttons&2)))){yaw-=e.movementX*.0025;pitch=Math.max(-1.05,Math.min(.9,pitch-e.movementY*.002));}});
const keyCommand={KeyC:'crouch',KeyZ:'prone',Space:'dodge',KeyQ:'heavy',KeyF:'parry',KeyE:'execute',KeyR:'reload',KeyG:'throw',KeyH:'heal'};
document.addEventListener('keydown',e=>{if(e.code==='Escape'&&playing){e.preventDefault();setPlaying(false);if(document.pointerLockElement===canvas)document.exitPointerLock();return;}if(e.code==='Tab'){e.preventDefault();debug=!debug;document.querySelector('#debug').classList.toggle('visible',debug);}if(!playing)return;keys.add(e.code);if(!e.repeat&&keyCommand[e.code])commands.push(keyCommand[e.code]);if(!e.repeat&&e.code==='KeyV')shoulder*=-1;if(e.code==='Space')e.preventDefault();});document.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('mousedown',e=>{if(!playing)return;if(e.button===2)aim=true;if(e.button===0){fire=true;if(!aim)commands.push('light');}});document.addEventListener('mouseup',e=>{if(e.button===0)fire=false;if(e.button===2)aim=false;});canvas.addEventListener('contextmenu',e=>e.preventDefault());
const loop=new FixedLoop(dt=>{const pad=gamepad.sample(dt);if(pad){yaw+=pad.yawDelta;pitch=Math.max(-1.05,Math.min(.9,pitch+pad.pitchDelta));commands.push(...pad.commands);}const forward=(pad?.forward||0)+(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0),side=(pad?.side||0)+(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);const movementYaw=yaw;world.update({x:Math.sin(movementYaw)*forward-Math.cos(movementYaw)*side,z:Math.cos(movementYaw)*forward+Math.sin(movementYaw)*side,yaw:movementYaw,lookDriven:true,pitch,cameraOrigin:rig.current.aimOrigin||rig.current.position,cameraDirection:rig.current.direction,aim:aim||pad?.aim,fire:fire||pad?.fire,sprint:pad?.sprint||keys.has('ShiftLeft'),walk:keys.has('AltLeft'),commands:commands.splice(0)},dt);rig.update(world.player,{yaw:world.player.yaw,pitch,shoulder,aim:aim||!!pad?.aim},world.obstacles,dt);});loop.paused=true;
const frameTimes=[];let frames=0,elapsed=0;const temp=new T.Vector3();
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.1,(now-last)/1000);last=now;const alpha=loop.advance(dt);if(playing){frames++;elapsed+=dt;frameTimes.push(dt*1000);if(frameTimes.length>36000)frameTimes.shift();}
  for(const a of [world.player,...world.enemies]){const v=actors.get(a.id);if(!v)continue;v.group.position.fromArray(a.pos.map((n,i)=>a.prev[i]+(n-a.prev[i])*alpha));v.group.rotation.y=a.yaw;if(a.pose)v.pose.applyPose(a.previousPose,a.pose,alpha);v.pistol.visible=a.hp>0&&(a.aim||a.state==='reload');v.knife.visible=a.hp>0&&a.attack?.move.id==='atk_heavy_01';v.ring.visible=a.hp>0&&!!a.attack;v.ring.material.color.setHex(a.attack&&a.actionTime>=a.attack.windup?0xe3ac56:0xa84d36);}
  const p=world.player,view=rig.interpolate(alpha);camera.position.fromArray(view.position);temp.fromArray(view.look);camera.lookAt(temp);camera.fov=view.fov;camera.updateProjectionMatrix();
  for(const g of world.projectiles){if(!props.has(g)){const mesh=new T.Mesh(new T.SphereGeometry(.09,8,8),new T.MeshStandardMaterial({color:0x4b492d}));scene.add(mesh);props.set(g,mesh);}props.get(g).position.fromArray(g.pos);}for(const [g,mesh]of props)if(!world.projectiles.includes(g)){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();props.delete(g);}
  document.querySelector('#hud').innerHTML=`生命 ${Math.ceil(p.hp)}<div class="bar"><i style="width:${p.hp}%"></i></div><div class="ammo">${world.ammo} <small>/ ${world.reserve}</small></div>治疗 ${world.medkits}　投掷 ${world.grenades}<br>敌人 ${world.enemies.filter(e=>e.hp>0).length}　${p.hp<=0?'已倒下 · 刷新重试':p.state==='stagger'?'失衡':p.state==='reload'?'换弹中':p.state==='heal'?'治疗中':''}`;
  if(debug)document.querySelector('#debug').textContent=`step ${world.step}\nrender ${Math.round(1/dt)} Hz\noverrun ${loop.overrun}\ntokens ${world.table.tokens.size}\nstate ${p.state}\nclip ${p.clip}\nposture ${p.posture}\narm ${arm.len.toFixed(2)} m\n真实移动匹配：7685 帧 / 74 段\n尚未通过完整规格验收`;
  // Only visual occluders fade; movement and weapon collision remain enabled.
  const cameraBack=view.position.map((v,i)=>v-view.pivot[i]),cameraDistance=Math.hypot(...cameraBack),cameraRay=cameraBack.map(v=>v/(cameraDistance||1));
  for(const {mesh,object} of collisionMeshes){if(!object.min||mesh===ground)continue;
    const fade=view.fadeObstacles&&rayBox(view.pivot,cameraRay,object,cameraDistance+.35,.35)<cameraDistance+.35;
    if(mesh.material.transparent!==fade){mesh.material.transparent=fade;mesh.material.needsUpdate=true;}mesh.material.opacity=fade?.12:1;mesh.material.depthWrite=!fade;
    for(const child of mesh.children)if(child.isLineSegments)child.material.opacity=fade?.025:.25;
  }
  renderer.render(scene,camera);
}requestAnimationFrame(frame);
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
window.combatLab={world,loop,actors,renderer,scene,camera,rig,get ready(){return ready;},startTest(){playing=true;world.paused=false;loop.paused=false;document.querySelector('#start').classList.add('hidden');},input:commands,keys,metrics(){const sorted=[...frameTimes].sort((a,b)=>a-b);return {elapsed,frames,step:world.step,overrun:loop.overrun,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],p99:sorted[Math.floor(sorted.length*.99)],max:sorted.at(-1)};}};






