import {furnishedViews} from './station-room-views.js';
import {isPedestrianHead} from '../world/placements/station-walls.js';
import {createShoulderCamera} from './station-shoulder-camera.js';
import {probeTraversal,advanceTraversal} from '../../combat-framework/src/character/traversal.mjs';
import {practiceCameraSettings} from '../../combat-framework/render/practice-camera-settings.mjs';
import {vaultFollow} from '../../combat-framework/src/camera/rig.mjs';
import {rateFor,vaultCamera} from '../../combat-framework/render/action-rates.mjs';
import {parts,rooms} from '../world/placements/station-layout.js';
import {placed} from '../world/placements/read.js';
import * as T from 'three';

import {metricMaterial,metricUV,createWalker,routeTo} from './station-metrics.js';
const params=new URLSearchParams(location.search);
const structureMode=params.get('art')==='1';
const furnishedPlay=params.get('play')==='1'&&!structureMode;
const artEnabled=structureMode||furnishedPlay;
const artGroups=[];
let sashes=new Map(),movingSash=null;
const captureRequested=structureMode&&[...Object.keys(furnishedViews),'front','corner','rooftop','garage','workshop','quarters','foyer','passage','transom'].includes(params.get('shot'));
let slowFrames=0,fastFrames=0;
let artView,artReady=false,inspection=0;
const checkpoints=[
 {x:15,z:6,r:3,title:'进入南侧公众门厅'},
 {x:-7.1,z:9.25,r:2,title:'穿过员工区，到车库内侧操作卷门手链 [E]'},
 {x:7.5,z:-12,r:2,title:'从厨房北门离站'}
];
const scene=new T.Scene(), camera=new T.PerspectiveCamera(68,1,.05,160);
const followPlayer=createShoulderCamera(camera,practiceCameraSettings);
scene.background=new T.Color(0xbac9cd);
const renderer=new T.WebGLRenderer({antialias:true});
document.body.prepend(renderer.domElement);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
scene.add(new T.HemisphereLight(0xffffff,0x89949b,2));
const sun=new T.DirectionalLight(0xfff4dc,2);sun.position.set(-15,25,12);scene.add(sun);
const stone=0x899197, wall=0xa4aaa9, steel=0x5a646a, gold=0xffbb23, cyan=0x13cddb, purple=0xab66ef, green=0x72c76e;
const structure=metricMaterial("#8c8c8c"),tactical=metricMaterial("#545454");
const occluders=[],breakables=new Set();
const solids=[], items=[], surfaces=[];
function box(x,y,z,w,h,d,color,solid=false){
  const geometry=new T.BoxGeometry(w,h,d);
  const colored=[gold,cyan,purple,green,0xff675c].includes(color);
  const mat=colored?new T.MeshStandardMaterial({color}):color===steel?tactical:structure;
  if(!colored)metricUV(geometry,x,y,z);
  const mesh=new T.Mesh(geometry,mat);
  if(!colored)occluders.push(mesh);
  mesh.position.set(x,y,z);scene.add(mesh);
  if(solid)solids.push(mesh);
  return mesh;
}
const meshes=new Map();
const colors={wall,steel,cyan,gold,purple,green};
for(const spec of parts){
 const {id,name,footprint:{w,h,d},shape}=spec;
 const t=placed('station',id,spec.transform),color=colors[spec.color],rad=t.yaw*Math.PI/180;
 let mesh;
 if(shape==='stairs'||shape==='ramp'){
  const count=shape==='stairs'?28:84;
  for(let i=0;i<count;i++){
   const rise=h*(i+1)/count;
   box(t.x,t.y+rise/2,t.z-d/2+(i+.5)*d/count,w,rise,d/count,color);
  }
  surfaces.push({x:t.x,z:t.z,w,d,height:z=>t.y+(z-t.z+d/2)*h/d});continue;
 }
 if(shape==='ladder'){
  for(const side of [-1,1])box(t.x+side*.45,t.y+h/2,t.z,.09,h,d,color);
  for(let i=0;i<12;i++)box(t.x,t.y+.25+i*.35,t.z,.9,.06,.13,color);
  continue;
 }
 if(shape==='tin'){
  mesh=new T.Mesh(new T.CylinderGeometry(w/2,w/2,h,16),new T.MeshStandardMaterial({color}));
  mesh.position.set(t.x,t.y+h/2,t.z);scene.add(mesh);
 }else{
  mesh=box(t.x,t.y+h/2,t.z,w,h,d,color,spec.solid && shape!=='walkTop');mesh.rotation.y=rad;
  if(rad)metricUV(mesh.geometry,t.x,t.y+h/2,t.z,rad);
 }
 if(shape==='floor'||shape==='walkTop')surfaces.push({x:t.x,z:t.z,w,d,height:()=>t.y+h});
 if(shape==='sign'){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#293436';ctx.fillRect(0,0,512,96);
  ctx.fillStyle='white';ctx.font='bold 43px sans-serif';ctx.textAlign='center';ctx.fillText(name,256,63);
  const plate=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:new T.CanvasTexture(canvas),side:T.DoubleSide}));
  plate.position.z=d/2+.001;mesh.add(plate);
 }
 mesh.name=name;mesh.userData.placementId=id;meshes.set(id,mesh);
}
if(artEnabled){
 const switcher=document.querySelector('#art-mode');switcher.href='station.html';switcher.textContent='灰盒对照';document.querySelector('footer').innerHTML='点击画面操控 · WASD 行走 · Shift 奔跑 · 拖动视角 / ← → 转向 · E 互动或翻窗 · N 显示步行路线 · M 俯视 · Esc 停止';
 if(structureMode)document.body.classList.add('structure-play');
 document.title='27号消防站 · 建筑结构验收';
 document.querySelector('header b').textContent=furnishedPlay?'27 号消防站 · 工坊订单':'27 号消防站 · 室内巡检';
 const retained=new Set(['site','gate','chain',...(furnishedPlay?['board','car','trunk']:[])]);
 if(furnishedPlay)meshes.get('board').material=new T.MeshBasicMaterial({visible:false});
 for(const spec of parts){
  const mesh=meshes.get(spec.id);if(!mesh)continue;
  mesh.visible=spec.id.startsWith('wall/')||spec.shape==='roof'||retained.has(spec.id);
  mesh.castShadow=mesh.visible;mesh.receiveShadow=mesh.visible;
 }
 const gateMesh=meshes.get('gate');
 if(structureMode){gateMesh.scale.y=4.5/3.25;gateMesh.position.y=2.25;}
 const loadArt=async()=>{
  const [{lightStructure,studyViews},{buildInterior},{buildExterior}]=await Promise.all([
    import('./station-art-light.js'),import('./station-interior.js'),import('./station-exterior.js')
  ]);
  const sky=lightStructure(scene,renderer,sun);
  for(const group of [await buildInterior(scene,meshes,parts),await buildExterior(scene,meshes,{})])if(group)artGroups.push(group);
  const {furnishStation}=await import('./station-furnishings.js');
  await furnishStation(scene,meshes);
  if(furnishedPlay){
   const pump=meshes.get('pump').children.at(-1).clone();pump.position.set(0,-.20,0);held.material=new T.MeshBasicMaterial({visible:false});held.add(pump);
  }
  for(const box of traversalBoxes){
   const bounds=new T.Box3().setFromObject(box.mesh);
   box.min=bounds.min.toArray();box.max=bounds.max.toArray();
  }
  document.body.dataset.roomItems=String(scene.userData.roomDressingCount);
  sashes=artGroups[0].userData.windowSashes;
  const {batchWalls}=await import('./station-art-batches.js');batchWalls(scene,meshes);const {bakeRoomBounce}=await import('./station-art-bounce.js');bakeRoomBounce(scene,meshes);renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
  const views={...studyViews,...furnishedViews};artView=views[params.get('shot')];
  if(artView){document.body.classList.add('capture');camera.filmOffset=0;camera.fov=artView.fov;camera.updateProjectionMatrix();}
  window.addEventListener('hashchange',()=>{const next=views[location.hash.slice(1)];if(artView&&next){artView=next;camera.fov=next.fov;camera.updateProjectionMatrix();}});
  await Promise.all([sky,walker.ready]);
  scene.userData.stationMaterialsReady=true;
  // The HDR environment changes the main and reflected material programs.
  // Finish the first fully lit frame before the player starts moving.
  await renderer.compileAsync(scene,camera);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  artReady=true;document.body.dataset.artReady='true';objective();
 };
 loadArt().catch(e=>{document.querySelector('#goal').textContent='结构加载失败：'+e.message;console.error(e);});
}
// Draw the pedestrian-level cut from the same saved wall transforms as the scene.
const mapWalls=document.querySelector('#map-walls'),mapPlayer=document.querySelector('#map-player');
for(const spec of parts){
 if(!spec.id.startsWith('wall/')&&!['truck','ambulance','car','gate'].includes(spec.id))continue;
 const mesh=meshes.get(spec.id),{w,h,d}=spec.footprint;
 if(!mesh.visible)continue;
 if(spec.id.startsWith('wall/') && mesh.position.y-h/2>1.0)continue;
 const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
 const depth=Math.max(.36,d);
 rect.setAttribute('x',-w/2);rect.setAttribute('y',-depth/2);
 rect.setAttribute('width',w);rect.setAttribute('height',depth);
 rect.setAttribute('transform',`translate(${mesh.position.x} ${mesh.position.z}) rotate(${-mesh.rotation.y*180/Math.PI})`);
 if(!spec.id.startsWith('wall/'))rect.setAttribute('fill',spec.id==='gate'?'#dea765':'#697e80');
 if(spec.id==='gate')rect.id='map-shutter';
 mapWalls.append(rect);
}
const doorways=parts.filter(spec=>spec.id.startsWith('wall/')&&isPedestrianHead(spec.transform.y)&&spec.footprint.w<=3).map(spec=>meshes.get(spec.id));
function atDoorway(){
 return doorways.some(m=>{
   const dx=p.x-m.position.x,dz=p.z-m.position.z;
   const rotated=Math.abs(Math.sin(m.rotation.y))>.5;
   return Math.abs(rotated?dz:dx)<m.geometry.parameters.width/2 && Math.abs(rotated?dx:dz)<1.4;
 });
}
const crate=meshes.get('crate');breakables.add(crate);
let prone=false,rollLeft=0,rollYaw=0;
const p=new T.Vector3(14,0,12.5),keys=new Set();
let yaw=0,pitch=-.18,overview=false,carrying=false,crouched=false,notice='',until=0;
const walker=captureRequested?{group:new T.Group(),animate(){},trigger(){}}:createWalker();scene.add(walker.group);
const heldGeometry=new T.BoxGeometry(.58,.46,.45);metricUV(heldGeometry,0,0,0);
const held=new T.Mesh(heldGeometry,tactical);
held.position.set(0,1,-.32);walker.group.add(held);
let routeLine,probe,probeUntil=0;
const prompt=document.querySelector('#prompt'),goal=document.querySelector('#goal');
function say(t){notice=t;until=performance.now()+2400}
function item(mesh,title,use){
  const entry={mesh,title,use};items.push(entry);return entry;
}
const board=meshes.get('board'),bench=meshes.get('bench'),cart=meshes.get('cart'),gate=meshes.get('gate');
let recorded=false, tested=false, loaded=false, open=false, delivered=false, testingUntil=0;
const cargo=meshes.get('pump'),halfY=gate.position.y;
let handPump=false, scoutingExit=false, jumpHeight=0, jumpSpeed=0, wrongPump=false;
function objective(){
 if(artEnabled&&!artReady){goal.textContent='正在准备消防局场景…';return;}
 if(structureMode){const point=checkpoints[inspection];goal.textContent=point?.title??'结构巡检完成 · 已从北门离站';const pin=document.querySelector('#map-target');pin.style.display=point?'':'none';if(point){pin.setAttribute('cx',point.x);pin.setAttribute('cy',point.z);}return;}
 const message=scoutingExit?'侦察离站 · 情报已记录':delivered?'泵已交接 · 本站白盒流程完成':loaded?'推至南坪接驳车旁卸货':tested?(handPump?'把合格泵搬到车库步行带推车':'从试验台取下合格泵'):recorded?'去维修间试泵，或从北门带情报离站':'到前厅值班台核对工单';
 goal.textContent=message;
}
item(board,'核对出勤记录',()=>{recorded=true;objective();say('工单已核对 · 维修间双表台有一台待验泵');});
function testPump(faulty){
 if(tested){if(faulty)return say('此泵待拆，取左侧合格泵');if(!loaded&&!delivered&&!handPump){handPump=true;cargo.visible=false;objective();}return say('泵压已确认');}
 if(testingUntil){testingUntil=0;return say('试验中止 · 可重新检验');}
 wrongPump=faulty;testingUntil=performance.now()+3500;say('试压中 · 可按 E 中止');
}
item(cargo,'检验左泵 / 取下合格泵',()=>testPump(false));
item(meshes.get('faulty'),'检验右泵',()=>testPump(true));
item(cart,'装泵 / 接手推车',()=>{
 if(delivered)return;
 if(!tested)return say('先到维修台试压');
 if(carrying){carrying=false;return say('推车已制动');}
 if(!loaded&&!handPump)return say('从试验台取下合格泵');
 handPump=false;cargo.visible=!furnishedPlay;cart.userData.setLoad?.(true);
 loaded=true;carrying=true;syncCargo();objective();say('已接手 · WASD 推车，Q 制动离手');
});
function syncCargo(){if(loaded)cargo.position.set(cart.position.x,1.24,cart.position.z);}
item(meshes.get('chain'),'升降出车卷门',()=>{
 if(open && Math.abs(p.x-gate.position.x)<6.32 && Math.abs(p.z-gate.position.z)<.42)return say('门槛有人，卷门保持开启');
 if(open && Math.abs(cart.position.x-gate.position.x)<6.4&&Math.abs(cart.position.z-gate.position.z)<.75)return say('车在门槛上，卷门保持开启');
 renderer.shadowMap.needsUpdate=true;open=!open;gate.visible=!open;document.querySelector('#map-shutter').style.display=open?'none':'';gate.position.y=halfY;gate.updateMatrixWorld();if(structureMode&&inspection===1&&open){inspection++;objective();}refreshRoute();say(open?(structureMode?'卷门已升起 · 车道通畅':'卷门全开 · 装载桥就绪'):structureMode?'卷门已关闭':'卷门半开 · 蹲姿可通行');
});
item(meshes.get('trunk'),'南坪装载桥 · 交货',()=>{
 if(delivered)return;
 const target=meshes.get('trunk').position;
 if(!loaded||Math.hypot(cart.position.x-target.x,cart.position.z-target.z)>3)return say('把装泵推车推到接驳车尾');
 if(!open)return say('先升起指定卷门对接装载桥');
 delivered=true;carrying=false;loaded=false;cart.userData.setLoad?.(false);cargo.visible=true;cargo.position.copy(target).y+=.5;objective();say('运单待街区撤离结算');
});
objective();
function blocked(x,y,z,rx=.32,rz=.32,height=prone?.65:crouched?1.05:1.78,skip=null){
  return solids.some(m=>{if(!m.visible||m===skip)return false;const g=m.geometry.parameters,v=m.position;
    const c=Math.cos(m.rotation.y),s=Math.sin(m.rotation.y),dx=x-v.x,dz=z-v.z;
    return Math.abs(dx*c-dz*s)<g.width/2+Math.abs(c)*rx+Math.abs(s)*rz&&Math.abs(dx*s+dz*c)<g.depth/2+Math.abs(s)*rx+Math.abs(c)*rz&&y+height>v.y-g.height*m.scale.y/2&&y+.1<v.y+g.height*m.scale.y/2});
}
function nextHeight(from,x,z){
  let best=-Infinity;
  for(const s of surfaces){
    if(Math.abs(x-s.x)>s.w/2||Math.abs(z-s.z)>s.d/2)continue;
    const h=s.height(z);
    best=Math.max(best,h);
  }
  if(!Number.isFinite(best)||Math.abs(best-from.y)>.36||blocked(x,best,z,.32,.32,(prone?.65:crouched?1.05:1.78)+jumpHeight,carrying?cart:null))return null;
  return best;
}
function cartFits(x,z){
 return Math.abs(x)<=25.6 && Math.abs(z-4)<=25.4 && !blocked(x,0,z,.4,.6,1.5,cart)
   && !surfaces.some(s=>s.height(z)>.1&&Math.abs(x-s.x)<s.w/2+.4&&Math.abs(z-s.z)<s.d/2+.6);
}
function move(dx,dz){const x=p.x+dx,z=p.z+dz,y=nextHeight(p,x,z);if(y===null)return;
 if(carrying){const nx=cart.position.x+dx,nz=cart.position.z+dz;
  if(!cartFits(nx,nz))return;
  cart.position.x=nx;cart.position.z=nz;syncCargo();}
 p.set(x,y,z)}
function clearLine(line){if(line){scene.remove(line);line.geometry.dispose();line.material.dispose()}}
function line(points,color){
  const l=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color}));
  scene.add(l);return l;
}
function refreshRoute(){if(routeLine)navigation();}
function navigation(){
  clearLine(routeLine);routeLine=null;
  const target=loaded?meshes.get('trunk'):handPump?cart:recorded||tested?bench:board;
  const goal=target.position.clone();goal.y=0;
  if(structureMode){const point=checkpoints[inspection];if(!point){document.querySelector('#map-route').setAttribute('points','');return say('结构巡检已完成');}goal.set(point.x,0,point.z);}
  const offset=cart.position.clone().sub(p);
  const path=routeTo(p,goal,(from,x,z)=>{
    if(carrying && !cartFits(x+offset.x,z+offset.z))return null;
    return nextHeight(from,x,z);
  });
  if(structureMode)document.querySelector('#map-route').setAttribute('points',path.map(v=>v.x+','+v.z).join(' '));
  if(path.length)routeLine=line(path,0x22dd77);
  say(path.length?'绿色为当前可步行路径':'当前无连续步行路径');
}
function inspectRay(){
  scene.updateMatrixWorld(true);
  sight.setFromCamera(new T.Vector2(),camera);
  const objects=occluders.filter(m=>m.visible);
  sight.near=Math.max(0,camera.position.distanceTo(p)-.3);
  const aim=sight.intersectObjects(objects,false)[0]?.point??sight.ray.at(50,new T.Vector3());
  const origin=p.clone();origin.y+=jumpHeight+(crouched?.92:1.48);
  sight.near=0;
  sight.set(origin,aim.clone().sub(origin).normalize());
  const hit=sight.intersectObjects(objects,false)[0];
  clearLine(probe);probe=line([origin,hit?.point??aim],0xff674c);probeUntil=performance.now()+1100;
  if(breakables.has(hit?.object)){hit.object.visible=false;refreshRoute();say('测试箱已破坏')}
  else say(hit?'命中 '+(hit.object.name||'表面')+' · '+hit.distance.toFixed(1)+' m':'射线畅通');
}
const sight=new T.Raycaster(),eye=new T.Vector3(),direction=new T.Vector3();
sight.layers.enable(2);
const traversalBoxes=solids.map(mesh=>{
 const bounds=new T.Box3().setFromObject(mesh);
 return {mesh,id:mesh.uuid,min:bounds.min.toArray(),max:bounds.max.toArray()};
});
function obstaclesForVault(){
 const cartBox=traversalBoxes.find(b=>b.mesh===cart);
 const bounds=new T.Box3().setFromObject(cart);
 cartBox.min=bounds.min.toArray();cartBox.max=bounds.max.toArray();
 return traversalBoxes.filter(b=>b.mesh.visible);
}
let vaultActor=null,vaultCameraAnchor=null,vaultCameraTime=0;
const followPosition=new T.Vector3();
function windowCandidate(){
 if(vaultActor||handPump||carrying||prone||jumpHeight||jumpSpeed||rollLeft)return null;
 const actor={pos:p.toArray(),vel:[0,0,0],yaw:yaw+Math.PI,grounded:true,radius:.32,posture:'stand'};
 const boxes=obstaclesForVault(),path=probeTraversal(actor,boxes);
 if(path?.type!=='vault')return null;
 const sill=boxes.find(b=>b.id===path.id);
 if(!sill.mesh.name.startsWith('墙段')||Math.abs(sill.max[1]-.75)>.001)return null;
 actor.sillId=sill.mesh.userData.placementId;actor.height=path.height;actor.traversal={...path,elapsed:0};
 return actor;
}
function nearby(){
  eye.copy(p).y+=prone?.48:crouched?.92:1.35;camera.getWorldDirection(direction);
  let selected=null,best=2.65;
  for(const it of items){
    if(!it.mesh.visible)continue;
    const v=it.mesh.position.clone().sub(eye),d=v.length();
    if(d>best||v.normalize().dot(direction)<.16)continue;
    sight.set(eye,v);
    if(sight.intersectObjects(solids.filter(m=>m.visible&&m!==it.mesh),false).some(hit=>hit.distance<d-.3))continue;
    best=d;selected=it;
  }
  return selected;
}
const labels=rooms.map(([name,x,z])=>{
 const c=document.createElement('canvas');c.width=384;c.height=80;
 const ctx=c.getContext('2d');ctx.fillStyle='#233038';ctx.fillRect(0,0,384,80);ctx.fillStyle='white';ctx.font='bold 46px sans-serif';ctx.textAlign='center';ctx.fillText(name,192,57);
 const label=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(c),depthTest:false}));label.position.set(x,2,z);label.scale.set(4,1,1);label.visible=false;label.renderOrder=10;scene.add(label);return label;
});
function toggle(){renderer.shadowMap.needsUpdate=true;resetInput();overview=!overview;for(const group of artGroups)group.visible=!overview;for(const label of labels)label.visible=overview;for(const spec of parts)if(spec.shape==='roof')meshes.get(spec.id).visible=!overview;if(!overview)canvas.focus({preventScroll:true});document.querySelector('#map').textContent=overview?'返回试玩 [M]':'俯视全站 [M]';}
document.querySelector('#map').onclick=toggle;
const canvas=renderer.domElement;
canvas.tabIndex=0;
canvas.setAttribute('aria-label','消防局试玩，WASD 移动，Esc 停止');
const continuous=new Set(['KeyW','KeyA','KeyS','KeyD','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight']);
// Browsers send a longer initial repeat delay than the following pulses.
// A turning key or modifier must never keep an orphaned walking key alive.
const heldUntil=new Map();
function expireInput(now){
  for(const [code,deadline] of heldUntil){
    if(now>=deadline){keys.delete(code);heldUntil.delete(code);}
  }
}
function keyCode(e){
  if(e.code && e.code!=='Unidentified')return e.code;
  if(/^[a-z]$/i.test(e.key??''))return 'Key'+e.key.toUpperCase();
  if(e.key==='Shift')return e.location===2?'ShiftRight':'ShiftLeft';
  if(e.key===' ')return 'Space';
  if(e.key && e.key!=='Unidentified' && e.key!=='Process')return e.key;
  return e.keyCode>=65&&e.keyCode<=90?'Key'+String.fromCharCode(e.keyCode):'';
}
function resetInput(){keys.clear();heldUntil.clear();rollLeft=0;}
function release(e){
  const code=keyCode(e);
  if(!code){resetInput();return;}
  keys.delete(code);heldUntil.delete(code);
}
window.addEventListener('keydown',e=>{
  const code=keyCode(e);
  if(code==='Escape'){resetInput();return;}
  if(artEnabled&&!artReady)return;
  if(e.ctrlKey||e.altKey||e.metaKey){resetInput();return;}
  if(e.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  if(e.target.closest?.('a,button')&&code!=='KeyM')return;
  if(continuous.has(code)){
    if(overview||document.activeElement!==canvas||e.target!==canvas||!document.hasFocus()||document.hidden)return;
    if(e.repeat&&!keys.has(code))return;
    e.preventDefault();
    const repeated=keys.has(code);
    keys.add(code);
    if(code!=='ShiftLeft'&&code!=='ShiftRight'){
      heldUntil.set(code,performance.now()+(repeated?450:1150));
      if(!e.shiftKey){keys.delete('ShiftLeft');keys.delete('ShiftRight');}
    }
    return;
  }
  if(e.repeat)return;
  if(code==='Space')e.preventDefault();
  if(code==='KeyN')navigation();if(code==='KeyM')toggle();if(overview)return;
  if(vaultActor)return;
  if(code==='KeyR')inspectRay();
  if(code==='KeyE'){const candidate=windowCandidate();if(candidate){vaultActor=candidate;vaultCameraAnchor=p.clone();vaultCameraTime=0;movingSash=sashes.get(candidate.sillId)??null;if(movingSash){movingSash.position.y=.41;renderer.shadowMap.needsUpdate=true;}return;}const target=nearby();if(target){target.use();walker.trigger('Interact');}}
  if(code==='KeyQ'&&carrying){carrying=false;refreshRoute();say('推车已制动');}
  if(code==='Space'&&!overview&&!prone&&!crouched&&!handPump&&!carrying&&!jumpHeight&&!rollLeft){rollLeft=.48;rollYaw=yaw;walker.trigger('Roll');}
  if(code==='KeyZ'&&!carrying&&!jumpHeight&&!rollLeft){if(!prone){prone=true;crouched=true;walker.trigger('Crouch_To_Prone');}else if(!blocked(p.x,p.y,p.z,.32,.32,1.05)){prone=false;walker.trigger('@proneExit');}refreshRoute();}
  if(code==='KeyJ'&&!jumpHeight&&!jumpSpeed&&!carrying&&!handPump&&!crouched)jumpSpeed=3.8;
  if(code==='KeyC'&&!prone&&!carrying&&!jumpHeight){
   if(!crouched||!blocked(p.x,p.y,p.z,.32,.32,1.78)){crouched=!crouched;refreshRoute();}
  }
});
window.addEventListener('keyup',release,true);
if(window.parent!==window && document.referrer && new URL(document.referrer).origin===location.origin){
 window.parent.addEventListener('keyup',release,true);
 window.addEventListener('pagehide',()=>window.parent.removeEventListener('keyup',release,true),{once:true});
}
window.addEventListener('blur',resetInput);
window.addEventListener('pagehide',resetInput);
canvas.addEventListener('blur',resetInput);
window.addEventListener('pointercancel',resetInput);
document.addEventListener('visibilitychange',()=>{if(document.hidden)resetInput();});
document.addEventListener('focusin',e=>{if(e.target.closest('button,a,input,select'))resetInput();});
canvas.onpointerdown=e=>{canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);};
canvas.onpointermove=e=>{if(e.buttons&&!overview){yaw-=e.movementX*.006;pitch=T.MathUtils.clamp(pitch-e.movementY*.005,-1.3,1.25)}};
const marker=box(0,0,0,.6,.2,.6,0xff675c);let prev=performance.now();
renderer.setAnimationLoop(now=>{
 if(keys.size){
   if(document.activeElement!==canvas||document.hidden||!document.hasFocus())resetInput();
   else expireInput(performance.now());
 }
 const elapsed=(now-prev)/1000,dt=Math.min(.05,elapsed);prev=now;
 if(artView){
   camera.position.fromArray(artView.eye);camera.lookAt(...artView.look);
   walker.group.visible=false;marker.visible=false;
   renderer.render(scene,camera);
   canvas.dataset.calls=renderer.info.render.calls;canvas.dataset.triangles=renderer.info.render.triangles;
   return;
 }
 if(artEnabled&&artReady&&elapsed>0){
   slowFrames=elapsed>.052?slowFrames+1:0;
   fastFrames=elapsed<.021?fastFrames+1:0;
   const ratio=renderer.getPixelRatio(),maxRatio=Math.min(devicePixelRatio,1.6);
   if(slowFrames>=18&&ratio>.65){renderer.setPixelRatio(Math.max(.65,ratio-.15));slowFrames=0;}
   if(fastFrames>=180&&ratio<maxRatio){renderer.setPixelRatio(Math.min(maxRatio,ratio+.1));fastFrames=0;}
 }
 if(testingUntil && now>=testingUntil){testingUntil=0;tested=!wrongPump;objective();say(wrongPump?'表针回落 · 此泵待拆':'泵压稳定 · 可取下合格泵');}
 if(structureMode&&artReady&&inspection<checkpoints.length){
  const c=checkpoints[inspection];if(inspection!==1&&Math.hypot(p.x-c.x,p.z-c.z)<c.r){inspection++;objective();refreshRoute();}
 }
 if(!overview){
  if(jumpSpeed||jumpHeight){
   jumpSpeed-=9.81*dt;
   const next=Math.max(0,jumpHeight+jumpSpeed*dt);
   if(next>jumpHeight&&blocked(p.x,p.y+next,p.z)){jumpSpeed=0;}
   else {jumpHeight=next;if(!next){jumpSpeed=0;walker.trigger('Jump_Land');}}
  }
  if(recorded&&!loaded&&!handPump&&!scoutingExit&&p.z< -11.5&&Math.abs(p.x-7.5)<1.5){scoutingExit=true;objective();say('侦察路线抵达北侧离站口');}
  yaw+=dt*1.8*(keys.has('ArrowLeft')-keys.has('ArrowRight'));
  const f=keys.has('KeyW')-keys.has('KeyS'),r=keys.has('KeyD')-keys.has('KeyA');
  const old=p.clone();
  const step=dt*(prone?.65*rateFor('Prone_Crawl_Forward'):crouched?1.25:carrying?1.9:keys.has('ShiftLeft')||keys.has('ShiftRight')?4.5:2.3)/Math.max(1,Math.hypot(f,r));
  const vaulting=!!vaultActor;
  if(vaultActor){
   advanceTraversal(vaultActor,dt*rateFor('Safety_Vault'),obstaclesForVault(),0);p.fromArray(vaultActor.pos);
   if(!vaultActor.traversal){vaultActor=null;if(movingSash){movingSash.position.y=0;movingSash=null;renderer.shadowMap.needsUpdate=true;}}
  }else if(rollLeft>0){
   const rollStep=Math.min(dt*rateFor('Roll'),rollLeft);
   const stride=3.4*rollStep;rollLeft-=rollStep;
   move(-stride*Math.sin(rollYaw),0);move(0,-stride*Math.cos(rollYaw));
  }else if(f||r){move((r*Math.cos(yaw)-f*Math.sin(yaw))*step,0);move(0,(-f*Math.cos(yaw)-r*Math.sin(yaw))*step);}
  const dx=p.x-old.x,dz=p.z-old.z;
  walker.animate(Math.hypot(dx,dz),Math.atan2(-dx,-dz),{vault:vaulting,prone,push:carrying,carry:handPump,crouch:crouched,air:jumpHeight>0},dt);
  followPosition.copy(p);
  if(vaultCameraAnchor){
   const blend=vaultFollow(vaultCameraTime,vaultCamera.hold);
   followPosition.lerpVectors(vaultCameraAnchor,p,blend);vaultCameraTime+=dt;
   if(!vaultActor && blend===1)vaultCameraAnchor=null;
  }
  followPlayer({position:followPosition,distanceOverride:vaultCameraAnchor?vaultCamera.distance:undefined,jumpHeight,crouched,prone,yaw,pitch,moving:Math.hypot(dx,dz)>.0001,nearDoor:atDoorway(),dt,obstacles:occluders.filter(m=>m.visible)});
 }else{
   if(camera.fov!==68||camera.filmOffset!==0){camera.fov=68;camera.filmOffset=0;camera.updateProjectionMatrix();}
   camera.position.set(0,innerWidth/innerHeight<1.4?47:33,1.1);camera.lookAt(0,0,1)}

 mapPlayer.setAttribute('transform',`translate(${p.x} ${p.z}) rotate(${-yaw*180/Math.PI})`);
 walker.group.position.copy(p).y+=jumpHeight;held.visible=handPump;if(probe)probe.visible=now<probeUntil;
 marker.visible=overview;marker.position.copy(p).y+=.3;
 const it=overview?null:nearby();
 prompt.textContent=now<until?notice:overview?'红点为当前位置':windowCandidate()?'E · 翻越窗台':it?'E · '+it.title:'';
 document.querySelector('#position').textContent='X '+p.x.toFixed(1)+'　Z '+p.z.toFixed(1)+'　脚底 '+(p.y+jumpHeight).toFixed(2)+' m';
 prompt.hidden=!prompt.textContent;

 renderer.render(scene,camera);
 if(artReady){renderer.domElement.dataset.calls=renderer.info.render.calls;renderer.domElement.dataset.triangles=renderer.info.render.triangles;}
});
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}onresize=resize;resize();
