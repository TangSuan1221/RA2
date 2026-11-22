import {westernSkyline} from './western-skyline.js';
import {harbor} from './harbor.js';
import {onPioneerWalk} from './pioneer-floor.js';
import {towerLift} from './tower-lift.js';
import {minimap} from './minimap.js';
import {addGroves} from './groves.js';
import {corridorCrowd} from './corridor-crowd.js';
import {drivingLights} from './driving-lights.js';
import {ambience} from './ambience.js';
import {addCivicDetails} from './civic-details.js';
import {detours} from './detours.js';
import * as T from 'three';
import {layout,edges,open,offset,heightAt,onCorridorSidewalk,roadWidth,route,start,stops,state,boatDock,boatTurn} from './network.js';
import {world} from './world.js';
import {estate} from './estate.js';
import {alternateVehicle,weather,engineSound} from './effects.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import './play.css';
import {pipeline} from './pipeline.js';
import surfaceFiles from './art/surface-files.json';
const optimizedSurfaces=new Map(surfaceFiles.map(path=>[path,'/assets/evac-art/surfaces/'+path.split('/').pop().replace(/\.jpg$/,'.webp')]));
T.DefaultLoadingManager.setURLModifier(url=>optimizedSurfaces.get(url)??url);
document.body.innerHTML=`<main id="game"></main><section id="panel"><small>THE LAST RULE · 西雅图</small><h1>滨海撤离</h1><b id="task"></b><p id="note"></p><button id="interact"></button> <button id="guide">沿导航驾驶</button><div id="trip"></div></section><aside><canvas id="map" width="220" height="220"></canvas><details><summary>驾驶与环境</summary><label>通行类型 <select id="mode"><option>轿车</option><option>摩托</option><option>卡车</option><option>步行</option></select></label><div id="flags"></div><label>画质 <select id="quality"><option value="full">标准</option><option value="low">流畅</option></select></label><label><input type="checkbox" id="quiet"> 静音</label><button id="view">切换跟车 / 俯视</button></details></aside><footer><a href="/docs/snap-lab.html?scene=world" style="color:inherit">编辑地图吸附</a> · W/S 加速与倒车 · A/D 转向 · 空格制动 · E 互动 · G 导航驾驶 · H 鸣笛 · C 镜头</footer>`;
const $=id=>document.getElementById(id);
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;
$('game').append(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(62,innerWidth/innerHeight,.12,2300);
scene.background=new T.Color(0xa9b8b9);scene.fog=new T.FogExp2(0xa4b2b0,.0024);
const light=new T.HemisphereLight(0xd6e6ef,0x655f47,1.03),sun=new T.DirectionalLight(0xffe3bd,2.1);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,far:245});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00006;sun.shadow.normalBias=.028;scene.add(light,sun,sun.target);
const reviewParams=new URLSearchParams(location.search);
const yardReview=reviewParams.get('review')==='power'&&['on','off'].includes(reviewParams.get('power'));
if(yardReview){sun.intensity=.46;light.intensity=.72;scene.fog.color.set(0x697581);}
new HDRLoader().load('/assets/hdri/kloofendal_overcast_1k.hdr',tex=>{tex.mapping=T.EquirectangularReflectionMapping;scene.environment=tex;scene.environmentIntensity=yardReview?.41:.64;scene.background=tex;scene.backgroundIntensity=yardReview?.37:.66;scene.backgroundBlurriness=.045});
harbor(scene);westernSkyline(scene);
const lift=towerLift(scene);
addCivicDetails(scene);addGroves(scene);
const crowd=corridorCrowd(scene);
const surfaces=world(scene),car=new T.Group();scene.add(car);
const updateLights=drivingLights(car);
const models={'轿车':estate(),'摩托':alternateVehicle('摩托'),'卡车':alternateVehicle('卡车')};for(const [id,obj] of Object.entries(models)){obj.visible=id==='轿车';car.add(obj)}
const soundscape=ambience();window.addEventListener('pointerdown',soundscape.start,{once:true});window.addEventListener('keydown',soundscape.start,{once:true});const hull=new T.Shape();
hull.moveTo(-.72,-1.65);hull.lineTo(.72,-1.65);hull.lineTo(.85,.55);hull.quadraticCurveTo(.65,1.55,0,2.05);hull.quadraticCurveTo(-.65,1.55,-.85,.55);hull.closePath();
const skiff=new T.Group(),keel=new T.Mesh(new T.ExtrudeGeometry(hull,{depth:.37,bevelEnabled:true,bevelSize:.08,bevelThickness:.07}),new T.MeshStandardMaterial({color:0x765f4c,roughness:.75}));
keel.rotation.x=Math.PI/2;skiff.add(keel);
for(const z of [-.8,.55]){
 const bench=new T.Mesh(new T.BoxGeometry(1.42,.12,.28),new T.MeshStandardMaterial({color:0xba966e}));
 bench.position.set(0,.12,z);skiff.add(bench);
}
skiff.visible=false;car.add(skiff);
let boatGoal=null,parkedMode=null;
function showMode(next){
 mode=next;car.visible=next!=='步行';skiff.visible=next==='划船';
 for(const [id,obj] of Object.entries(models))obj.visible=id===next;
}
function boatAction(){
 if(!boatGoal){
  if(state.tide){$('note').textContent='码头已被淹没，请在低潮时上船。';return}
  parkedMode=mode;const [x,z]=layout.nodes[boatDock];pos.set(x,0,z);
  showMode('划船');boatGoal=boatTurn;sideTrips.lock(true);$('mode').disabled=true;
  $('note').textContent='沿水道划至桥下浮标，按 E 核验，再返回码头。';
 }else if(boatGoal===boatTurn){
  boatGoal=boatDock;$('note').textContent='已核验浮标，沿原航道返回码头。';
 }else{
  const [x,z]=layout.nodes[boatDock];pos.set(x,0,z);
  showMode(parkedMode);boatGoal=null;sideTrips.resume();$('mode').disabled=false;
  $('note').textContent='划船往返完成，已靠岸并恢复撤离任务。';
 }
}
const updateWeather=weather(scene),audio=engineSound();window.addEventListener('pointerdown',audio.start,{once:true});window.addEventListener('keydown',audio.start,{once:true});
let pos=new T.Vector3(275,0,1810),heading=-Math.PI/2,velocity=0,phase=0,auto=false,high=false,path=[],mode='轿车',distance=0,elapsed=0,finished=false,env;
const sideTrips=detours(document.querySelector('aside details'),layout.nodes,()=>{auto=false;velocity=0;plan();ui()});
const targetId=()=>boatGoal??sideTrips.selected?.[0]??stops[Math.min(phase,5)][0];
const keys=new Set(),camGoal=new T.Vector3(),aim=new T.Vector3(),targetPoint=()=>layout.nodes[targetId()];
function plan(){const t=targetPoint();path=route(pos.x,pos.z,targetId(),mode,pos.y);return Math.hypot(pos.x-t[0],pos.z-t[1])}
function action(){
 if(lift.active){lift.descend();ui();return}
 if(finished){location.reload();return}if(plan()>9)return;auto=false;velocity=0;if(sideTrips.selected?.[3]==='tower'&&phase>=5&&mode==='步行'){
 lift.begin(pos);sideTrips.lock(true);$('mode').disabled=true;heading=.12;
 $('note').textContent='电梯已通电，登台后可用 A/D 环视，按 E 返回。';ui();return
}
if(sideTrips.selected?.[3]==='boat'){boatAction();plan();ui();return}if(sideTrips.selected){$('note').textContent=sideTrips.interact(phase,$('flags'));plan();ui();return}$('note').textContent=stops[phase][3];if(phase===4)env?.setPower?.(true);if(++phase>=stops.length){finished=true;$('note').textContent='已登船。急救箱、净水、撤离频率与供电全部就绪。'}plan();ui()}
function toggle(){if(lift.active)return;if(finished||plan()<9)return;if(!path.length){$('note').textContent='当前位置无法接入路线，请回到可通行路面。';return}auto=!auto;velocity=0;ui()}
function ui(){
 if(lift.active){$('task').textContent='太空针观景电梯';$('interact').textContent=lift.atTop?'返回地面 [E]':'电梯运行中';$('interact').disabled=!lift.atTop;$('guide').disabled=true;$('trip').textContent='标高 '+Math.round(pos.y)+' m';return}
 const t=targetPoint(),d=Math.hypot(pos.x-t[0],pos.z-t[1]);$('task').textContent=finished?'撤离成功':(boatGoal?(boatGoal===boatTurn?'划船 · 核验桥下浮标':'划船 · 返回西岸码头'):sideTrips.selected?.[1]??((phase+1)+' / 6　'+stops[phase][1]));$('interact').textContent=finished?'重新出发':(boatGoal?(boatGoal===boatTurn?'核验浮标':'靠岸下船'):sideTrips.selected?.[2]??stops[phase][2])+(d<=9?' [E]':'');$('interact').disabled=!finished&&d>9;$('guide').disabled=finished||d<=9;$('guide').textContent=auto?'接管驾驶':'沿导航驾驶';$('trip').textContent=Math.round(Math.abs(velocity)*3.6)+' km/h　·　'+(finished?'行驶 '+(distance/1000).toFixed(2)+' km':'距目标 '+Math.round(path.length?path.reduce((sum,p,i)=>sum+Math.hypot(p[0]-(i?path[i-1][0]:pos.x),p[1]-(i?path[i-1][1]:pos.z)),0):d)+' m')}
$('interact').onclick=action;$('guide').onclick=toggle;$('view').onclick=()=>high=!high;
$('mode').onchange=e=>{const was=mode;mode=e.target.value;if(pos.y>.6||!roadOK(pos.x,pos.z)){mode=was;e.target.value=was;$('note').textContent='此处空间不足，请在停车点或主路换乘。';return}auto=false;velocity=0;car.visible=mode!=='步行';for(const [id,obj] of Object.entries(models))obj.visible=id===mode;plan()};
for(const [key,label] of Object.entries({bridge:'中桥升起',clear:'低桥清障',tide:'涨潮',rain:'降雨',night:'夜间'})){const el=document.createElement('label');el.innerHTML='<input type="checkbox"> '+label;el.firstChild.dataset.flag=key;el.firstChild.onchange=e=>{const was=state[key];state[key]=e.target.checked;
if((boatGoal&&key==='tide'&&state.tide)||!roadOK(pos.x,pos.z)){state[key]=was;e.target.checked=was;$('note').textContent='当前占用该路段，请先驶离再切换状态。';return}
plan();surfaces.syncState?.(state);surfaces.setWet?.(state.rain);surfaces.water.position.y=state.tide?-.09:-.45;surfaces.asphalt.roughness=state.rain?.35:.78;scene.fog.density=state.rain?.004:.0024;sun.intensity=state.night?.16:2.1;light.intensity=state.night?.32:1.03;scene.backgroundIntensity=state.night?.035:.66;scene.environmentIntensity=state.night?.11:.64;scene.fog.color.set(state.night?0x202d39:0xa4b2b0)};$('flags').append(el)}
document.querySelectorAll('select').forEach(select=>select.addEventListener('change',()=>select.blur()));
onkeydown=e=>{if(e.target.tagName==='SELECT')return;if(e.code==='Space')e.preventDefault();keys.add(e.code);if(e.repeat)return;if(e.code==='KeyH'&&!finished&&['卡车','轿车','摩托'].includes(mode)){soundscape.horn();const {radius,count}=crowd.horn(pos.x,pos.z,state.rain);$('note').textContent='鸣笛 · 传播 '+radius+' m · '+(count?count+' 名感染者向声源靠近。':'附近无人响应。')}if(e.code==='KeyE')action();if(e.code==='KeyG')toggle();if(e.code==='KeyC')high=!high;if(['KeyW','KeyS','KeyA','KeyD','Space'].includes(e.code))auto=false};onkeyup=e=>keys.delete(e.code);onblur=()=>{keys.clear();velocity=0};
function roadOK(x,z){if(mode==='步行'&&(onPioneerWalk(x,z)||onCorridorSidewalk(x,z)))return true;return edges.some(e=>{if(!open(e,mode))return false;const p=offset(x,z,e);const half=roadWidth(e)/2;if(p.d>half)return false;if(e.gap<4&&Math.abs(p.t-.5)*e.length<2.8&&p.d>e.gap/2)return false;return true})}
function drive(dt){
 if(lift.active){lift.step(dt,pos);heading+=(Number(keys.has('KeyA'))-Number(keys.has('KeyD')))*dt*1.5;if(!lift.active){sideTrips.resume();$('mode').disabled=false;$('note').textContent='已回到塔底，继续撤离任务。';plan();ui()}return}
 let cap=mode==='划船'?6:mode==='步行'?5:mode==='卡车'?19:27;if(state.rain)cap*=.82;
 if(auto){let budget=cap*dt;velocity=cap;while(path.length&&budget>0){const [x,z]=path[0],dx=x-pos.x,dz=z-pos.z,d=Math.hypot(dx,dz);if(d>.01)heading=Math.atan2(dx,dz);if(d<=budget){pos.set(x,pos.y,z);budget-=d;path.shift()}else{pos.x+=dx/d*budget;pos.z+=dz/d*budget;budget=0}}if(!path.length){auto=false;velocity=0;$('note').textContent='已到达。按 E 或点击互动按钮。'}}
 else{const throttle=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));velocity=T.MathUtils.clamp(velocity+(keys.has('Space')?0:throttle)*dt*9,mode==='步行'?-2:-6,cap);if(!throttle||keys.has('Space'))velocity=T.MathUtils.damp(velocity,0,keys.has('Space')?(state.rain?4.2:7):.85,dt);heading+=(Number(keys.has('KeyA'))-Number(keys.has('KeyD')))*dt*(mode==='步行'?2.1:1.7*Math.min(1,Math.abs(velocity)/3)*Math.sign(velocity));const x=pos.x+Math.sin(heading)*velocity*dt,z=pos.z+Math.cos(heading)*velocity*dt;if(roadOK(x,z)&&Math.abs(heightAt(x,z,mode,pos.y)-pos.y)<.60)pos.set(x,pos.y,z);else velocity=0}
 pos.y=heightAt(pos.x,pos.z,mode,pos.y);distance+=Math.abs(velocity)*dt;car.position.copy(pos);if(boatGoal)car.position.y=surfaces.water.position.y+.22;car.rotation.y=heading
}
const renderMap=minimap(document.getElementById("map"));
function drawMap(){renderMap(pos,heading,mode,path,targetPoint())}
plan();ui();$('note').textContent='在门前领取车钥匙，然后驶往消防站。';camera.position.set(286,6,1817);
const post=pipeline(renderer,scene,camera);
$('quiet').onchange=()=>{soundscape.mute($('quiet').checked);audio.mute($('quiet').checked)};
$('quality').onchange=()=>{const low=$('quality').value==='low',ratio=low?.8:Math.min(devicePixelRatio,1.4);renderer.setPixelRatio(ratio);renderer.shadowMap.enabled=!low;post.quality(ratio,!low);post.resize(innerWidth,innerHeight)};
import {reviewShots,stationViews} from './review-shots.js';
import {southernViews} from './south-district.js';
const shot=reviewShots[reviewParams.get('review')]??stationViews[reviewParams.get('review')]??southernViews[reviewParams.get('review')];if(shot){if(Number.isFinite(shot[2])){camera.fov=shot[2];camera.updateProjectionMatrix()}if(shot===reviewShots.overview){scene.fog.density=.00045;Object.assign(sun.shadow.camera,{left:-156,right:156,top:156,bottom:-156,far:440});sun.shadow.camera.updateProjectionMatrix();camera.near=15;camera.updateProjectionMatrix();}document.body.classList.add('review');if(shot===reviewShots.home){pos.set(275,0,1810);heading=Math.PI/2}else{pos.set(shot[0][0],0,shot[0][2]);car.visible=false}}
let last=performance.now(),timer=0;renderer.setAnimationLoop(now=>{const dt=Math.min((now-last)/1000,.1);last=now;elapsed+=dt;drive(dt);const crowdMessage=crowd.update(pos.x,pos.z,dt);if(crowdMessage&&!finished)$('note').textContent=crowdMessage;const sin=Math.sin(heading),cos=Math.cos(heading);camGoal.set(pos.x-sin*(high?27:10),pos.y+(high?38:4.7),pos.z-cos*(high?27:10));if(mode==='步行'&&!high)camGoal.set(pos.x,pos.y+1.68,pos.z);camera.position.lerp(camGoal,1-Math.exp(-dt*4));aim.set(pos.x+sin*5,pos.y+(mode==='步行'?1.65:1.2),pos.z+cos*5);camera.lookAt(aim);if(shot){camera.position.fromArray(shot[0]);camera.lookAt(...shot[1])}const streetLight=(state.rain||state.night||yardReview)?0:Math.max(0,1-Math.max(0,Math.abs(pos.x-949)-97,Math.abs(pos.z-1280)-22)/70);
if(!yardReview&&!state.night){sun.intensity=2.1+streetLight*.75;light.intensity=1.03-streetLight*.37;scene.environmentIntensity=.64-streetLight*.15;if(shot!==reviewShots.overview)scene.fog.density=state.rain?.004:.0024-streetLight*.00094;}
sun.position.set(pos.x-56,101-streetLight*44,pos.z+(shot===reviewShots.overview?-41:47)-streetLight*120);sun.target.position.copy(pos);env?.update?.(camera.position);updateWeather(camera.position,elapsed,state.rain);soundscape.update(pos.x,pos.z,state.rain);updateLights(state.night||(pos.x>775&&pos.x<781&&pos.z>1310&&pos.z<1550),mode);audio.update(velocity,boatGoal?'步行':mode);post.render();timer+=dt;if(timer>.25){window.demoMetrics={drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,environmentReady:!!env};timer=0;if(!auto)plan();drawMap();ui()}});
onresize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);post.resize(innerWidth,innerHeight)};
const art=import.meta.glob('./environment.js');if(art['./environment.js'])art['./environment.js']().then(m=>m.buildEnvironment(scene,layout)).then(e=>{env=e;env.setPower?.(yardReview?reviewParams.get('power')==='on':phase>=5)}).catch(console.error);







